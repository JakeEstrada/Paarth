import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Container,
  Box,
  CircularProgress,
  Paper,
  IconButton,
  Button,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  TextField,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Archive as ArchiveIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
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
import { useAuth } from '../context/AuthContext';
import { fetchPipelineLayoutsList, createPipelineLayout } from '../utils/pipelineLayoutsApi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const SHOP_VIEW_AUTO_LOCK_MS = 5 * 60 * 1000;

const PIPELINE_SELECTION_KEY_PREFIX = 'pipelineSelectedLayoutV1';

function getPipelineSelectionStorageKey(tenantId) {
  const raw =
    tenantId && typeof tenantId === 'object'
      ? tenantId._id ?? tenantId.id
      : tenantId ?? localStorage.getItem('tenantId');
  const id = String(raw ?? '').trim();
  if (/^[a-fA-F0-9]{24}$/.test(id)) return `${PIPELINE_SELECTION_KEY_PREFIX}_${id}`;
  return `${PIPELINE_SELECTION_KEY_PREFIX}_unknown`;
}

const SHOP_VIEW_PIN = '1030';

function PipelinePage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, canModifyPipeline } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [addAppointmentOpen, setAddAppointmentOpen] = useState(false);
  const [editAppointmentOpen, setEditAppointmentOpen] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);
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
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [pipelineLayouts, setPipelineLayouts] = useState([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState('default');
  const [pipelineHydrated, setPipelineHydrated] = useState(false);
  const isShopViewRole = user?.role === 'shop_view';
  const [sensitiveUnlocked, setSensitiveUnlocked] = useState(!isShopViewRole);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const lockTimerRef = useRef(null);

  useEffect(() => {
    setSensitiveUnlocked(!isShopViewRole);
    setPinDialogOpen(false);
    setPinInput('');
  }, [isShopViewRole]);

  const hideSensitive = isShopViewRole && !sensitiveUnlocked;
  const requestSensitiveUnlock = () => {
    if (!isShopViewRole) return;
    setPinInput('');
    setPinDialogOpen(true);
  };
  const handleSensitiveUnlock = () => {
    if (pinInput.trim() === SHOP_VIEW_PIN) {
      setSensitiveUnlocked(true);
      setPinDialogOpen(false);
      toast.success('Sensitive data unlocked');
    } else {
      toast.error('Invalid PIN');
    }
  };
  const lockSensitiveData = () => {
    if (!isShopViewRole) return;
    setSensitiveUnlocked(false);
    toast.success('Sensitive data locked');
  };

  useEffect(() => {
    if (!isShopViewRole) return undefined;
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
    if (sensitiveUnlocked) {
      lockTimerRef.current = setTimeout(() => {
        setSensitiveUnlocked(false);
        toast('Sensitive data locked after 5 minutes');
      }, SHOP_VIEW_AUTO_LOCK_MS);
    }
    return () => {
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
    };
  }, [isShopViewRole, sensitiveUnlocked]);

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

  const refreshPipelineLayouts = useCallback(async () => {
    try {
      const list = await fetchPipelineLayoutsList(API_URL);
      setPipelineLayouts(list);
      return list;
    } catch (error) {
      const status = error.response?.status;
      console.error('Error loading pipeline layouts:', error);
      if (status === 404) {
        toast.error(
          'Custom pipelines are not available on this server yet. Deploy the latest API (includes GET /pipeline-layouts).'
        );
      }
      setPipelineLayouts([]);
      return [];
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setPipelineHydrated(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await refreshPipelineLayouts();
      if (cancelled) return;
      const key = getPipelineSelectionStorageKey(user.tenantId);
      let saved = 'default';
      try {
        saved = localStorage.getItem(key) || 'default';
      } catch {
        saved = 'default';
      }
      if (saved !== 'default' && list.some((l) => String(l._id) === saved)) {
        setSelectedPipelineId(saved);
      } else {
        setSelectedPipelineId('default');
      }
      setPipelineHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshPipelineLayouts]);

  useEffect(() => {
    if (!user || !pipelineHydrated) return;
    const key = getPipelineSelectionStorageKey(user.tenantId);
    try {
      localStorage.setItem(key, selectedPipelineId);
    } catch {
      /* ignore */
    }
  }, [user, selectedPipelineId, pipelineHydrated]);

  useEffect(() => {
    if (selectedPipelineId === 'default') return;
    if (!pipelineLayouts.length) return;
    const exists = pipelineLayouts.some((l) => String(l._id) === selectedPipelineId);
    if (!exists) setSelectedPipelineId('default');
  }, [pipelineLayouts, selectedPipelineId]);

  // Check for jobId in URL query params and open that job's modal
  useEffect(() => {
    const jobIdFromUrl = searchParams.get('jobId');
    if (jobIdFromUrl && jobs.length > 0) {
      // Verify the job exists in the current jobs list (normalize ids — API may return string or object)
      const jobExists = jobs.some(
        (job) => String(job._id) === String(jobIdFromUrl)
      );
      if (jobExists) {
        setSelectedJobId(jobIdFromUrl);
        // Remove the query parameter from URL after opening
        searchParams.delete('jobId');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [jobs, searchParams, setSearchParams]);

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

  const handleArchiveCompleted = async () => {
    // Do not archive/modify jobs anymore; just send the user to the Completed Jobs view
    navigate('/completed-jobs');
    setArchiveDialogOpen(false);
  };

  const layoutFilteredJobs = useMemo(() => {
    if (selectedPipelineId === 'default') {
      return jobs.filter((j) => !j.pipelineLayoutId);
    }
    return jobs.filter((j) => String(j.pipelineLayoutId || '') === selectedPipelineId);
  }, [jobs, selectedPipelineId]);

  const filteredJobs = useMemo(() => {
    const term = pipelineSearch.trim().toLowerCase();
    if (!term) return layoutFilteredJobs;
    return layoutFilteredJobs.filter((job) => {
      const title = job.title || '';
      const customerName = job.customerId?.name || '';
      const stage = job.stage || '';
      return (
        title.toLowerCase().includes(term) ||
        customerName.toLowerCase().includes(term) ||
        stage.toLowerCase().includes(term)
      );
    });
  }, [layoutFilteredJobs, pipelineSearch]);

  const pipelineOptions = useMemo(
    () => [
      { id: 'default', label: 'Woodworking (default)' },
      ...pipelineLayouts.map((l) => ({
        id: String(l._id),
        label: l.title || 'Untitled pipeline',
      })),
    ],
    [pipelineLayouts]
  );

  const activeCustomLayout = useMemo(() => {
    if (selectedPipelineId === 'default') return null;
    return pipelineLayouts.find((l) => String(l._id) === selectedPipelineId) || null;
  }, [pipelineLayouts, selectedPipelineId]);

  const pipelineMode = selectedPipelineId === 'default' ? 'default' : 'custom';

  const selectedCustomInitialStage = useMemo(() => {
    if (!activeCustomLayout?.levels?.length) return null;
    const sorted = [...activeCustomLayout.levels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const lvl of sorted) {
      const stage = (lvl.stageKeys || []).find((k) => String(k || '').trim());
      if (stage) return String(stage).trim();
    }
    return null;
  }, [activeCustomLayout]);

  const handleCreateEmptyPipeline = async () => {
    if (!canModifyPipeline()) {
      toast.error('You do not have permission to create pipelines');
      return;
    }
    const confirmed = window.confirm('Are you sure you want to create a new pipeline?');
    if (!confirmed) return;
    try {
      const res = await createPipelineLayout(API_URL, { title: 'New pipeline' });
      const data = res.data;
      await refreshPipelineLayouts();
      setSelectedPipelineId(String(data._id));
      toast.success('New pipeline created — use Edit to add stages');
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to create pipeline';
      toast.error(msg);
    }
  };

  const handleCustomLayoutDeleted = async (deletedId) => {
    await refreshPipelineLayouts();
    if (String(selectedPipelineId) === String(deletedId)) {
      setSelectedPipelineId('default');
    }
  };

  // Count jobs in FINAL_PAYMENT_CLOSED stage (respecting search filter)
  const completedJobsCount = filteredJobs.filter(
    job => job.stage === 'FINAL_PAYMENT_CLOSED' && !job.isArchived && !job.isDeadEstimate
  ).length;

  return (
    <Box>
      {/* Main Content */}
      <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 1, sm: 2 } }}>
        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Box>
              <Typography variant="h1" sx={{ mb: 1 }}>
                {isShopViewRole ? 'Shop View' : 'Sales Pipeline'}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Manage your projects from first contact to final payment
              </Typography>
            </Box>
            {isShopViewRole && (
              <Tooltip title={hideSensitive ? 'Unlock sensitive data (PIN)' : 'Lock sensitive data'}>
                <IconButton
                  onClick={hideSensitive ? requestSensitiveUnlock : lockSensitiveData}
                  color={hideSensitive ? 'default' : 'warning'}
                  size="small"
                >
                  {hideSensitive ? <LockIcon /> : <LockOpenIcon />}
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Todos and Appointments Section */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: { xs: 2, sm: 3 } }}>
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
                    boxShadow: theme.palette.mode === 'dark'
                      ? '0 2px 12px rgba(0, 0, 0, 0.3)'
                      : '0 2px 12px rgba(0, 0, 0, 0.06)',
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
                      color: theme.palette.mode === 'dark' ? '#FF8A65' : '#FF6B35',
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
                    boxShadow: theme.palette.mode === 'dark'
                      ? '0 2px 12px rgba(0, 0, 0, 0.3)'
                      : '0 2px 12px rgba(0, 0, 0, 0.06)',
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
                    boxShadow: theme.palette.mode === 'dark'
                      ? '0 2px 12px rgba(0, 0, 0, 0.3)'
                      : '0 2px 12px rgba(0, 0, 0, 0.06)',
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
                      color: theme.palette.mode === 'dark' ? '#FF8A65' : '#FF6B35',
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
                    boxShadow: theme.palette.mode === 'dark'
                      ? '0 2px 12px rgba(0, 0, 0, 0.3)'
                      : '0 2px 12px rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <AppointmentList
                    onAppointmentClick={(id) => {
                      setEditingAppointmentId(id);
                      setEditAppointmentOpen(true);
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
            jobs={filteredJobs}
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
            onArchiveCompleted={() => setArchiveDialogOpen(true)}
            completedJobsCount={completedJobsCount}
            search={pipelineSearch}
            onSearchChange={setPipelineSearch}
            pipelineMode={pipelineMode}
            activeCustomLayout={activeCustomLayout}
            pipelineSelectorValue={selectedPipelineId}
            pipelineOptions={pipelineOptions}
            onPipelineSelectChange={setSelectedPipelineId}
            onCreateEmptyPipeline={handleCreateEmptyPipeline}
            onCustomLayoutSaved={refreshPipelineLayouts}
            onCustomLayoutDeleted={handleCustomLayoutDeleted}
            hideSensitive={hideSensitive}
            onRequestSensitiveUnlock={requestSensitiveUnlock}
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
          hideSensitive={hideSensitive}
          onRequestSensitiveUnlock={requestSensitiveUnlock}
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

        {/* Edit Appointment Modal */}
        <AddAppointmentModal
          open={editAppointmentOpen}
          onClose={() => {
            setEditAppointmentOpen(false);
            setEditingAppointmentId(null);
          }}
          onSuccess={() => {
            // Trigger refresh of appointment list
            setAppointmentRefreshTrigger(prev => prev + 1);
            setEditAppointmentOpen(false);
            setEditingAppointmentId(null);
          }}
          appointmentId={editingAppointmentId}
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
          initialData={editingTodo?.data}
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
            hideSensitive={hideSensitive}
            onRequestSensitiveUnlock={requestSensitiveUnlock}
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
          pipelineLayoutId={selectedPipelineId === 'default' ? null : selectedPipelineId}
          initialStage={selectedPipelineId === 'default' ? null : selectedCustomInitialStage}
        />

        {/* Close Out Completed Jobs Dialog */}
        <Dialog open={archiveDialogOpen} onClose={() => !archiving && setArchiveDialogOpen(false)}>
          <DialogTitle>Close Out Completed Jobs</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to close out all {completedJobsCount} job(s) in the "Final Payment Closed" stage?
              These jobs will be removed from the active pipeline. You can still see their history on the Completed Jobs page.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setArchiveDialogOpen(false)} disabled={archiving}>
              Cancel
            </Button>
            <Button 
              onClick={handleArchiveCompleted} 
              color="success" 
              variant="contained"
              disabled={archiving}
              startIcon={<ArchiveIcon />}
            >
              {archiving ? 'Closing...' : `Close Out ${completedJobsCount} Job(s)`}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog open={pinDialogOpen} onClose={() => setPinDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Unlock Sensitive Data</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Enter PIN to view financial numbers and files.
            </DialogContentText>
            <TextField
              autoFocus
              fullWidth
              label="PIN"
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSensitiveUnlock();
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPinDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSensitiveUnlock}>
              Unlock
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}

export default PipelinePage;