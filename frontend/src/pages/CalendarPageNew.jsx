import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  CircularProgress,
  Card,
  CardContent,
  Menu,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
  Autocomplete,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Today as TodayIcon,
  CheckCircle as CheckCircleIcon,
  DragIndicator as DragIndicatorIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, startOfWeek, endOfWeek, isSameDay, addDays } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import JobDetailModal from '../components/jobs/JobDetailModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CALENDAR_HIDDEN_WEEKDAYS_KEY = 'calendarHiddenWeekdays';
const CALENDAR_BENCH_POSITION_KEY = 'calendarBenchPosition';

// Default installer order used for calendar lanes and suggestions
const DEFAULT_INSTALLER_ORDER = [
  'Nick',
  'Ed',
  'Eder',
  'Daniel',
  'Moris',
  'Hayden'
];

// Event creation/edit modal
function EventModal({ open, onClose, selectedDate, job, onSave, onViewJob, installerOptions = [] }) {
  const [formData, setFormData] = useState({
    title: '',
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '17:00',
    allDay: true,
    recurrence: 'none', // none, daily, weekly, monthly, yearly
    recurrenceCount: 1,
    description: '',
    jobId: null,
    color: '#1976D2', // Default blue
    installer: '', // Installer name
  });
  const [availableJobs, setAvailableJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      // Set default dates from selected date or job
      const date = selectedDate || (job?.schedule?.startDate ? new Date(job.schedule.startDate) : new Date());
      const dateStr = format(date, 'yyyy-MM-dd');
      
      setFormData({
        title: job?.schedule?.title || job?.title || '',
        startDate: dateStr,
        startTime: '09:00',
        endDate: job?.schedule?.endDate ? format(new Date(job.schedule.endDate), 'yyyy-MM-dd') : dateStr,
        endTime: '17:00',
        allDay: true,
        recurrence: job?.schedule?.recurrence?.type || 'none',
        recurrenceCount: job?.schedule?.recurrence?.count || 1,
        description: job?.customerId?.name ? `Customer: ${job.customerId.name}` : '',
        jobId: job?._id || null,
        color: job?.color || '#1976D2',
        installer: job?.schedule?.installer || '',
      });

      // Fetch available jobs
      fetchAvailableJobs();
    }
  }, [open, selectedDate, job]);

  const fetchAvailableJobs = async () => {
    try {
      const response = await axios.get(`${API_URL}/jobs`);
      const jobs = response.data.jobs || response.data || [];
      setAvailableJobs(jobs.filter(j => !j.isArchived && !j.isDeadEstimate));
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  // Fuzzy match: every character of `query` appears in order in `str` (case-insensitive)
  const fuzzyMatch = (query, str) => {
    if (!query || !str) return true;
    const q = query.toLowerCase().trim();
    const s = String(str).toLowerCase();
    let i = 0;
    for (let j = 0; j < s.length && i < q.length; j++) {
      if (s[j] === q[i]) i++;
    }
    return i === q.length;
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    try {
      setLoading(true);

      // If jobId is selected, update the job's schedule
      if (formData.jobId) {
        const startDateTime = formData.allDay 
          ? new Date(formData.startDate + 'T00:00:00')
          : new Date(formData.startDate + 'T' + formData.startTime);
        const endDateTime = formData.allDay
          ? new Date(formData.endDate + 'T23:59:59')
          : new Date(formData.endDate + 'T' + formData.endTime);

        await axios.patch(`${API_URL}/jobs/${formData.jobId}`, {
          schedule: {
            startDate: startDateTime.toISOString(),
            endDate: endDateTime.toISOString(),
            installer: formData.installer,
            recurrence: {
              type: formData.recurrence,
              interval: 1,
              count: formData.recurrenceCount,
            },
          },
          stage: 'SCHEDULED',
          color: formData.color,
        });

        toast.success('Job scheduled successfully');

        // Sync to Google Calendar (optional; do not block on failure)
        try {
          await axios.post(`${API_URL}/calendar/jobs/${formData.jobId}/sync`);
        } catch (calendarError) {
          const status = calendarError.response?.status;
          const data = calendarError.response?.data;
          const msg = (data && (data.error || data.message)) || calendarError.message;
          if (status === 503 || (typeof msg === 'string' && (msg.includes('not configured') || msg.includes('sync failed')))) {
            toast('Saved. Google Calendar sync skipped.', { icon: 'ℹ️' });
          } else {
            toast('Saved. Google Calendar sync failed.', { icon: 'ℹ️' });
          }
        }
      } else {
        // Create a standalone calendar event (could be stored separately)
        toast.info('Standalone events coming soon');
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving event:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to save event';
      console.error('Error details:', {
        message: errorMessage,
        status: error.response?.status,
        data: error.response?.data
      });
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };


  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          m: { xs: 1, sm: 2 },
          maxHeight: { xs: '95vh', sm: '90vh' },
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <span>{job ? 'Edit Event' : 'Create Event'}</span>
        {(job || formData.jobId) && onViewJob && (
          <Button
            size="small"
            startIcon={<PersonIcon />}
            onClick={() => {
              const id = formData.jobId || job?._id;
              if (id) {
                onViewJob(id);
                onClose();
              }
            }}
          >
            View job
          </Button>
        )}
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            fullWidth
            required
          />

          <Autocomplete
            options={availableJobs}
            value={availableJobs.find(j => j._id === formData.jobId) || null}
            onChange={(_, newValue) => {
              const selectedJob = newValue;
              setFormData({
                ...formData,
                jobId: selectedJob?._id || null,
                title: selectedJob?.schedule?.title || selectedJob?.title || formData.title,
                color: selectedJob?.color || formData.color,
              });
            }}
            getOptionLabel={(j) => (j && j.title) ? `${j.title} - ${j.customerId?.name || 'Unknown'}` : ''}
            filterOptions={(options, { inputValue }) => {
              const q = inputValue.trim();
              if (!q) return options;
              return options.filter(j => fuzzyMatch(q, `${j.title} ${j.customerId?.name || ''}`));
            }}
            renderInput={(params) => (
              <TextField {...params} label="Job (Optional)" placeholder="Type to search jobs..." />
            )}
            isOptionEqualToValue={(option, value) => option?._id === value?._id}
          />

          <Autocomplete
            freeSolo
            options={installerOptions}
            value={formData.installer || ''}
            onChange={(_, newValue) => {
              setFormData({ ...formData, installer: newValue || '' });
            }}
            inputValue={formData.installer || ''}
            onInputChange={(_, newInputValue) => {
              setFormData({ ...formData, installer: newInputValue || '' });
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Installer"
                fullWidth
              />
            )}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <input
              type="checkbox"
              checked={formData.allDay}
              onChange={(e) => setFormData({ ...formData, allDay: e.target.checked })}
              id="allDay"
            />
            <label htmlFor="allDay">All day</label>
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Start Date"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            {!formData.allDay && (
              <TextField
                label="Start Time"
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="End Date"
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            {!formData.allDay && (
              <TextField
                label="End Time"
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            )}
          </Box>

          <FormControl fullWidth>
            <InputLabel>Repeat</InputLabel>
            <Select
              value={formData.recurrence}
              onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
              label="Repeat"
            >
              <MenuItem value="none">Does not repeat</MenuItem>
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>

          {formData.recurrence !== 'none' && (
            <TextField
              label="Number of occurrences"
              type="number"
              value={formData.recurrenceCount}
              onChange={(e) => setFormData({ ...formData, recurrenceCount: parseInt(e.target.value) || 1 })}
              fullWidth
              inputProps={{ min: 1, max: 365 }}
            />
          )}

          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            fullWidth
            multiline
            rows={3}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" sx={{ minWidth: 100 }}>
              Color:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: 1 }}>
              {[
                { name: 'Blue', value: '#1976D2' },
                { name: 'Green', value: '#4CAF50' },
                { name: 'Orange', value: '#FF9800' },
                { name: 'Red', value: '#F44336' },
                { name: 'Purple', value: '#9C27B0' },
                { name: 'Teal', value: '#009688' },
                { name: 'Pink', value: '#E91E63' },
                { name: 'Brown', value: '#795548' },
                { name: 'Navy', value: '#1565C0' },
                { name: 'Cyan', value: '#00BCD4' },
                { name: 'Lime', value: '#8BC34A' },
                { name: 'Amber', value: '#FFC107' },
                { name: 'Deep Orange', value: '#FF5722' },
                { name: 'Indigo', value: '#3F51B5' },
                { name: 'Deep Purple', value: '#673AB7' },
                { name: 'Blue Grey', value: '#607D8B' },
                { name: 'Grey', value: '#9E9E9E' },
                { name: 'Maroon', value: '#880E4F' },
                { name: 'Forest', value: '#2E7D32' },
              ].map((colorOption) => (
                <Box
                  key={colorOption.value}
                  onClick={() => setFormData({ ...formData, color: colorOption.value })}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: colorOption.value,
                    cursor: 'pointer',
                    border: formData.color === colorOption.value ? '3px solid #000' : '2px solid #ccc',
                    boxShadow: formData.color === colorOption.value ? '0 0 0 2px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'scale(1.1)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    },
                  }}
                  title={colorOption.name}
                />
              ))}
            </Box>
            <TextField
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              sx={{
                width: 60,
                height: 40,
                '& input': {
                  cursor: 'pointer',
                  padding: 0,
                  border: 'none',
                },
              }}
              title="Custom color"
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {job && (
          <Button 
            onClick={async () => {
              if (!window.confirm(`Are you sure you want to remove "${job.title}" from the calendar?`)) {
                return;
              }
              try {
                setLoading(true);
                await axios.patch(`${API_URL}/jobs/${job._id}`, {
                  schedule: {
                    startDate: null,
                    endDate: null
                  },
                  stage: 'READY_TO_SCHEDULE',
                });

                // Remove from Google Calendar if synced
                try {
                  await axios.delete(`${API_URL}/calendar/jobs/${job._id}/sync`);
                } catch (calendarError) {
                  console.warn('Google Calendar removal failed:', calendarError);
                }

                toast.success('Job removed from calendar');
                onSave();
                onClose();
              } catch (error) {
                console.error('Error removing job from calendar:', error);
                toast.error('Failed to remove job from calendar');
              } finally {
                setLoading(false);
              }
            }}
            color="error"
            disabled={loading}
            startIcon={<DeleteIcon />}
          >
            Remove from Calendar
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Calendar Day Component
function CalendarDay({ date, isCurrentMonth, events, onDayClick, onEventClick, onEventDelete, onViewJob, onDayContextMenu, installerOrder }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuEvent, setContextMenuEvent] = useState(null);
  // First, get all events that fall on this calendar day
  const eventsForDate = events.filter(e => {
    if (!e.schedule?.startDate) return false;
    const startDate = new Date(e.schedule.startDate);
    const endDate = e.schedule.endDate ? new Date(e.schedule.endDate) : startDate;
    
    // Check if date falls within the event range
    const dateStr = format(date, 'yyyy-MM-dd');
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');
    
    return dateStr >= startStr && dateStr <= endStr;
  })
  // Keep rows visually aligned across days by installer “lane”
  // We support up to 5 horizontal “sections” per day:
  // 4 dedicated installer lanes + 1 “Other” lane.
  const primaryInstallers = installerOrder.slice(0, 4);
  const laneInstallers = [...primaryInstallers, '__OTHER__']; // 5th lane for everything else

  // 1. For each lane, pick at most one event for that lane.
  const laneEvents = laneInstallers.map((installerKey) => {
    if (installerKey === '__OTHER__') {
      // First event whose installer is NOT one of the primary installers
      const match = eventsForDate.find((e) => {
        const name = e.schedule?.installer || '';
        return !primaryInstallers.includes(name);
      });
      return match || null;
    }
    const match = eventsForDate.find(
      (e) => (e.schedule?.installer || '') === installerKey
    );
    return match || null;
  });

  // 2. Count any remaining “other” events for a small "+N more" indicator in the bottom lane.
  const extraOtherEventsCount = eventsForDate.filter((e) => {
    const name = e.schedule?.installer || '';
    const isPrimary = primaryInstallers.includes(name);
    const isInOtherLane =
      !isPrimary &&
      laneEvents[laneEvents.length - 1] &&
      laneEvents[laneEvents.length - 1]._id === e._id;
    return !isPrimary && !isInOtherLane;
  }).length;

  const handleContextMenu = (e, event) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: e.clientX + 2,
            mouseY: e.clientY - 6,
          }
        : null
    );
    setContextMenuEvent(event);
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
    setContextMenuEvent(null);
  };

  const handleDelete = () => {
    if (contextMenuEvent && onEventDelete) {
      onEventDelete(contextMenuEvent);
    }
    handleCloseContextMenu();
  };

  return (
    <>
      <Paper
        sx={{
          width: '100%',
          height: '100%',
          p: 0.5,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: isCurrentMonth 
            ? theme.palette.background.paper 
            : (theme.palette.mode === 'dark' ? '#1A1A1A' : '#fafafa'),
          opacity: isCurrentMonth ? 1 : 0.6,
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          '&:hover': {
            backgroundColor: isCurrentMonth 
              ? (theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5') 
              : (theme.palette.mode === 'dark' ? '#1E1E1E' : '#f0f0f0'),
          },
        }}
        onClick={() => onDayClick(date)}
        onContextMenu={(e) => {
          if (onDayContextMenu) {
            e.preventDefault();
            e.stopPropagation();
            onDayContextMenu(date, e);
          }
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: isToday(date) ? 700 : 500,
            color: isToday(date) ? 'primary.main' : isCurrentMonth ? 'text.primary' : 'text.secondary',
            flexShrink: 0,
            lineHeight: 1.2,
            fontSize: { xs: '0.8rem', sm: '0.9rem' },
          }}
        >
          {format(date, 'd')}
        </Typography>
        
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
          gap: 0,
          justifyContent: 'flex-start',
        }}>
          {laneEvents.map((event, index) => (
            <Box
              key={event?._id || `lane-${index}`}
              sx={{
                flex: '1 1 0',
                minHeight: 0,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                justifyContent: 'flex-start',
              }}
            >
              {event && (
                <Chip
                  label={[event.schedule?.title || event.title, event.schedule?.installer].filter(Boolean).join(' | ')}
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(event);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, event)}
                  sx={{
                    fontSize: { xs: '0.8rem', sm: '0.85rem' },
                    height: 20,
                    maxHeight: '100%',
                    maxWidth: '100%',
                    backgroundColor: event.color || '#1976D2',
                    color: 'white',
                    flexShrink: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    '&.MuiChip-root': { py: 0, px: 0 },
                    '& .MuiChip-label': {
                      px: 0.75,
                      py: 0,
                      lineHeight: 1.25,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                    '&:hover': { opacity: 0.8 },
                  }}
                />
              )}
              {index === laneEvents.length - 1 && extraOtherEventsCount > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.25, fontSize: '0.6rem', flexShrink: 0 }}>
                  +{extraOtherEventsCount} more
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Paper>
      
      {/* Context Menu */}
      {contextMenuEvent && (
        <Menu
          open={contextMenu !== null}
          onClose={handleCloseContextMenu}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenu !== null
              ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
              : undefined
          }
        >
          {onViewJob && contextMenuEvent?._id && (
            <MenuItem
              onClick={() => {
                onViewJob(contextMenuEvent._id);
                handleCloseContextMenu();
              }}
            >
              <ListItemIcon>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>View job</ListItemText>
            </MenuItem>
          )}
          <MenuItem onClick={handleDelete}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Remove from Calendar</ListItemText>
          </MenuItem>
        </Menu>
      )}
    </>
  );
}

// Bench Job Card Component
function BenchJobCard({ job, onJobClick, onViewJob, onRemoveFromBench }) {
  const jobTotal = job.valueEstimated || job.valueTotal || 0;
  const defaultDuration = Math.max(1, Math.floor(jobTotal / 2000));

  return (
    <Card
      sx={{
        cursor: 'pointer',
        borderLeft: `4px solid ${job.color || '#1976D2'}`,
        minWidth: 150,
        maxWidth: 180,
        position: 'relative',
        '&:hover': {
          boxShadow: 2,
          transform: 'translateY(-1px)',
          transition: 'all 0.2s',
        },
      }}
      onClick={() => onJobClick(job)}
    >
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontSize: '0.85rem',
                mb: 0.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={job.title}
            >
              {job.title}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <Box
                component="span"
                sx={{
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {job.customerId?.name || 'Unknown'}
              </Box>
              <Box component="span" sx={{ flexShrink: 0, opacity: 0.8 }}>
                | {defaultDuration} days
              </Box>
            </Typography>
          </Box>
          {onViewJob && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onViewJob(job._id);
              }}
              title="View job (customer & details)"
              sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
            >
              <PersonIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
          {onRemoveFromBench && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromBench(job);
              }}
              title="Remove from bench (move to dead estimates)"
              sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
            >
              <DeleteIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

// Scheduled Job Card Component (with green checkmark)
function ScheduledJobCard({ job, onJobClick, onJobDelete, onViewJob }) {
  const jobTotal = job.valueEstimated || job.valueTotal || 0;
  const defaultDuration = Math.max(1, Math.floor(jobTotal / 2000));

  return (
    <Card
      sx={{
        borderLeft: `4px solid ${job.color || '#4caf50'}`,
        minWidth: 150,
        maxWidth: 180,
        position: 'relative',
        '&:hover': {
          boxShadow: 2,
          transform: 'translateY(-1px)',
          transition: 'all 0.2s',
        },
      }}
    >
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 18 }} />
          <Box 
            sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            onClick={() => onJobClick(job)}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {defaultDuration} days
            </Typography>
          </Box>
          {onViewJob && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onViewJob(job._id);
              }}
              title="View job (customer & details)"
              sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
            >
              <PersonIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
          {onJobDelete && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onJobDelete(job);
              }}
              sx={{
                padding: 0.5,
                '&:hover': {
                  backgroundColor: 'error.light',
                  color: 'error.main',
                },
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

function CalendarPageNew() {
  const theme = useTheme();
  const { canModifyCalendar, canViewCalendar } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [currentDate, setCurrentDate] = useState(new Date());
  const [benchJobs, setBenchJobs] = useState([]);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobIdForDetailModal, setJobIdForDetailModal] = useState(null);
  const [benchHeight, setBenchHeight] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  const [isBenchMinimized, setIsBenchMinimized] = useState(false);
  const [installerOrder, setInstallerOrder] = useState(DEFAULT_INSTALLER_ORDER);

  const [benchPosition, setBenchPosition] = useState(() => {
    try {
      const stored = localStorage.getItem(CALENDAR_BENCH_POSITION_KEY);
      if (stored === 'top' || stored === 'right' || stored === 'bottom') return stored;
    } catch (_) {}
    return 'bottom';
  });
  const [benchWidth, setBenchWidth] = useState(320);

  useEffect(() => {
    try {
      localStorage.setItem(CALENDAR_BENCH_POSITION_KEY, benchPosition);
    } catch (_) {}
  }, [benchPosition]);

  const [hiddenWeekdays, setHiddenWeekdays] = useState(() => {
    try {
      const stored = localStorage.getItem(CALENDAR_HIDDEN_WEEKDAYS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((d) => d >= 0 && d <= 6) : [];
      }
    } catch (_) {}
    return [];
  });
  const [dayContextMenu, setDayContextMenu] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(CALENDAR_HIDDEN_WEEKDAYS_KEY, JSON.stringify(hiddenWeekdays));
    } catch (_) {}
  }, [hiddenWeekdays]);

  useEffect(() => {
    fetchJobs();
  }, [currentDate]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/jobs`);
      const allJobs = response.data.jobs || response.data || [];
      
      // Filter bench jobs (job readiness phase)
      const readinessStages = ['DEPOSIT_PENDING', 'JOB_PREP', 'TAKEOFF_COMPLETE', 'READY_TO_SCHEDULE'];
      const bench = allJobs.filter(job => 
        readinessStages.includes(job.stage) && 
        !job.isArchived && 
        !job.isDeadEstimate
      );
      
      // Filter scheduled jobs
      const scheduled = allJobs.filter(job => {
        const hasSchedule = job.schedule?.startDate;
        const isScheduledStage = job.stage === 'SCHEDULED';
        return (hasSchedule || isScheduledStage) && !job.isArchived && !job.isDeadEstimate;
      });
      
      setBenchJobs(bench);
      setScheduledJobs(scheduled);

      // Update installer order based on any installers used in jobs
      const installerSet = new Set(DEFAULT_INSTALLER_ORDER);
      [...bench, ...scheduled].forEach(job => {
        const name = job.schedule?.installer;
        if (name && typeof name === 'string') {
          installerSet.add(name);
        }
      });
      setInstallerOrder(Array.from(installerSet));
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  // Generate calendar days for a specific month
  const getCalendarDaysForMonth = (date) => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  };

  // Get months: one on mobile, three on desktop
  const months = useMemo(() => {
    if (isMobile) {
      return [currentDate];
    }
    return [
      currentDate,
      addMonths(currentDate, 1),
      addMonths(currentDate, 2),
    ];
  }, [currentDate, isMobile]);

  const handleDayClick = (date) => {
    if (!canModifyCalendar()) {
      toast.error('You do not have permission to create or modify calendar events');
      return;
    }
    setSelectedDate(date);
    setSelectedJob(null);
    setEventModalOpen(true);
  };

  const handleEventClick = (job) => {
    if (!canModifyCalendar()) {
      toast.error('You do not have permission to modify calendar events');
      return;
    }
    setSelectedJob(job);
    setSelectedDate(job.schedule?.startDate ? new Date(job.schedule.startDate) : new Date());
    setEventModalOpen(true);
  };

  const handleEventDelete = async (job) => {
    if (!canModifyCalendar()) {
      toast.error('You do not have permission to modify calendar events');
      return;
    }

    if (!window.confirm(`Are you sure you want to remove "${job.title}" from the calendar?`)) {
      return;
    }

    try {
      await axios.patch(`${API_URL}/jobs/${job._id}`, {
        schedule: {
          startDate: null,
          endDate: null
        },
        stage: 'READY_TO_SCHEDULE',
      });

      // Remove from Google Calendar if synced
      try {
        await axios.delete(`${API_URL}/calendar/jobs/${job._id}/sync`);
      } catch (calendarError) {
        console.warn('Google Calendar removal failed:', calendarError);
      }

      toast.success('Job removed from calendar');
      await fetchJobs();
    } catch (error) {
      console.error('Error removing job from calendar:', error);
      toast.error('Failed to remove job from calendar');
    }
  };

  const handleRemoveFromBench = async (job) => {
    if (!window.confirm(`Remove "${job.title}" from the bench? It will be moved to dead estimates.`)) {
      return;
    }
    try {
      await axios.post(`${API_URL}/jobs/${job._id}/move-to-dead-estimates`);
      toast.success('Job removed from bench');
      await fetchJobs();
    } catch (error) {
      console.error('Error removing job from bench:', error);
      toast.error('Failed to remove job from bench');
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(addMonths(currentDate, -1));
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const visibleWeekdays = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].filter((d) => !hiddenWeekdays.includes(d)),
    [hiddenWeekdays]
  );

  const handleDayContextMenu = (date, e) => {
    e.preventDefault();
    setDayContextMenu({
      left: e.clientX,
      top: e.clientY,
      date,
    });
  };

  const handleCloseDayContextMenu = () => setDayContextMenu(null);

  const toggleWeekdayHidden = (weekday) => {
    setHiddenWeekdays((prev) =>
      prev.includes(weekday) ? prev.filter((d) => d !== weekday) : [...prev, weekday].sort((a, b) => a - b)
    );
    setDayContextMenu(null);
  };

  // Render a single month calendar
  const renderMonth = (monthDate, monthIndex) => {
    const calendarDays = getCalendarDaysForMonth(monthDate);
    const visibleDays = calendarDays.filter((d) => !hiddenWeekdays.includes(d.getDay()));
    const columnCount = visibleWeekdays.length;

    return (
      <Box key={monthIndex} sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Month Header - hide on mobile since it's in the main header */}
        {!isMobile && (
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, textAlign: 'center', fontSize: { xs: '1rem', sm: '1.15rem' } }}>
            {format(monthDate, 'MMMM yyyy')}
          </Typography>
        )}

        {/* Day Headers - only visible weekdays */}
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${columnCount}, 1fr)`, mb: 0, gap: 0 }}>
          {visibleWeekdays.map((dayIndex) => (
            <Paper
              key={dayIndex}
              sx={{
                p: 0.5,
                textAlign: 'center',
                backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5',
                border: `1px solid ${theme.palette.divider}`,
                fontWeight: 600,
              }}
            >
              <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.8rem' }, lineHeight: 1.2 }}>
                {isMobile ? WEEKDAY_LABELS[dayIndex].substring(0, 1) : WEEKDAY_LABELS[dayIndex].substring(0, 3)}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* Calendar Days Grid - only visible weekdays */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
          gridAutoRows: 'auto',
          gap: 0,
          minHeight: 0,
          '& > *': {
            minWidth: 0,
            aspectRatio: '1',
          }
        }}>
          {visibleDays.map((date, index) => (
            <Box key={index} sx={{ width: '100%', minWidth: 0, aspectRatio: '1', display: 'block' }}>
              <CalendarDay
                key={index}
                date={date}
                isCurrentMonth={isSameMonth(date, monthDate)}
                events={scheduledJobs}
                onDayClick={handleDayClick}
                onEventClick={handleEventClick}
                onEventDelete={handleEventDelete}
                onViewJob={(id) => setJobIdForDetailModal(id)}
                onDayContextMenu={handleDayContextMenu}
                installerOrder={installerOrder}
              />
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  const renderCalendarContent = () =>
    loading ? (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    ) : (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1, sm: 1.5 } }}>
        {months.map((monthDate, index) => renderMonth(monthDate, index))}
      </Box>
    );

  const renderBenchPanelContent = (placement) => {
    const isVertical = placement !== 'right';
    const resizeEdge = placement === 'top' ? 'bottom' : placement === 'bottom' ? 'top' : 'left';
    return (
      <>
        {/* Minimize/Expand Button */}
        <Box
          sx={{
            position: 'absolute',
            ...(placement === 'right'
              ? { top: isBenchMinimized ? 0 : 4, right: 4 }
              : { top: isBenchMinimized ? 0 : -3, right: 8 }),
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <IconButton
            onClick={() => {
              setIsBenchMinimized(!isBenchMinimized);
              if (!isBenchMinimized && benchHeight < 150) setBenchHeight(250);
            }}
            size="small"
            sx={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              '&:hover': {
                backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5',
              },
            }}
            title={isBenchMinimized ? 'Expand Bench' : 'Minimize Bench'}
          >
            {isBenchMinimized ? <ExpandMoreIcon /> : <ExpandLessIcon />}
          </IconButton>
        </Box>

        {/* Resize Handle - vertical (top/bottom) or horizontal (right) */}
        {!isBenchMinimized && isVertical && (
          <Box
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsResizing(true);
              const startY = e.clientY;
              const startHeight = benchHeight;
              const handleMouseMove = (moveEvent) => {
                moveEvent.preventDefault();
                const deltaY = placement === 'bottom' ? startY - moveEvent.clientY : moveEvent.clientY - startY;
                const newHeight = Math.max(150, Math.min(600, startHeight + deltaY));
                setBenchHeight(newHeight);
              };
              const handleMouseUp = () => {
                setIsResizing(false);
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              ...(resizeEdge === 'top' ? { top: -3, height: '16px' } : { bottom: -3, height: '16px' }),
              cursor: 'ns-resize',
              backgroundColor: 'transparent',
              zIndex: 10,
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '40px',
                  height: '4px',
                  backgroundColor: '#999',
                  borderRadius: '2px',
                },
              },
            }}
          />
        )}

        {!isBenchMinimized && placement === 'right' && (
          <Box
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const startX = e.clientX;
              const startWidth = benchWidth;
              const handleMouseMove = (moveEvent) => {
                moveEvent.preventDefault();
                const deltaX = startX - moveEvent.clientX;
                const newWidth = Math.max(280, Math.min(600, startWidth + deltaX));
                setBenchWidth(newWidth);
              };
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
            sx={{
              position: 'absolute',
              left: -3,
              top: 0,
              bottom: 0,
              width: '16px',
              cursor: 'ew-resize',
              backgroundColor: 'transparent',
              zIndex: 10,
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '4px',
                  height: '40px',
                  backgroundColor: '#999',
                  borderRadius: '2px',
                },
              },
            }}
          />
        )}

        {isBenchMinimized ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: { xs: 1, sm: 2 },
              py: 1,
              height: '100%',
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5',
              },
            }}
            onClick={() => setIsBenchMinimized(false)}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
              Bench ({benchJobs.length}) • Scheduled ({scheduledJobs.length})
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              Tap to expand
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: placement === 'right' ? 'column' : { xs: 'column', md: 'row' }, gap: { xs: 2, md: 3 }, height: '100%', mt: 1, flexWrap: placement === 'right' ? 'nowrap' : undefined }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Bench ({benchJobs.length})
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                Jobs ready to schedule. Click to schedule on calendar.
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, sm: 2 } }}>
                {benchJobs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No jobs on bench</Typography>
                ) : (
                  benchJobs.map((job) => (
                    <BenchJobCard
                      key={job._id}
                      job={job}
                      onJobClick={(j) => {
                        if (!canModifyCalendar()) { toast.error('You do not have permission to modify calendar events'); return; }
                        setSelectedJob(j); setSelectedDate(new Date()); setEventModalOpen(true);
                      }}
                      onViewJob={(id) => setJobIdForDetailModal(id)}
                      onRemoveFromBench={handleRemoveFromBench}
                    />
                  ))
                )}
              </Box>
            </Box>
            <Box sx={{
              flex: 1,
              minWidth: 0,
              borderLeft: placement === 'right' ? 'none' : { xs: 'none', md: '1px solid #e0e0e0' },
              borderTop: placement === 'right' ? '1px solid #e0e0e0' : { xs: '1px solid #e0e0e0', md: 'none' },
              pl: { xs: 0, md: placement === 'right' ? 0 : 3 },
              pt: { xs: 2, md: 0 },
            }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Scheduled ({scheduledJobs.length})
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                Jobs with scheduled dates. Click to edit.
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, sm: 2 } }}>
                {scheduledJobs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No scheduled jobs</Typography>
                ) : (
                  scheduledJobs.map((job) => (
                    <ScheduledJobCard
                      key={job._id}
                      job={job}
                      onJobClick={(j) => {
                        if (!canModifyCalendar()) { toast.error('You do not have permission to modify calendar events'); return; }
                        setSelectedJob(j); setSelectedDate(j.schedule?.startDate ? new Date(j.schedule.startDate) : new Date()); setEventModalOpen(true);
                      }}
                      onJobDelete={handleEventDelete}
                      onViewJob={(id) => setJobIdForDetailModal(id)}
                    />
                  ))
                )}
              </Box>
            </Box>
          </Box>
        )}
      </>
    );
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ 
        p: { xs: 1, sm: 2 }, 
        borderBottom: '1px solid #e0e0e0', 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: { xs: 1, sm: 0 }
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap' }}>
          <IconButton onClick={handlePrevMonth} size="small">
            <ChevronLeftIcon />
          </IconButton>
          <Typography 
            variant="h5" 
            sx={{ 
              fontWeight: 600, 
              minWidth: { xs: 'auto', sm: 200 }, 
              textAlign: 'center',
              fontSize: { xs: '0.875rem', sm: '1.25rem', md: '1.5rem' }
            }}
          >
            {isMobile 
              ? format(currentDate, 'MMMM yyyy')
              : `${format(currentDate, 'MMMM yyyy')} - ${format(addMonths(currentDate, 2), 'MMMM yyyy')}`
            }
          </Typography>
          <IconButton onClick={handleNextMonth} size="small">
            <ChevronRightIcon />
          </IconButton>
          <Button
            startIcon={<TodayIcon />}
            onClick={handleToday}
            variant="outlined"
            size="small"
            sx={{ display: { xs: 'none', sm: 'flex' } }}
          >
            Today
          </Button>
        </Box>
        {canModifyCalendar() && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setSelectedDate(new Date());
              setSelectedJob(null);
              setEventModalOpen(true);
            }}
            size="small"
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Create Event
          </Button>
        )}
        <FormControl size="small" sx={{ minWidth: 120, display: { xs: 'none', sm: 'flex' } }}>
          <InputLabel>Bench position</InputLabel>
          <Select
            value={benchPosition}
            label="Bench position"
            onChange={(e) => setBenchPosition(e.target.value)}
          >
            <MenuItem value="top">Top</MenuItem>
            <MenuItem value="right">Right</MenuItem>
            <MenuItem value="bottom">Bottom</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Main area: layout depends on bench position */}
      {benchPosition === 'top' && (
        <>
          {/* Bench at top */}
          <Box
            sx={{
              flexShrink: 0,
              backgroundColor: theme.palette.background.paper,
              borderBottom: `3px solid ${theme.palette.divider}`,
              p: isBenchMinimized ? 0 : { xs: 1, sm: 2 },
              height: isBenchMinimized ? '40px' : isMobile ? '200px' : `${benchHeight}px`,
              overflow: isBenchMinimized ? 'hidden' : 'auto',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              transition: 'height 0.3s ease, padding 0.3s ease',
            }}
          >
            {renderBenchPanelContent('top')}
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 0.5, sm: 1 }, minHeight: 0 }}>
            {renderCalendarContent()}
          </Box>
        </>
      )}

      {benchPosition === 'right' && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'hidden' }}>
          <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 0.5, sm: 1 }, minWidth: 0 }}>
            {renderCalendarContent()}
          </Box>
          <Box
            sx={{
              flexShrink: 0,
              width: isBenchMinimized ? 48 : benchWidth,
              backgroundColor: theme.palette.background.paper,
              borderLeft: `3px solid ${theme.palette.divider}`,
              p: isBenchMinimized ? 0 : { xs: 1, sm: 2 },
              overflow: isBenchMinimized ? 'hidden' : 'auto',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              transition: 'width 0.3s ease',
            }}
          >
            {renderBenchPanelContent('right')}
          </Box>
        </Box>
      )}

      {benchPosition === 'bottom' && (
        <>
          <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 0.5, sm: 1 }, minHeight: 0 }}>
            {renderCalendarContent()}
          </Box>
          {/* Bench at bottom - resizable */}
          <Box
            sx={{
              flexShrink: 0,
              backgroundColor: theme.palette.background.paper,
              borderTop: `3px solid ${theme.palette.divider}`,
              p: isBenchMinimized ? 0 : { xs: 1, sm: 2 },
              height: isBenchMinimized ? '40px' : isMobile ? '200px' : `${benchHeight}px`,
              overflow: isBenchMinimized ? 'hidden' : 'auto',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              transition: 'height 0.3s ease, padding 0.3s ease',
            }}
          >
            {renderBenchPanelContent('bottom')}
          </Box>
        </>
      )}

      {/* Event Modal */}
      <EventModal
        open={eventModalOpen}
        onClose={() => {
          setEventModalOpen(false);
          setSelectedDate(null);
          setSelectedJob(null);
        }}
        selectedDate={selectedDate}
        job={selectedJob}
        onSave={fetchJobs}
        onViewJob={(id) => setJobIdForDetailModal(id)}
        installerOptions={installerOrder}
      />

      {/* Job detail modal (customer, files, etc.) */}
      <JobDetailModal
        jobId={jobIdForDetailModal}
        open={!!jobIdForDetailModal}
        onClose={() => setJobIdForDetailModal(null)}
        onJobUpdate={async (jobId, updates) => { await fetchJobs(); }}
        onJobDelete={(jobId) => {
          setJobIdForDetailModal(null);
          fetchJobs();
        }}
        onJobArchive={(jobId) => {
          setJobIdForDetailModal(null);
          fetchJobs();
        }}
      />

      {/* Right-click on a date: hide/show that weekday */}
      <Menu
        open={!!dayContextMenu}
        onClose={handleCloseDayContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          dayContextMenu
            ? { top: dayContextMenu.top, left: dayContextMenu.left }
            : undefined
        }
      >
        {dayContextMenu && (() => {
          const weekday = dayContextMenu.date.getDay();
          const label = WEEKDAY_LABELS[weekday];
          const isHidden = hiddenWeekdays.includes(weekday);
          return (
            <MenuItem
              onClick={() => toggleWeekdayHidden(weekday)}
            >
              {isHidden ? `Show ${label}s` : `Hide ${label}s`}
            </MenuItem>
          );
        })()}
      </Menu>
    </Box>
  );
}

export default CalendarPageNew;

