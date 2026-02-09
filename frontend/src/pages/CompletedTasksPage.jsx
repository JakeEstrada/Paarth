import { useState, useEffect, useMemo } from 'react';
import {
  Typography,
  Container,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Divider,
} from '@mui/material';
import { 
  CheckCircle as CheckCircleIcon,
  Event as EventIcon,
  SwapHoriz as SwapHorizIcon,
  Schedule as ScheduleIcon,
  AddCircle as AddCircleIcon,
} from '@mui/icons-material';
import { format, subDays, addDays } from 'date-fns';
import api from '../utils/axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Helper function to get week range (Friday - Thursday)
const getWeekRange = (date) => {
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();
  
  let daysToSubtract;
  if (dayOfWeek === 5) daysToSubtract = 0; // Friday
  else if (dayOfWeek === 6) daysToSubtract = 1; // Saturday
  else if (dayOfWeek === 0) daysToSubtract = 2; // Sunday
  else if (dayOfWeek === 1) daysToSubtract = 3; // Monday
  else if (dayOfWeek === 2) daysToSubtract = 4; // Tuesday
  else if (dayOfWeek === 3) daysToSubtract = 5; // Wednesday
  else daysToSubtract = 6; // Thursday
  
  const weekStart = subDays(dateObj, daysToSubtract);
  const weekEnd = addDays(weekStart, 6); // Thursday
  
  return {
    start: weekStart,
    end: weekEnd,
    key: `${format(weekStart, 'yyyy-MM-dd')}_${format(weekEnd, 'yyyy-MM-dd')}`,
    label: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`
  };
};

function CompletedTasksPage() {
  const [allTasks, setAllTasks] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [allActivities, setAllActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeekKey, setSelectedWeekKey] = useState(null);
  const [availableWeeks, setAvailableWeeks] = useState([]);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [tasksResponse, appointmentsResponse] = await Promise.all([
        api.get(`/tasks/completed`),
        api.get(`/appointments/completed`)
      ]);
      
      // Flatten tasks from month groups
      const tasks = [];
      (tasksResponse.data || []).forEach(group => {
        group.tasks.forEach(task => tasks.push(task));
      });
      setAllTasks(tasks);
      
      const appointmentsData = appointmentsResponse.data.appointments || appointmentsResponse.data || [];
      setAllAppointments(appointmentsData);
      
      // Fetch ALL activities - fetch without limit to get everything
      try {
        const activitiesResponse = await api.get(`/activities/recent`);
        const activities = activitiesResponse.data || [];
        setAllActivities(activities);
        console.log(`Fetched ${activities.length} total activities`);
        
        // Debug: Count by type
        const typeCounts = {};
        activities.forEach(act => {
          typeCounts[act.type] = (typeCounts[act.type] || 0) + 1;
        });
        console.log('Activity types:', typeCounts);
      } catch (error) {
        console.error('Error fetching activities:', error);
        console.error('Error response:', error.response?.data);
        toast.error('Failed to load activities. Check console for details.');
        setAllActivities([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load completed items');
    } finally {
      setLoading(false);
    }
  };

  // Get all available weeks from all data sources
  const allWeeks = useMemo(() => {
    const weekMap = new Map();
    
    // Add weeks from tasks
    allTasks.forEach(task => {
      const date = task.completedAt || task.createdAt;
      if (date) {
        const weekRange = getWeekRange(date);
        if (!weekMap.has(weekRange.key)) {
          weekMap.set(weekRange.key, weekRange);
        }
      }
    });
    
    // Add weeks from appointments
    allAppointments.forEach(appointment => {
      const date = appointment.completedAt || appointment.date || appointment.createdAt;
      if (date) {
        const weekRange = getWeekRange(date);
        if (!weekMap.has(weekRange.key)) {
          weekMap.set(weekRange.key, weekRange);
        }
      }
    });
    
    // Add weeks from activities
    allActivities.forEach(activity => {
      const date = activity.createdAt;
      if (date) {
        const weekRange = getWeekRange(date);
        if (!weekMap.has(weekRange.key)) {
          weekMap.set(weekRange.key, weekRange);
        }
      }
    });
    
    const weeks = Array.from(weekMap.values()).sort((a, b) => {
      return b.start - a.start; // Most recent first
    });
    
    return weeks;
  }, [allTasks, allAppointments, allActivities]);

  // Set default selected week to most recent
  useEffect(() => {
    if (allWeeks.length > 0 && !selectedWeekKey) {
      setSelectedWeekKey(allWeeks[0].key);
    }
  }, [allWeeks, selectedWeekKey]);

  // Get selected week data
  const selectedWeek = useMemo(() => {
    return allWeeks.find(w => w.key === selectedWeekKey);
  }, [allWeeks, selectedWeekKey]);

  // Filter data for selected week
  const weekData = useMemo(() => {
    if (!selectedWeek) return { tasks: [], appointments: [], stageChanges: [], scheduleUpdates: [], jobCreations: [] };
    
    const weekStart = selectedWeek.start;
    const weekEnd = selectedWeek.end;
    weekEnd.setHours(23, 59, 59, 999);
    
    // Filter tasks
    const tasks = allTasks.filter(task => {
      const date = new Date(task.completedAt || task.createdAt);
      return date >= weekStart && date <= weekEnd;
    });
    
    // Filter appointments
    const appointments = allAppointments.filter(appointment => {
      const date = new Date(appointment.completedAt || appointment.date || appointment.createdAt);
      return date >= weekStart && date <= weekEnd;
    });
    
    // Filter stage changes
    const stageChanges = allActivities.filter(activity => {
      if (activity.type !== 'stage_change') return false;
      if (!activity.createdAt) return false;
      const date = new Date(activity.createdAt);
      return date >= weekStart && date <= weekEnd;
    });
    
    // Filter schedule updates (job_scheduled or job_updated with schedule changes)
    const scheduleUpdates = allActivities.filter(activity => {
      if (!activity.createdAt) return false;
      const date = new Date(activity.createdAt);
      if (date < weekStart || date > weekEnd) return false;
      
      if (activity.type === 'job_scheduled') {
        return true;
      }
      // Check if job_updated has schedule-related changes
      if (activity.type === 'job_updated') {
        // Check note for schedule keywords
        if (activity.note && (
          activity.note.toLowerCase().includes('schedule') ||
          activity.note.toLowerCase().includes('start date') ||
          activity.note.toLowerCase().includes('end date') ||
          activity.note.toLowerCase().includes('scheduled')
        )) {
          return true;
        }
        // Check changes map for schedule fields
        if (activity.changes) {
          const changes = activity.changes instanceof Map ? Object.fromEntries(activity.changes) : activity.changes;
          if (changes['schedule.startDate'] || changes['schedule.endDate'] || changes['schedule']) {
            return true;
          }
        }
      }
      return false;
    });
    
    // Filter job creations
    const jobCreations = allActivities.filter(activity => {
      if (activity.type !== 'job_created') return false;
      const date = new Date(activity.createdAt);
      return date >= weekStart && date <= weekEnd;
    });
    
    return { tasks, appointments, stageChanges, scheduleUpdates, jobCreations };
  }, [selectedWeek, allTasks, allAppointments, allActivities]);

  const formatDate = (date) => {
    if (!date) return 'Not set';
    return format(new Date(date), 'MMM dd, yyyy');
  };

  const formatDateTime = (date) => {
    if (!date) return 'Not set';
    return format(new Date(date), 'MMM dd, yyyy h:mm a');
  };

  // Get stage label
  const getStageLabel = (stage) => {
    const stageLabels = {
      'APPOINTMENT_SCHEDULED': 'Appointment Scheduled',
      'ESTIMATE_IN_PROGRESS': 'Estimate In Progress',
      'ESTIMATE_SENT': 'Estimate Sent',
      'ENGAGED_DESIGN_REVIEW': 'Design Review',
      'CONTRACT_OUT': 'Contract Out',
      'DEPOSIT_PENDING': 'Deposit Pending',
      'JOB_PREP': 'Job Prep',
      'TAKEOFF_COMPLETE': 'Takeoff Complete',
      'READY_TO_SCHEDULE': 'Ready to Schedule',
      'SCHEDULED': 'Scheduled',
      'IN_PRODUCTION': 'In Production',
      'INSTALLED': 'Installed',
      'FINAL_PAYMENT_CLOSED': 'Final Payment Closed'
    };
    return stageLabels[stage] || stage;
  };

  return (
    <Box>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h1" sx={{ mb: 1 }}>
                Weekly Activity Log
              </Typography>
              <Typography variant="body1" color="text.secondary">
                View all completed tasks, appointments, stage changes, and schedule updates by week
              </Typography>
            </Box>
            {allWeeks.length > 0 && (
              <FormControl sx={{ minWidth: 250 }}>
                <InputLabel id="week-select-label">Select Week</InputLabel>
                <Select
                  labelId="week-select-label"
                  id="week-select"
                  value={selectedWeekKey || ''}
                  label="Select Week"
                  onChange={(e) => setSelectedWeekKey(e.target.value)}
                >
                  {allWeeks.map((week) => (
                    <MenuItem key={week.key} value={week.key}>
                      Week of {week.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : !selectedWeek ? (
          <Card sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No data available
            </Typography>
          </Card>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Week Summary */}
            <Card sx={{ p: 3, backgroundColor: '#f5f5f5' }}>
              <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
                Week of {selectedWeek.label}
              </Typography>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Chip 
                  label={`${weekData.tasks.length} Completed Tasks`}
                  color="success"
                  icon={<CheckCircleIcon />}
                />
                <Chip 
                  label={`${weekData.appointments.length} Appointments`}
                  color="primary"
                  icon={<EventIcon />}
                />
                <Chip 
                  label={`${weekData.stageChanges.length} Stage Changes`}
                  color="info"
                  icon={<SwapHorizIcon />}
                />
                <Chip 
                  label={`${weekData.scheduleUpdates.length} Schedule Updates`}
                  color="warning"
                  icon={<ScheduleIcon />}
                />
                <Chip 
                  label={`${weekData.jobCreations.length} New Jobs`}
                  color="secondary"
                  icon={<AddCircleIcon />}
                />
              </Box>
            </Card>

            {/* Completed Tasks */}
            {weekData.tasks.length > 0 && (
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <CheckCircleIcon color="success" />
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      Completed Tasks ({weekData.tasks.length})
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {weekData.tasks.map((task) => (
                      <Paper
                        key={task._id}
                        sx={{
                          p: 2,
                          borderLeft: '4px solid #43A047',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                              {task.title}
                            </Typography>
                            {task.description && (
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                {task.description}
                              </Typography>
                            )}
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                              {task.customerId?.name && (
                                <Chip
                                  label={`Customer: ${task.customerId.name}`}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                              {task.jobId?.title && (
                                <Chip
                                  label={`Job: ${task.jobId.title}`}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                              <Chip
                                label={`Completed: ${formatDate(task.completedAt)}`}
                                size="small"
                                sx={{
                                  backgroundColor: '#43A04715',
                                  color: '#43A047',
                                  fontWeight: 600,
                                }}
                              />
                            </Box>
                          </Box>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          Completed by: {task.completedBy?.name || 'Unknown'} • {formatDateTime(task.completedAt)}
                        </Typography>
                      </Paper>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Completed Appointments */}
            {weekData.appointments.length > 0 && (
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <EventIcon color="primary" />
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      Completed Appointments ({weekData.appointments.length})
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {weekData.appointments.map((appointment) => (
                      <Paper
                        key={appointment._id}
                        sx={{
                          p: 2,
                          borderLeft: '4px solid #1976D2',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                              {appointment.title}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1 }}>
                              <Typography variant="body2" color="text.secondary">
                                📅 {formatDate(appointment.date)}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                🕐 {appointment.time}
                              </Typography>
                              {appointment.customerId?.name && (
                                <Chip
                                  label={appointment.customerId.name}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                              <Chip
                                label={appointment.status === 'completed' ? 'Completed' : appointment.status}
                                size="small"
                                sx={{
                                  backgroundColor: appointment.status === 'completed' ? '#43A04715' : '#F57C0015',
                                  color: appointment.status === 'completed' ? '#43A047' : '#F57C00',
                                }}
                              />
                            </Box>
                          </Box>
                        </Box>
                        {appointment.completedAt && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            Completed: {formatDateTime(appointment.completedAt)}
                          </Typography>
                        )}
                      </Paper>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Stage Changes */}
            {weekData.stageChanges.length > 0 && (
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <SwapHorizIcon color="info" />
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      Stage Changes ({weekData.stageChanges.length})
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {weekData.stageChanges.map((activity) => (
                      <Paper
                        key={activity._id}
                        sx={{
                          p: 2,
                          borderLeft: '4px solid #0288D1',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                              {activity.jobId?.title || 'Unknown Job'}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                              {activity.fromStage && (
                                <Chip
                                  label={getStageLabel(activity.fromStage)}
                                  size="small"
                                  variant="outlined"
                                  sx={{ textDecoration: 'line-through', opacity: 0.7 }}
                                />
                              )}
                              <Typography variant="body2" color="text.secondary">→</Typography>
                              {activity.toStage && (
                                <Chip
                                  label={getStageLabel(activity.toStage)}
                                  size="small"
                                  sx={{
                                    backgroundColor: '#0288D115',
                                    color: '#0288D1',
                                    fontWeight: 600,
                                  }}
                                />
                              )}
                              {activity.customerId?.name && (
                                <Chip
                                  label={activity.customerId.name}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                            </Box>
                            {activity.note && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                {activity.note}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          {activity.createdBy?.name || 'Unknown'} • {formatDateTime(activity.createdAt)}
                        </Typography>
                      </Paper>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Schedule Updates */}
            {weekData.scheduleUpdates.length > 0 && (
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <ScheduleIcon color="warning" />
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      Schedule Updates ({weekData.scheduleUpdates.length})
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {weekData.scheduleUpdates.map((activity) => (
                      <Paper
                        key={activity._id}
                        sx={{
                          p: 2,
                          borderLeft: '4px solid #F57C00',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                              {activity.jobId?.title || 'Unknown Job'}
                            </Typography>
                            {activity.note && (
                              <Typography variant="body2" color="text.secondary">
                                {activity.note}
                              </Typography>
                            )}
                            {activity.customerId?.name && (
                              <Chip
                                label={activity.customerId.name}
                                size="small"
                                variant="outlined"
                                sx={{ mt: 1 }}
                              />
                            )}
                          </Box>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          {activity.createdBy?.name || 'Unknown'} • {formatDateTime(activity.createdAt)}
                        </Typography>
                      </Paper>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Job Creations */}
            {weekData.jobCreations.length > 0 && (
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <AddCircleIcon color="secondary" />
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      New Jobs Created ({weekData.jobCreations.length})
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {weekData.jobCreations.map((activity) => (
                      <Paper
                        key={activity._id}
                        sx={{
                          p: 2,
                          borderLeft: '4px solid #9C27B0',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                              {activity.jobId?.title || 'New Job'}
                            </Typography>
                            {activity.note && (
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                {activity.note}
                              </Typography>
                            )}
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              {activity.customerId?.name && (
                                <Chip
                                  label={`Customer: ${activity.customerId.name}`}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                              {activity.jobId && (
                                <Chip
                                  label="New Job Card"
                                  size="small"
                                  sx={{
                                    backgroundColor: '#9C27B015',
                                    color: '#9C27B0',
                                    fontWeight: 600,
                                  }}
                                />
                              )}
                            </Box>
                          </Box>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          Created by: {activity.createdBy?.name || 'Unknown'} • {formatDateTime(activity.createdAt)}
                        </Typography>
                      </Paper>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {weekData.tasks.length === 0 && 
             weekData.appointments.length === 0 && 
             weekData.stageChanges.length === 0 && 
             weekData.scheduleUpdates.length === 0 &&
             weekData.jobCreations.length === 0 && (
              <Card sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary">
                  No activity for this week
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Select a different week to view activity
                </Typography>
              </Card>
            )}
          </Box>
        )}
      </Container>
    </Box>
  );
}

export default CompletedTasksPage;
