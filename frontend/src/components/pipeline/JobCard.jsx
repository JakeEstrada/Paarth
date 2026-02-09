import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, Typography, Box, Chip } from '@mui/material';

function JobCard({ job, onClick, onContextMenu, canModify = true }) {
  const [daysSinceSent, setDaysSinceSent] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef(null);

  // Truncate long job titles
  const truncateTitle = (title, maxLength = 40) => {
    if (!title) return 'Untitled Job';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  // Calculate days since estimate was sent or job was created (for ESTIMATE_IN_PROGRESS)
  useEffect(() => {
    if (job.stage === 'ESTIMATE_SENT' && job.estimate?.sentAt) {
      const calculateDays = () => {
        const sentDate = new Date(job.estimate.sentAt);
        const now = new Date();
        const diffTime = Math.abs(now - sentDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        setDaysSinceSent(diffDays);
      };

      calculateDays();
      // Update every hour
      const interval = setInterval(calculateDays, 3600000);
      return () => clearInterval(interval);
    } else if (job.stage === 'ESTIMATE_IN_PROGRESS') {
      // Calculate days since job was created or last updated (whichever is more recent)
      const calculateDays = () => {
        const startDate = job.updatedAt ? new Date(job.updatedAt) : new Date(job.createdAt);
        const now = new Date();
        const diffTime = Math.abs(now - startDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        setDaysSinceSent(diffDays);
      };

      calculateDays();
      // Update every hour
      const interval = setInterval(calculateDays, 3600000);
      return () => clearInterval(interval);
    } else {
      setDaysSinceSent(null);
    }
  }, [job.stage, job.estimate?.sentAt, job.createdAt, job.updatedAt]);

  const getTimerColor = () => {
    if (daysSinceSent === null) return '#546E7A';
    if (daysSinceSent >= 5) return '#D32F2F'; // Red - should be moved
    if (daysSinceSent >= 3) return '#F57C00'; // Orange - warning
    return '#43A047'; // Green - still ok
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
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
        cursor: canModify ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
        transition: 'all 0.2s ease',
        borderLeft: '3px solid #1976D2',
        opacity: isDragging ? 0.5 : 1,
        '&:hover': {
          boxShadow: '0 4px 12px rgba(25, 118, 210, 0.12)',
          transform: isDragging ? 'none' : 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#263238',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            mb: (job.stage === 'ESTIMATE_SENT' || job.stage === 'ESTIMATE_IN_PROGRESS') && daysSinceSent !== null ? 0.5 : 0,
          }}
          title={job.title}
        >
          {truncateTitle(job.title, 50)}
        </Typography>
        
        {((job.stage === 'ESTIMATE_SENT' || job.stage === 'ESTIMATE_IN_PROGRESS') && daysSinceSent !== null) && (
          <Box sx={{ mt: 0.5 }}>
            <Chip
              label={`${daysSinceSent} day${daysSinceSent !== 1 ? 's' : ''} ago`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.7rem',
                fontWeight: 600,
                backgroundColor: getTimerColor() + '15',
                color: getTimerColor(),
                border: `1px solid ${getTimerColor()}40`,
              }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default JobCard;