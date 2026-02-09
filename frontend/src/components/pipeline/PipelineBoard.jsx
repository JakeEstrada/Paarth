import { useState } from 'react';
import { Box, Card, CardContent, Typography, Paper, Button } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
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
  TAKEOFF_COMPLETE: 'Takeoff Complete',
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

function PipelineBoard({ jobs, onJobUpdate, onStageChange, onJobClick, onNewJobClick, onJobContextMenu }) {
  const { canModifyPipeline } = useAuth();
  const [draggedOverStage, setDraggedOverStage] = useState(null);

  // Group jobs by stage
  const jobsByStage = {};
  [...APPOINTMENTS_PHASE, ...SALES_PHASE, ...JOB_READINESS_PHASE, ...EXECUTION_PHASE].forEach(stageId => {
    jobsByStage[stageId] = jobs.filter(job => job.stage === stageId && !job.isArchived);
  });

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
          backgroundColor: isDraggedOver ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
          borderRadius: isDraggedOver ? '8px' : '0',
          border: isDraggedOver ? '2px dashed #1976D2' : '2px solid transparent',
          p: isDraggedOver ? 1 : 0,
        }}
      >
        {/* Column Header */}
        <Card
          sx={{
            background: 'linear-gradient(135deg, #F5F7FA 0%, #E8EAF6 100%)',
            borderRadius: '12px',
            mb: 1.5,
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
          }}
        >
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography
              variant="caption"
              sx={{
                color: '#455A64',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontSize: '0.75rem',
                display: 'block',
                mb: 0.75,
              }}
            >
              {STAGE_LABELS[stageId]}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box
                sx={{
                  background: 'white',
                  px: 1,
                  py: 0.25,
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#546E7A',
                }}
              >
                {count}
              </Box>
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#1976D2',
                }}
              >
                ${Math.round(value / 1000)}K
              </Typography>
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
                color: isDraggedOver ? '#1976D2' : '#B0BEC5',
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
  const renderPhase = (phaseName, phaseStages, phaseColor) => (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="h6"
        sx={{
          fontSize: '1rem',
          fontWeight: 600,
          color: '#263238',
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
            background: '#F5F7FA',
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#CFD8DC',
            borderRadius: '3px',
          },
        }}
      >
        {phaseStages.map(renderStageColumn)}
      </Box>
    </Box>
  );

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: '20px',
        p: 3,
        background: 'white',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
      }}
    >
      <Box sx={{ mb: 3, pb: 2, borderBottom: '1px solid #ECEFF1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
      </Box>

      {/* Appointments Phase - Now handled separately, not shown here */}

      {/* Sales Phase */}
      {renderPhase('Sales Phase', SALES_PHASE, '#1976D2')}

      {/* Job Readiness Phase */}
      {renderPhase('Job Readiness', JOB_READINESS_PHASE, '#43A047')}

      {/* Execution Phase */}
      {renderPhase('Execution Phase', EXECUTION_PHASE, '#F57C00')}
    </Paper>
  );
}

export default PipelineBoard;