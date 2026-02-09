import { useState, useEffect } from 'react';
import {
  Typography,
  Container,
  Box,
  CircularProgress,
  Paper,
  IconButton,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import PipelineBoard from '../components/pipeline/PipelineBoard';
import JobDetailModal from '../components/jobs/JobDetailModal';
import AppointmentList from '../components/appointments/AppointmentList';
import AddAppointmentModal from '../components/appointments/AddAppointmentModal';
import TodoList from '../components/todos/TodoList';
import AddTodoModal from '../components/todos/AddTodoModal';
import JobContextMenu from '../components/jobs/JobContextMenu';
import AddJobTaskModal from '../components/jobs/AddJobTaskModal';
import AddJobModal from '../components/jobs/AddJobModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function PipelinePage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [addAppointmentOpen, setAddAppointmentOpen] = useState(false);
  const [appointmentRefreshTrigger, setAppointmentRefreshTrigger] = useState(0);
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  const [editTodoOpen, setEditTodoOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [todoRefreshTrigger, setTodoRefreshTrigger] = useState(0);
  const [contextMenuAnchor, setContextMenuAnchor] = useState(null);
  const [contextMenuJob, setContextMenuJob] = useState(null);
  const [addJobTaskOpen, setAddJobTaskOpen] = useState(false);
  const [selectedJobForTask, setSelectedJobForTask] = useState(null);
  const [moveStageOpen, setMoveStageOpen] = useState(false);
  const [selectedJobForMove, setSelectedJobForMove] = useState(null);
  const [addJobOpen, setAddJobOpen] = useState(false);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [appointmentsCollapsed, setAppointmentsCollapsed] = useState(false);
  const [tasksCount, setTasksCount] = useState(0);
  const [appointmentsCount, setAppointmentsCount] = useState(0);

  const autoMoveDeadEstimates = async () => {
    try {
      await axios.post(`${API_URL}/jobs/dead-estimates/auto-move`);
    } catch (error) {
      console.error('Error auto-moving dead estimates:', error);
    }
  };

  // Fetch jobs from backend
  useEffect(() => {
    const initialize = async () => {
      // First, auto-move any dead estimates
      await autoMoveDeadEstimates();
      // Then fetch the updated jobs list
      await fetchJobs();
    };
    initialize();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      
      // For now, we'll fetch without auth token to test
      // Later we'll add authentication
      const response = await axios.get(`${API_URL}/jobs`);
      
      const jobsData = response.data.jobs || response.data;
      setJobs(jobsData);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      console.error('Error response:', error.response?.data);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleJobUpdate = async (jobId, updates) => {
    try {
      await axios.patch(`${API_URL}/jobs/${jobId}`, updates);
      toast.success('Job updated');
      fetchJobs(); // Refresh
    } catch (error) {
      console.error('Error updating job:', error);
      toast.error('Failed to update job');
    }
  };

  const handleStageChange = async (jobId, toStage, note) => {
    try {
      await axios.post(`${API_URL}/jobs/${jobId}/move-stage`, { toStage, note });
      toast.success('Job moved to ' + toStage.replace(/_/g, ' '));
      fetchJobs(); // Refresh
    } catch (error) {
      console.error('Error moving job:', error);
      toast.error('Failed to move job');
    }
  };

  const handleJobDelete = async (jobId) => {
    await fetchJobs(); // Refresh the list
  };

  const handleJobArchive = async (jobId) => {
    await fetchJobs(); // Refresh the list
  };

  return (
    <Box>
      {/* Main Content */}
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h1" sx={{ mb: 1 }}>
            Sales Pipeline
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Manage your woodworking projects from first contact to final payment
          </Typography>
        </Box>

        {/* Todos and Appointments Section */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', gap: 3 }}>
            {/* Todos Section */}
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Tasks / Todos ({tasksCount})
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setTasksCollapsed(!tasksCollapsed)}
                  sx={{ ml: 1 }}
                >
                  {tasksCollapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
                </IconButton>
              </Box>
              {tasksCollapsed ? (
                <Paper
                  elevation={0}
                  onClick={() => setTasksCollapsed(false)}
                  sx={{
                    borderRadius: '16px',
                    p: 3,
                    background: 'white',
                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    '&:hover': {
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                    },
                  }}
                >
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      color: '#FF6B35',
                      fontWeight: 600,
                    }}
                  >
                    View all ({tasksCount}) {tasksCount === 1 ? 'task' : 'tasks'}
                  </Typography>
                </Paper>
              ) : (
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: '16px',
                    p: 3,
                    background: 'white',
                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <TodoList
                    onTodoClick={(id) => {
                      // TODO: Open todo detail modal
                      console.log('Todo clicked:', id);
                    }}
                    onTodoComplete={() => {
                      setTodoRefreshTrigger(prev => prev + 1);
                    }}
                    onAddClick={() => setAddTodoOpen(true)}
                    onEditClick={(id, taskData) => {
                      setEditingTodo({ id, data: taskData });
                      setEditTodoOpen(true);
                    }}
                    onCountChange={setTasksCount}
                    refreshTrigger={todoRefreshTrigger}
                  />
                </Paper>
              )}
            </Box>

            {/* Appointments Section */}
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Appointments ({appointmentsCount})
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setAppointmentsCollapsed(!appointmentsCollapsed)}
                  sx={{ ml: 1 }}
                >
                  {appointmentsCollapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
                </IconButton>
              </Box>
              {appointmentsCollapsed ? (
                <Paper
                  elevation={0}
                  onClick={() => setAppointmentsCollapsed(false)}
                  sx={{
                    borderRadius: '16px',
                    p: 3,
                    background: 'white',
                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    '&:hover': {
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                    },
                  }}
                >
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      color: '#FF6B35',
                      fontWeight: 600,
                    }}
                  >
                    View all ({appointmentsCount}) {appointmentsCount === 1 ? 'appointment' : 'appointments'}
                  </Typography>
                </Paper>
              ) : (
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: '16px',
                    p: 3,
                    background: 'white',
                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <AppointmentList
                    onAppointmentClick={(id) => {
                      // TODO: Open appointment detail modal
                      console.log('Appointment clicked:', id);
                    }}
                    onAppointmentComplete={() => {
                      // Refresh if needed
                      setAppointmentRefreshTrigger(prev => prev + 1);
                    }}
                    onAddClick={() => setAddAppointmentOpen(true)}
                    onCountChange={setAppointmentsCount}
                    refreshTrigger={appointmentRefreshTrigger}
                  />
                </Paper>
              )}
            </Box>
          </Box>
        </Box>

        {/* Pipeline Board */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <PipelineBoard
            jobs={jobs}
            onJobUpdate={handleJobUpdate}
            onStageChange={handleStageChange}
            onJobClick={setSelectedJobId}
            onNewJobClick={() => {
              setAddJobOpen(true);
            }}
            onJobContextMenu={(e, job) => {
              setContextMenuAnchor(e.currentTarget);
              setContextMenuJob(job);
            }}
          />
        )}

        {/* Job Detail Modal */}
        <JobDetailModal
          jobId={selectedJobId}
          open={!!selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onJobUpdate={handleJobUpdate}
          onJobDelete={handleJobDelete}
          onJobArchive={handleJobArchive}
          onAppointmentCreated={() => {
            // Trigger refresh of appointment list
            setAppointmentRefreshTrigger(prev => prev + 1);
          }}
        />

        {/* Add Appointment Modal */}
        <AddAppointmentModal
          open={addAppointmentOpen}
          onClose={() => setAddAppointmentOpen(false)}
          onSuccess={() => {
            // Trigger refresh of appointment list
            setAppointmentRefreshTrigger(prev => prev + 1);
          }}
        />

        {/* Add Todo Modal */}
        <AddTodoModal
          open={addTodoOpen}
          onClose={() => setAddTodoOpen(false)}
          onSuccess={() => {
            // Trigger refresh of todo list
            setTodoRefreshTrigger(prev => prev + 1);
          }}
        />

        {/* Edit Todo Modal */}
        <AddTodoModal
          open={editTodoOpen}
          onClose={() => {
            setEditTodoOpen(false);
            setEditingTodo(null);
          }}
          onSuccess={() => {
            // Trigger refresh of todo list
            setTodoRefreshTrigger(prev => prev + 1);
            setEditingTodo(null);
          }}
          taskId={editingTodo?.id}
          taskData={editingTodo?.data}
        />

        {/* Job Context Menu */}
        <JobContextMenu
          anchorEl={contextMenuAnchor}
          open={!!contextMenuAnchor}
          onClose={() => {
            setContextMenuAnchor(null);
            setContextMenuJob(null);
          }}
          onMoveStage={() => {
            if (contextMenuJob) {
              setSelectedJobForMove(contextMenuJob);
              setMoveStageOpen(true);
            }
          }}
          onAddTask={() => {
            if (contextMenuJob) {
              setSelectedJobForTask(contextMenuJob);
              setAddJobTaskOpen(true);
            }
          }}
          job={contextMenuJob}
        />

        {/* Add Job Task Modal */}
        <AddJobTaskModal
          open={addJobTaskOpen}
          onClose={() => {
            setAddJobTaskOpen(false);
            setSelectedJobForTask(null);
          }}
          onSuccess={() => {
            setTodoRefreshTrigger(prev => prev + 1);
            fetchJobs(); // Refresh jobs to show updated activities
          }}
          job={selectedJobForTask}
        />

        {/* Move Stage Modal - Reuse JobDetailModal or create simple stage selector */}
        {moveStageOpen && selectedJobForMove && (
          <JobDetailModal
            jobId={selectedJobForMove._id}
            open={moveStageOpen}
            onClose={() => {
              setMoveStageOpen(false);
              setSelectedJobForMove(null);
            }}
            onJobUpdate={handleJobUpdate}
            onJobDelete={handleJobDelete}
            onJobArchive={handleJobArchive}
          />
        )}

        {/* Add Job Modal */}
        <AddJobModal
          open={addJobOpen}
          onClose={() => {
            setAddJobOpen(false);
          }}
          onJobCreated={(newJob) => {
            // Refresh jobs list to show the new job
            fetchJobs();
          }}
        />
      </Container>
    </Box>
  );
}

export default PipelinePage;