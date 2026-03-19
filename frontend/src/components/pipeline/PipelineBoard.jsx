import { useMemo, useState } from 'react';
import { Box, Card, CardContent, Typography, Paper, Button, IconButton, Tooltip, useTheme, TextField, InputAdornment, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Checkbox } from '@mui/material';
import { Add as AddIcon, CheckCircle as CheckCircleIcon, Search as SearchIcon, History as HistoryIcon, Edit as EditIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import JobCard from './JobCard';

const STAGE_LABELS = {
  APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
  ESTIMATE_IN_PROGRESS: 'Estimate Current, first 5 days',
  ESTIMATE_SENT: 'Estimate Sent',
  ENGAGED_DESIGN_REVIEW: 'Design Review',
  CONTRACT_OUT: 'Contract Out',
  CONTRACT_SIGNED: 'Contract Signed', // Kept for backward compatibility but not shown
  DEPOSIT_PENDING: 'Signed / Deposit Pending',
  JOB_PREP: 'Job Prep',
  TAKEOFF_COMPLETE: 'Fabrication',
  READY_TO_SCHEDULE: 'Ready to Schedule',
  SCHEDULED: 'Scheduled',
  IN_PRODUCTION: 'In Production',
  INSTALLED: 'Installed',
  FINAL_PAYMENT_CLOSED: 'Final Payment Closed',
};

// Phase groupings
const APPOINTMENTS_PHASE = [
  'APPOINTMENT_SCHEDULED',
];

const SALES_PHASE = [
  'ESTIMATE_IN_PROGRESS',
  'ESTIMATE_SENT',
  'ENGAGED_DESIGN_REVIEW',
  'CONTRACT_OUT',
];

const JOB_READINESS_PHASE = [
  'DEPOSIT_PENDING',
  'JOB_PREP',
  'TAKEOFF_COMPLETE',
  'READY_TO_SCHEDULE',
];

const EXECUTION_PHASE = [
  'SCHEDULED',
  'IN_PRODUCTION',
  'INSTALLED',
  'FINAL_PAYMENT_CLOSED',
];

function PipelineBoard({ jobs, onJobUpdate, onStageChange, onJobClick, onNewJobClick, onJobContextMenu, onArchiveCompleted, completedJobsCount, search = '', onSearchChange }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { canModifyPipeline } = useAuth();
  const [draggedOverStage, setDraggedOverStage] = useState(null);

  const PIPELINE_STAGE_CONFIG_KEY = 'pipelineStageConfigV1';
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [stageOverrides, setStageOverrides] = useState(() => {
    try {
      const stored = localStorage.getItem(PIPELINE_STAGE_CONFIG_KEY);
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  });

  // Group jobs by stage
  const jobsByStage = {};
  [...APPOINTMENTS_PHASE, ...SALES_PHASE, ...JOB_READINESS_PHASE, ...EXECUTION_PHASE].forEach(stageId => {
    jobsByStage[stageId] = jobs.filter(job => job.stage === stageId && !job.isArchived);
  });

  const shownStages = useMemo(() => [...SALES_PHASE, ...JOB_READINESS_PHASE, ...EXECUTION_PHASE], []);
  const getStageOverride = (stageId) => stageOverrides?.[stageId] || {};
  const isStageHidden = (stageId) => !!getStageOverride(stageId)?.hidden;
  const getStageLabel = (stageId) => {
    const override = getStageOverride(stageId);
    if (override?.label && String(override.label).trim()) return String(override.label).trim();
    return STAGE_LABELS[stageId];
  };

  // Calculate totals per stage
  const stageTotals = {};
  [...APPOINTMENTS_PHASE, ...SALES_PHASE, ...JOB_READINESS_PHASE, ...EXECUTION_PHASE].forEach(stageId => {
    const stageJobs = jobsByStage[stageId] || [];
    stageTotals[stageId] = {
      count: stageJobs.length,
      value: stageJobs.reduce((sum, job) => sum + (job.valueEstimated || 0), 0),
    };
  });

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDraggedOverStage(stageId);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if we're actually leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDraggedOverStage(null);
    }
  };

  const handleDrop = async (e, stageId) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverStage(null);

    // Check permissions
    if (!canModifyPipeline()) {
      toast.error('You do not have permission to modify the pipeline');
      return;
    }

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { jobId, currentStage } = data;

      if (currentStage === stageId) {
        // Job is already in this stage, do nothing
        return;
      }

      if (onStageChange && jobId) {
        await onStageChange(jobId, stageId, `Moved via drag and drop`);
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  // Render a single stage column
  const renderStageColumn = (stageId) => {
    const stageJobs = jobsByStage[stageId] || [];
    const { count, value } = stageTotals[stageId];
    const isDraggedOver = draggedOverStage === stageId;

    return (
      <Box
        key={stageId}
        onDragOver={canModifyPipeline() ? (e) => handleDragOver(e, stageId) : undefined}
        onDragLeave={canModifyPipeline() ? handleDragLeave : undefined}
        onDrop={canModifyPipeline() ? (e) => handleDrop(e, stageId) : undefined}
        sx={{
          minWidth: 280,
          flex: '1 1 0',
          maxWidth: '100%',
          transition: 'all 0.2s ease',
          backgroundColor: isDraggedOver 
            ? theme.palette.mode === 'dark' 
              ? 'rgba(25, 118, 210, 0.2)' 
              : 'rgba(25, 118, 210, 0.08)' 
            : 'transparent',
          borderRadius: isDraggedOver ? '8px' : '0',
          border: isDraggedOver ? `2px dashed ${theme.palette.primary.main}` : '2px solid transparent',
          p: isDraggedOver ? 1 : 0,
        }}
      >
        {/* Column Header */}
        <Card
          sx={{
            background: theme.palette.mode === 'dark'
              ? 'linear-gradient(135deg, #2A2A2A 0%, #1E1E1E 100%)'
              : 'linear-gradient(135deg, #F5F7FA 0%, #E8EAF6 100%)',
            borderRadius: '12px',
            mb: 1.5,
            boxShadow: theme.palette.mode === 'dark'
              ? '0 1px 4px rgba(0, 0, 0, 0.3)'
              : '0 1px 4px rgba(0, 0, 0, 0.04)',
          }}
        >
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontSize: '0.75rem',
                display: 'block',
                mb: 0.75,
              }}
            >
              {getStageLabel(stageId)}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box
                sx={{
                  background: theme.palette.mode === 'dark' ? '#424242' : 'white',
                  px: 1,
                  py: 0.25,
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: theme.palette.text.secondary,
                }}
              >
                {count}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: theme.palette.primary.main,
                  }}
                >
                  ${Math.round(value / 1000)}K
                </Typography>
                {stageId === 'ESTIMATE_SENT' && (
                  <Tooltip title="View archived estimates">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/archive');
                      }}
                      sx={{
                        color: theme.palette.text.secondary,
                        '&:hover': {
                          color: theme.palette.primary.main,
                          backgroundColor: theme.palette.action.hover,
                        },
                      }}
                    >
                      <HistoryIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {stageId === 'FINAL_PAYMENT_CLOSED' && completedJobsCount > 0 && onArchiveCompleted && (
                  <Tooltip title={`Close out ${completedJobsCount} completed job(s)`}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchiveCompleted();
                      }}
                      sx={{
                        color: theme.palette.success.main,
                        '&:hover': {
                          backgroundColor: theme.palette.mode === 'dark' 
                            ? 'rgba(67, 160, 71, 0.2)' 
                            : 'rgba(67, 160, 71, 0.1)',
                        },
                      }}
                    >
                      <CheckCircleIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Job Cards */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {stageJobs.length > 0 ? (
            stageJobs.map((job) => (
              <JobCard
                key={job._id}
                job={job}
                onClick={() => onJobClick && onJobClick(job._id)}
                onUpdate={(updates) => onJobUpdate(job._id, updates)}
                onStageChange={(toStage, note) => onStageChange(job._id, toStage, note)}
                onContextMenu={onJobContextMenu}
                canModify={canModifyPipeline()}
              />
            ))
          ) : (
            <Box
              sx={{
                py: 3,
                textAlign: 'center',
                color: isDraggedOver 
                  ? theme.palette.primary.main 
                  : theme.palette.text.disabled,
                fontSize: '0.75rem',
                fontWeight: isDraggedOver ? 600 : 400,
                transition: 'all 0.2s ease',
              }}
            >
              {isDraggedOver ? 'Drop here' : 'No jobs'}
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  // Render a phase section
  const renderPhase = (phaseName, phaseStages) => {
    const visibleStages = phaseStages.filter((stageId) => !isStageHidden(stageId));
    if (visibleStages.length === 0) return null;

    return (
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h6"
          sx={{
            fontSize: '1rem',
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: 1.5,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {phaseName}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            overflowX: 'auto',
            pb: 1,
            width: '100%',
            '&::-webkit-scrollbar': {
              height: 6,
            },
            '&::-webkit-scrollbar-track': {
              background: theme.palette.mode === 'dark' ? '#2A2A2A' : '#F5F7FA',
            },
            '&::-webkit-scrollbar-thumb': {
              background: theme.palette.mode === 'dark' ? '#616161' : '#CFD8DC',
              borderRadius: '3px',
            },
          }}
        >
          {visibleStages.map(renderStageColumn)}
        </Box>
      </Box>
    );
  };

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          borderRadius: '20px',
          p: 3,
        }}
      >
      <Box
        sx={{
          mb: 3,
          pb: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'center' },
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {onNewJobClick && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onNewJobClick}
              sx={{
                borderRadius: '8px',
                textTransform: 'none',
              }}
            >
              New Job
            </Button>
          )}
          <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 400 }}>
            Pipeline Overview
          </Typography>
        </Box>
        <Box sx={{ minWidth: { xs: '100%', sm: 260 }, maxWidth: 340, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            label="Search jobs in pipeline"
            value={search}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          {canModifyPipeline && (
            <IconButton
              size="small"
              onClick={() => setCustomizeOpen(true)}
              title="Customize pipeline stages"
              sx={{
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)',
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Appointments Phase - Now handled separately, not shown here */}

      {/* Sales Phase */}
      {renderPhase('Sales Phase', SALES_PHASE)}

      {/* Job Readiness Phase */}
      {renderPhase('Job Readiness', JOB_READINESS_PHASE)}

      {/* Execution Phase */}
      {renderPhase('Execution Phase', EXECUTION_PHASE)}
      </Paper>

      <Dialog
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Customize Pipeline</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {shownStages.map((stageId) => {
              const override = getStageOverride(stageId);
              const hidden = !!override.hidden;
              const labelValue =
                override?.label && String(override.label).trim()
                  ? String(override.label).trim()
                  : STAGE_LABELS[stageId];

              return (
                <Box
                  key={stageId}
                  sx={{
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 2,
                    p: 1.5,
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={hidden}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setStageOverrides((prev) => ({
                              ...prev,
                              [stageId]: {
                                ...(prev?.[stageId] || {}),
                                hidden: checked,
                              },
                            }));
                          }}
                        />
                      }
                      label={`Hide ${stageId}`}
                    />
                    <TextField
                      size="small"
                      label="Stage label"
                      value={labelValue || stageId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStageOverrides((prev) => ({
                          ...prev,
                          [stageId]: {
                            ...(prev?.[stageId] || {}),
                            label: val,
                          },
                        }));
                      }}
                      sx={{ minWidth: 260 }}
                    />
                  </Box>
                </Box>
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => {
              try {
                localStorage.setItem(PIPELINE_STAGE_CONFIG_KEY, JSON.stringify(stageOverrides || {}));
              } catch (_) {}
              toast.success('Pipeline customization saved');
              setCustomizeOpen(false);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default PipelineBoard;