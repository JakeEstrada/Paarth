import { useState, useRef } from 'react';
import { Card, CardContent, Typography, Box, Tooltip, useTheme } from '@mui/material';

function JobCard({ job, onClick, onContextMenu, canModify = true, minHeightPx = 90 }) {
  const theme = useTheme();
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef(null);

  // Truncate long job titles
  const truncateTitle = (title, maxLength = 40) => {
    if (!title) return 'Untitled Job';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      // Create a new event-like object with the card element as currentTarget
      const eventWithAnchor = Object.create(e);
      eventWithAnchor.currentTarget = cardRef.current;
      eventWithAnchor.target = cardRef.current;
      onContextMenu(eventWithAnchor, job);
    }
  };

  const handleDragStart = (e) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      jobId: job._id,
      currentStage: job.stage,
    }));
    // Add a visual effect
    e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Determine status dot color: scheduled (green) beats bench (orange) when calendar exists
  const readinessStages = ['DEPOSIT_PENDING', 'JOB_PREP', 'TAKEOFF_COMPLETE', 'READY_TO_SCHEDULE'];
  const isArchived = !!job.isArchived;
  const isDeadEstimate = !!job.isDeadEstimate;
  const hasSchedule =
    !!(job.schedule?.startDate) ||
    (Array.isArray(job.schedule?.entries) && job.schedule.entries.some((e) => e?.startDate));

  const isScheduledJob =
    (hasSchedule || job.stage === 'SCHEDULED') && !isArchived && !isDeadEstimate;
  const isBenchJob =
    readinessStages.includes(job.stage) &&
    !isArchived &&
    !isDeadEstimate &&
    !hasSchedule;

  let statusColor = theme.palette.info.main; // default blue
  let statusLabel = 'Open: not on bench or scheduled yet';

  if (isScheduledJob) {
    statusColor = theme.palette.success.main; // green
    statusLabel =
      'Scheduled: job has scheduled dates or is in the Scheduled stage.';
  } else if (isBenchJob) {
    statusColor = '#F57C00'; // orange
    statusLabel =
      'On bench: job is in a readiness stage and not yet scheduled on the calendar.';
  }

  return (
    <Card
      ref={cardRef}
      draggable={canModify}
      onDragStart={canModify ? handleDragStart : undefined}
      onDragEnd={canModify ? handleDragEnd : undefined}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      sx={{
        borderRadius: '8px',
        minHeight: minHeightPx,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: theme.palette.mode === 'dark'
          ? '0 1px 4px rgba(0, 0, 0, 0.3)'
          : '0 1px 4px rgba(0, 0, 0, 0.06)',
        cursor: canModify ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
        transition: 'all 0.2s ease',
        borderLeft: `3px solid ${theme.palette.primary.main}`,
        opacity: isDragging ? 0.5 : 1,
        '&:hover': {
          boxShadow: theme.palette.mode === 'dark'
            ? '0 4px 12px rgba(25, 118, 210, 0.3)'
            : '0 4px 12px rgba(25, 118, 210, 0.12)',
          transform: isDragging ? 'none' : 'translateY(-2px)',
        },
      }}
    >
      <CardContent
        sx={{
          p: 1.5,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          '&:last-child': { pb: 1.5 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: theme.palette.text.primary,
              lineHeight: 1.4,
              display: 'inline',
            }}
            title={job.title}
          >
            {truncateTitle(job.title, 50)}
          </Typography>
          {job.description && (
            <>
              <Typography 
                component="span" 
                sx={{ 
                  mx: 0.75, 
                  color: theme.palette.text.secondary,
                  fontSize: '0.75rem'
                }}
              >
                |
              </Typography>
              <Typography
                component="span"
                variant="body2"
                sx={{
                  fontSize: '0.75rem',
                  color: theme.palette.text.secondary,
                  fontStyle: 'italic',
                  fontWeight: 300,
                  lineHeight: 1.4,
                }}
                title={job.description}
              >
                {truncateTitle(job.description, 30)}
              </Typography>
            </>
          )}
          </Box>
        <Tooltip title={statusLabel}>
          <Box
            sx={{
              flexShrink: 0,
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: statusColor,
              border: `2px solid ${theme.palette.background.paper}`,
              mt: 0.5,
            }}
          />
        </Tooltip>
      </Box>
      </CardContent>
    </Card>
  );
}

export default JobCard;
