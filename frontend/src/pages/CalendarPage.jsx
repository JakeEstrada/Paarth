import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  DragIndicator as DragIndicatorIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  CalendarToday as CalendarTodayIcon,
} from '@mui/icons-material';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, startOfWeek, endOfWeek, isSameDay, differenceInDays } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Bench Job Card Component (draggable)
function BenchJobCard({ job, onDragStart, canModify = true }) {
  // Calculate duration: floor(job total / 2000), minimum 1 day
  const jobTotal = job.valueEstimated || job.valueTotal || 0;
  const defaultDuration = Math.max(1, Math.floor(jobTotal / 2000));

  const handleDragStart = (e) => {
    if (!canModify) {
      e.preventDefault();
      toast.error('You do not have permission to modify calendar events');
      return;
    }
    e.dataTransfer.setData('jobId', job._id);
    e.dataTransfer.setData('duration', defaultDuration.toString());
    e.dataTransfer.effectAllowed = 'move';
    if (onDragStart) onDragStart(job);
  };

  return (
    <Card
      draggable={canModify}
      onDragStart={canModify ? handleDragStart : undefined}
      sx={{
        cursor: canModify ? 'grab' : 'default',
        '&:active': { cursor: canModify ? 'grabbing' : 'default' },
        borderLeft: '4px solid #1976D2',
        minWidth: 200,
        maxWidth: 250,
        '&:hover': {
          boxShadow: 4,
          transform: 'translateY(-2px)',
          transition: 'all 0.2s',
        },
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {job.customerId?.name || 'Unknown'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {defaultDuration} days • ${(jobTotal / 1000).toFixed(0)}k
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// Multi-Day Job Bar Component - renders individual blocks per day (Google Calendar style)
function MultiDayJobBar({ job, calendarDays, onResize, onMove, canModify = true }) {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState(null);
  const [resizeDirection, setResizeDirection] = useState(null);
  const [isHovered, setIsHovered] = useState(false);

  if (!job.schedule?.startDate) {
    console.warn('MultiDayJobBar: Job has no startDate', job.title, job._id);
    return null;
  }

  // Parse dates and normalize to local timezone (avoid UTC shifts)
  const startDateStr = job.schedule.startDate;
  
  // Extract date components directly from ISO string to avoid timezone issues
  // Format: "2026-02-16T08:00:00.000Z" -> extract "2026-02-16"
  let year, month, day;
  if (startDateStr && typeof startDateStr === 'string') {
    const dateMatch = startDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      year = parseInt(dateMatch[1]);
      month = parseInt(dateMatch[2]) - 1; // Month is 0-indexed
      day = parseInt(dateMatch[3]);
    } else {
      // Fallback to Date parsing
      const parsed = new Date(startDateStr);
      year = parsed.getFullYear();
      month = parsed.getMonth();
      day = parsed.getDate();
    }
  } else {
    const parsed = new Date(startDateStr);
    year = parsed.getFullYear();
    month = parsed.getMonth();
    day = parsed.getDate();
  }
  
  // Create date in local timezone
  const startDate = new Date(year, month, day, 0, 0, 0, 0);

  const endDateStr = job.schedule.endDate || job.schedule.startDate;
  
  // Extract date components for end date
  let endYear, endMonth, endDay;
  if (endDateStr && typeof endDateStr === 'string') {
    const dateMatch = endDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      endYear = parseInt(dateMatch[1]);
      endMonth = parseInt(dateMatch[2]) - 1; // Month is 0-indexed
      endDay = parseInt(dateMatch[3]);
    } else {
      // Fallback to Date parsing
      const parsed = new Date(endDateStr);
      endYear = parsed.getFullYear();
      endMonth = parsed.getMonth();
      endDay = parsed.getDate();
    }
  } else {
    const parsed = new Date(endDateStr);
    endYear = parsed.getFullYear();
    endMonth = parsed.getMonth();
    endDay = parsed.getDate();
  }
  
  const endDate = new Date(endYear, endMonth, endDay, 23, 59, 59, 999);
  
  const duration = differenceInDays(endDate, startDate) + 1;

  console.log('MultiDayJobBar rendering:', {
    title: job.title,
    startDateISO: startDateStr,
    startDate: startDate.toISOString(),
    startDateFormatted: format(startDate, 'yyyy-MM-dd'),
    endDateISO: endDateStr,
    endDate: endDate.toISOString(),
    endDateFormatted: format(endDate, 'yyyy-MM-dd'),
    duration,
    calendarDaysCount: calendarDays.length,
    calendarStart: calendarDays[0] ? format(calendarDays[0], 'yyyy-MM-dd') : 'N/A',
    calendarEnd: calendarDays[calendarDays.length - 1] ? format(calendarDays[calendarDays.length - 1], 'yyyy-MM-dd') : 'N/A',
  });

  // Find which grid cells this job spans
  // Use string comparison to avoid timezone issues completely
  const startDateFormatted = format(startDate, 'yyyy-MM-dd');
  const endDateFormatted = format(endDate, 'yyyy-MM-dd');
  
  // Find start index - if job starts before calendar, use first day
  let startIndex = calendarDays.findIndex(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return dayStr === startDateFormatted;
  });
  if (startIndex === -1) {
    // Job starts before this month's calendar - use first day of calendar
    startIndex = 0;
  }

  // Find end index - if job ends after calendar, use last day
  let endIndex = calendarDays.findIndex(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return dayStr === endDateFormatted;
  });
  if (endIndex === -1) {
    // Job ends after this month's calendar - use last day of calendar
    endIndex = calendarDays.length - 1;
  }

  // Ensure valid indices
  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    console.warn('Job not found in calendar days:', {
      jobTitle: job.title,
      jobId: job._id,
      startDate: startDate.toISOString(),
      startDateFormatted: format(startDate, 'yyyy-MM-dd'),
      endDate: endDate.toISOString(),
      endDateFormatted: format(endDate, 'yyyy-MM-dd'),
      startIndex,
      endIndex,
      calendarStart: calendarDays[0] ? format(calendarDays[0], 'yyyy-MM-dd') : 'N/A',
      calendarEnd: calendarDays[calendarDays.length - 1] ? format(calendarDays[calendarDays.length - 1], 'yyyy-MM-dd') : 'N/A',
    });
    return null;
  }

  // Calculate position and width based on grid cells
  // The calendar is a 7-column CSS Grid, so we need to calculate column positions
  const startCol = startIndex % 7; // Column in the grid (0-6)
  const endCol = endIndex % 7; // Column in the grid (0-6)
  const startRow = Math.floor(startIndex / 7); // Row in the grid
  const endRow = Math.floor(endIndex / 7); // Row in the grid
  
  const cellWidth = 100 / 7; // percentage width of each column
  const barHeight = 24; // Height for each day block
  const barSpacing = 2; // Spacing between multiple blocks on same day
  
  // Calculate consistent top position for all blocks
  const headerRowHeight = 48; // Day headers
  const cellPaddingTop = 8; // p: 1 = 8px top padding
  const dateLineHeight = 24; // Date typography line height
  const dateMarginBottom = 4; // mb: 0.5 = 4px margin bottom
  const cellContentOffset = cellPaddingTop + dateLineHeight + dateMarginBottom;
  const cellMinHeight = 100; // minHeight from CalendarDay
  
  const calculateTopForRow = (row) => {
    return headerRowHeight + (row * cellMinHeight) + cellContentOffset;
  };

  // Render individual blocks for each day the job spans (Google Calendar style)
  const dayBlocks = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const row = Math.floor(i / 7);
    const col = i % 7;
    // Calculate left position: column * cell width
    // Add small offset to account for cell padding/borders
    const dayLeft = col * cellWidth;
    const dayTop = calculateTopForRow(row);
    
    console.log(`Block ${i}: row=${row}, col=${col}, left=${dayLeft}%, top=${dayTop}px`);
    
    dayBlocks.push({
      index: i,
      row,
      col,
      left: dayLeft,
      top: dayTop,
      isFirst: i === startIndex,
      isLast: i === endIndex,
    });
  }

  const rowsSpanned = endRow - startRow + 1;
  const colsSpanned = dayBlocks.length; // Total number of days

  console.log('MultiDayJobBar positioning:', {
    title: job.title,
    startIndex,
    endIndex,
    startRow,
    startCol,
    endRow,
    endCol,
    rowsSpanned,
    colsSpanned,
    dayBlocks: dayBlocks.length,
  });

  const handleMouseDown = (e, direction) => {
    if (!canModify) {
      toast.error('You do not have permission to modify calendar events');
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeDirection(direction);
    setResizeStart({ 
      x: e.clientX, 
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      startIndex,
      endIndex
    });
  };

  const barRef = useRef(null);

  useEffect(() => {
    if (!isResizing || !resizeStart || !barRef.current) return;

    const handleMouseMove = (e) => {
      // Get the grid container
      const gridContainer = barRef.current?.parentElement;
      if (!gridContainer) return;

      // Calculate which cell the mouse is over
      const rect = gridContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const cellWidth = rect.width / 7; // 7 columns
      const cellIndex = Math.floor(x / cellWidth);
      const clampedCellIndex = Math.max(0, Math.min(calendarDays.length - 1, cellIndex));
      
      if (resizeDirection === 'right') {
        // Resizing end date - move to the cell the mouse is over
        const newEndIndex = Math.max(resizeStart.startIndex, clampedCellIndex);
        const newEndDate = new Date(calendarDays[newEndIndex]);
        newEndDate.setHours(23, 59, 59, 999);
        const newDuration = differenceInDays(newEndDate, startDate) + 1;
        
        if (newDuration >= 1 && newEndIndex !== resizeStart.endIndex && onResize) {
          onResize(job._id, newDuration, newEndDate);
        }
      } else if (resizeDirection === 'left') {
        // Resizing start date - move to the cell the mouse is over
        const newStartIndex = Math.min(resizeStart.endIndex, clampedCellIndex);
        const newStartDate = new Date(calendarDays[newStartIndex]);
        newStartDate.setHours(0, 0, 0, 0);
        const newDuration = differenceInDays(endDate, newStartDate) + 1;
        
        if (newDuration >= 1 && newStartIndex !== resizeStart.startIndex && onResize) {
          onResize(job._id, newDuration, endDate, newStartDate);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeStart(null);
      setResizeDirection(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, resizeDirection, startDate, endDate, calendarDays, job._id, onResize]);

  // Render individual day blocks (Google Calendar style - one block per day)
  return (
    <>
      {dayBlocks.map((block, blockIndex) => {
        // Each block should be positioned in its own day cell
        // Left: based on column (0-6), each column is 1/7 of the grid width
        // Top: based on row (same vertical position within the row)
        // The grid has no gap, so each cell is exactly 1/7 width
        const safeLeft = block.left; // Already calculated as col * cellWidth
        const safeWidth = cellWidth - 0.5; // Small margin to avoid overlap
        const safeTop = block.top; // Already calculated for the row

        return (
          <Box
            key={`${job._id}-day-${block.index}`}
            ref={blockIndex === 0 ? barRef : null}
            sx={{
              position: 'absolute',
              left: `${safeLeft}%`,
              width: `${safeWidth}%`,
              top: `${safeTop}px`,
              height: `${barHeight}px`,
              backgroundColor: isHovered ? (job.color || '#1565C0') : (job.color || '#1976D2'),
              opacity: isHovered ? 0.9 : 1,
              color: 'white',
              borderRadius: '4px',
              p: 0.5,
              fontSize: '0.7rem',
              cursor: 'move',
              userSelect: 'none',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              transition: 'background-color 0.2s',
              boxSizing: 'border-box',
              overflow: 'hidden',
              '&:hover': {
                backgroundColor: '#1565C0',
              },
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            draggable={blockIndex === 0 && canModify}
            onDragStart={(e) => {
              if (blockIndex === 0 && canModify) {
                e.dataTransfer.setData('scheduledJobId', job._id);
                e.dataTransfer.setData('currentStartDate', startDate.toISOString());
              } else {
                e.preventDefault();
              }
            }}
            sx={{
              cursor: canModify ? 'move' : 'default',
            }}
          >
            {/* Small dot indicator on left */}
            <Box
              sx={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'white',
                mr: 0.5,
                flexShrink: 0,
              }}
            />
            <Typography 
              variant="caption" 
              sx={{ 
                fontWeight: 500, 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap', 
                flex: 1,
                fontSize: '0.7rem',
              }}
            >
              {job.title}
            </Typography>
            
            {/* Resize handles - only on first and last blocks */}
            {block.isFirst && canModify && (
              <Box
                onMouseDown={(e) => handleMouseDown(e, 'left')}
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: '6px',
                  cursor: 'w-resize',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  },
                }}
              />
            )}
            
            {block.isLast && canModify && (
              <Box
                onMouseDown={(e) => handleMouseDown(e, 'right')}
                sx={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '6px',
                  cursor: 'e-resize',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  },
                }}
              />
            )}
          </Box>
        );
      })}
    </>
  );
}

// Calendar Day Component
function CalendarDay({ date, scheduledJobs, onDrop, onJobMove, onJobResize, isCurrentMonth, isLastInRow, canModify = true }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (!canModify) {
      toast.error('You do not have permission to modify calendar events');
      return;
    }
    
    const jobId = e.dataTransfer.getData('jobId');
    const scheduledJobId = e.dataTransfer.getData('scheduledJobId');
    const duration = parseInt(e.dataTransfer.getData('duration') || '5');
    const currentStartDate = e.dataTransfer.getData('currentStartDate');

    if (scheduledJobId && currentStartDate) {
      // Moving an existing scheduled job - preserve duration
      const oldStartDate = new Date(currentStartDate);
      const job = scheduledJobs.find(j => j._id === scheduledJobId);
      const oldEndDate = job?.schedule?.endDate 
        ? new Date(job.schedule.endDate)
        : oldStartDate;
      const oldDuration = differenceInDays(oldEndDate, oldStartDate) + 1;
      
      // Create date in local timezone to avoid timezone shifts
      const dateYear = date.getFullYear();
      const dateMonth = date.getMonth();
      const dateDay = date.getDate();
      
      const newStartDate = new Date(dateYear, dateMonth, dateDay, 0, 0, 0, 0);
      const newEndDate = new Date(dateYear, dateMonth, dateDay + oldDuration - 1, 23, 59, 59, 999);
      
      if (onJobMove) {
        onJobMove(scheduledJobId, newStartDate, newEndDate);
      }
    } else if (jobId) {
      // Dropping a bench job
      // Create date in local timezone to avoid timezone shifts
      const dateYear = date.getFullYear();
      const dateMonth = date.getMonth();
      const dateDay = date.getDate();
      
      const newStartDate = new Date(dateYear, dateMonth, dateDay, 0, 0, 0, 0);
      const newEndDate = new Date(dateYear, dateMonth, dateDay + duration - 1, 23, 59, 59, 999);
      
      console.log('Calculating end date:', {
        dropDate: format(date, 'MMM dd, yyyy'),
        startDate: newStartDate.toISOString(),
        endDate: newEndDate.toISOString(),
        startDateFormatted: format(newStartDate, 'MMM dd, yyyy'),
        endDateFormatted: format(newEndDate, 'MMM dd, yyyy'),
        duration,
        calculatedDays: differenceInDays(newEndDate, newStartDate) + 1
      });
      
      if (onDrop) {
        onDrop(jobId, newStartDate, newEndDate, duration);
      }
    }
  };

  const handleDragOver = (e) => {
    if (!canModify) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  return (
    <Box
      sx={{
        minHeight: 100,
        p: 1,
        borderRight: isLastInRow ? 'none' : '1px solid #e0e0e0',
        borderBottom: '1px solid #e0e0e0',
        backgroundColor: isDragOver ? '#E3F2FD' : isCurrentMonth ? 'white' : '#fafafa',
        opacity: isCurrentMonth ? 1 : 0.5,
        transition: 'background-color 0.2s',
        position: 'relative',
        '&:hover': {
          backgroundColor: isCurrentMonth ? '#f5f5f5' : '#f0f0f0',
        },
      }}
      onDrop={canModify ? handleDrop : undefined}
      onDragOver={canModify ? handleDragOver : undefined}
      onDragLeave={canModify ? handleDragLeave : undefined}
    >
      <Typography
        variant="body2"
        sx={{
          fontWeight: isToday(date) ? 700 : 500,
          color: isToday(date) ? 'primary.main' : isCurrentMonth ? 'text.primary' : 'text.secondary',
          mb: 0.5,
          fontSize: isToday(date) ? '0.9rem' : '0.85rem',
        }}
      >
        {format(date, 'd')}
      </Typography>
      {/* Jobs are now rendered at month level as multi-day bars */}
    </Box>
  );
}

function CalendarPage() {
  const { canModifyCalendar } = useAuth();
  const [benchJobs, setBenchJobs] = useState([]);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedJob, setDraggedJob] = useState(null);
  const [benchHeight, setBenchHeight] = useState(250); // Default height in pixels
  const [searchTerm, setSearchTerm] = useState('');
  const [showScheduledList, setShowScheduledList] = useState(false);
  const [isBenchDragOver, setIsBenchDragOver] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/jobs`);
      const allJobs = response.data.jobs || response.data || [];
      
      console.log('Raw jobs response:', {
        totalJobs: allJobs.length,
        sampleJob: allJobs[0] ? {
          id: allJobs[0]._id,
          title: allJobs[0].title,
          stage: allJobs[0].stage,
          schedule: allJobs[0].schedule,
          isArchived: allJobs[0].isArchived,
          isDeadEstimate: allJobs[0].isDeadEstimate
        } : null
      });
      
      // Filter bench jobs (job readiness phase)
      const readinessStages = ['DEPOSIT_PENDING', 'JOB_PREP', 'TAKEOFF_COMPLETE', 'READY_TO_SCHEDULE'];
      const bench = allJobs.filter(job => 
        readinessStages.includes(job.stage) && 
        !job.isArchived && 
        !job.isDeadEstimate
      );
      
      // Filter scheduled jobs - check both schedule.startDate and stage SCHEDULED
      const scheduled = allJobs.filter(job => {
        const hasSchedule = job.schedule?.startDate;
        const isScheduledStage = job.stage === 'SCHEDULED';
        const notArchived = !job.isArchived;
        const notDeadEstimate = !job.isDeadEstimate;
        
        // Include if it has a schedule date OR is in SCHEDULED stage
        const shouldInclude = (hasSchedule || isScheduledStage) && notArchived && notDeadEstimate;
        
        if (shouldInclude && !hasSchedule) {
          console.warn('Job has SCHEDULED stage but no schedule.startDate:', {
            id: job._id,
            title: job.title,
            stage: job.stage,
            schedule: job.schedule
          });
        }
        
        return shouldInclude;
      });
      
      console.log('Fetched jobs:', {
        total: allJobs.length,
        bench: bench.length,
        scheduled: scheduled.length,
        scheduledJobs: scheduled.map(j => ({
          id: j._id,
          title: j.title,
          startDate: j.schedule?.startDate,
          endDate: j.schedule?.endDate,
          stage: j.stage,
          customer: j.customerId?.name
        }))
      });
      
      setBenchJobs(bench);
      setScheduledJobs(scheduled);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      console.error('Error response:', error.response?.data);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleDropJob = async (jobId, startDate, endDate, duration) => {
    if (!canModifyCalendar()) {
      toast.error('You do not have permission to modify calendar events');
      return;
    }
    try {
      // Normalize dates to start of day to avoid timezone issues
      const normalizedStartDate = new Date(startDate);
      normalizedStartDate.setHours(0, 0, 0, 0);
      const normalizedEndDate = new Date(endDate);
      normalizedEndDate.setHours(23, 59, 59, 999);

      console.log('Scheduling job:', {
        jobId,
        startDate: normalizedStartDate.toISOString(),
        endDate: normalizedEndDate.toISOString(),
        startDateFormatted: format(normalizedStartDate, 'MMM dd, yyyy'),
        endDateFormatted: format(normalizedEndDate, 'MMM dd, yyyy'),
        duration,
        calculatedDays: differenceInDays(normalizedEndDate, normalizedStartDate) + 1
      });

      const response = await axios.patch(`${API_URL}/jobs/${jobId}`, {
        schedule: {
          startDate: normalizedStartDate.toISOString(),
          endDate: normalizedEndDate.toISOString()
        },
        stage: 'SCHEDULED',
      });

      console.log('Job update response:', {
        jobId,
        response: response.data,
        updatedJob: response.data.job || response.data
      });

      // Sync to Google Calendar
      try {
        await axios.post(`${API_URL}/calendar/jobs/${jobId}/sync`);
      } catch (calendarError) {
        // Don't fail if Google Calendar sync fails
        console.warn('Google Calendar sync failed:', calendarError);
      }

      toast.success('Job scheduled successfully');
      
      // Immediately refresh to get latest data
      await fetchJobs();
    } catch (error) {
      console.error('Error scheduling job:', error);
      console.error('Error details:', error.response?.data);
      toast.error('Failed to schedule job');
    }
  };

  const handleJobMove = async (jobId, newStartDate, newEndDate) => {
    if (!canModifyCalendar()) {
      toast.error('You do not have permission to modify calendar events');
      return;
    }
    try {
      // Normalize dates
      const normalizedStartDate = new Date(newStartDate);
      normalizedStartDate.setHours(0, 0, 0, 0);
      const normalizedEndDate = new Date(newEndDate);
      normalizedEndDate.setHours(23, 59, 59, 999);

      await axios.patch(`${API_URL}/jobs/${jobId}`, {
        schedule: {
          startDate: normalizedStartDate.toISOString(),
          endDate: normalizedEndDate.toISOString()
        },
      });

      // Sync to Google Calendar
      try {
        await axios.post(`${API_URL}/calendar/jobs/${jobId}/sync`);
      } catch (calendarError) {
        console.warn('Google Calendar sync failed:', calendarError);
      }

      toast.success('Job moved successfully');
      await fetchJobs();
    } catch (error) {
      console.error('Error moving job:', error);
      console.error('Error details:', error.response?.data);
      console.error('Error status:', error.response?.status);
      toast.error(error.response?.data?.error || 'Failed to move job');
    }
  };

  const handleJobResize = async (jobId, newDuration, newEndDate, newStartDate = null) => {
    if (!canModifyCalendar()) {
      toast.error('You do not have permission to modify calendar events');
      return;
    }
    try {
      const job = scheduledJobs.find(j => j._id === jobId);
      if (!job) return;

      // Normalize dates
      const normalizedEndDate = new Date(newEndDate);
      normalizedEndDate.setHours(23, 59, 59, 999);
      
      const scheduleUpdate = {
        ...job.schedule,
        endDate: normalizedEndDate.toISOString()
      };

      // If newStartDate is provided (left-edge resize), update it
      if (newStartDate) {
        const normalizedStartDate = new Date(newStartDate);
        normalizedStartDate.setHours(0, 0, 0, 0);
        scheduleUpdate.startDate = normalizedStartDate.toISOString();
      }

      await axios.patch(`${API_URL}/jobs/${jobId}`, {
        schedule: scheduleUpdate,
      });

      // Sync to Google Calendar (debounced - only on final release)
      setTimeout(async () => {
        try {
          await axios.post(`${API_URL}/calendar/jobs/${jobId}/sync`);
        } catch (calendarError) {
          console.warn('Google Calendar sync failed:', calendarError);
        }
      }, 500);

      // Don't show toast on every resize, only on final release
      await fetchJobs();
    } catch (error) {
      console.error('Error resizing job:', error);
      toast.error('Failed to resize job');
    }
  };

  const handleMoveToBench = async (jobId) => {
    try {
      await axios.patch(`${API_URL}/jobs/${jobId}`, {
        schedule: {
          startDate: null,
          endDate: null
        },
        stage: 'READY_TO_SCHEDULE',
      });

      // Remove from Google Calendar if synced
      try {
        await axios.delete(`${API_URL}/calendar/jobs/${jobId}/sync`);
      } catch (calendarError) {
        // Don't fail if Google Calendar sync fails
        console.warn('Google Calendar removal failed:', calendarError);
      }

      toast.success('Job moved back to bench');
      await fetchJobs();
    } catch (error) {
      console.error('Error moving job to bench:', error);
      console.error('Error details:', error.response?.data);
      toast.error('Failed to move job to bench');
    }
  };

  const handleBenchDrop = (e) => {
    e.preventDefault();
    setIsBenchDragOver(false);
    
    const scheduledJobId = e.dataTransfer.getData('scheduledJobId');
    
    if (scheduledJobId) {
      handleMoveToBench(scheduledJobId);
    }
  };

  const handleBenchDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsBenchDragOver(true);
  };

  const handleBenchDragLeave = () => {
    setIsBenchDragOver(false);
  };

  const months = useMemo(() => {
    const monthsArray = [];
    for (let i = 0; i < 3; i++) {
      monthsArray.push(addMonths(new Date(), i));
    }
    return monthsArray;
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      overflow: 'hidden',
      backgroundColor: '#f5f5f5'
    }}>
      {/* Calendar Header */}
      <Box sx={{ 
        p: 2, 
        backgroundColor: 'white', 
        borderBottom: '1px solid #e0e0e0',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 2
      }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Calendar
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search scheduled jobs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 250 }}
          />
          <Button
            variant="outlined"
            startIcon={<CalendarTodayIcon />}
            onClick={() => setShowScheduledList(true)}
          >
            All Scheduled ({scheduledJobs.length})
          </Button>
        </Box>
      </Box>

      {/* Scrollable Calendar Content */}
      <Box sx={{ 
        flex: 1, 
        overflowY: 'auto', 
        overflowX: 'hidden',
        p: 3
      }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '100%' }}>
          {months.map((month, monthIndex) => {
            const monthStart = startOfMonth(month);
            const monthEnd = endOfMonth(month);
            const calendarStart = startOfWeek(monthStart);
            const calendarEnd = endOfWeek(monthEnd);
            const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

            // Filter jobs that overlap with this month
            const monthJobs = scheduledJobs.filter(job => {
              if (!job.schedule?.startDate) {
                console.log('Job filtered out (no startDate):', job.title);
                return false;
              }
              const jobStart = new Date(job.schedule.startDate);
              const jobEnd = job.schedule.endDate ? new Date(job.schedule.endDate) : jobStart;
              // Check if job overlaps with this month
              const overlaps = jobEnd >= calendarStart && jobStart <= calendarEnd;
              if (!overlaps) {
                console.log('Job filtered out (no overlap):', {
                  title: job.title,
                  start: format(jobStart, 'yyyy-MM-dd'),
                  end: format(jobEnd, 'yyyy-MM-dd'),
                  calendarStart: format(calendarStart, 'yyyy-MM-dd'),
                  calendarEnd: format(calendarEnd, 'yyyy-MM-dd'),
                });
              }
              return overlaps;
            });
            
            console.log(`Month ${format(month, 'MMMM yyyy')}: Found ${monthJobs.length} jobs to render`, 
              monthJobs.map(j => ({ title: j.title, start: j.schedule?.startDate, end: j.schedule?.endDate }))
            );

            return (
              <Box key={monthIndex} sx={{ backgroundColor: 'white', borderRadius: 2, p: 2, boxShadow: 1 }}>
                <Typography variant="h5" sx={{ mb: 2, fontWeight: 600, color: 'text.primary' }}>
                  {format(month, 'MMMM yyyy')}
                </Typography>
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(7, 1fr)', 
                  gap: 0,
                  border: '1px solid #e0e0e0',
                  borderRadius: 1,
                  overflow: 'visible', // Changed from 'hidden' to 'visible' so bars can show
                  position: 'relative',
                  minHeight: '600px', // Ensure enough height for job bars
                }}>
                  {/* Day headers */}
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <Box
                      key={day}
                      sx={{
                        p: 1.5,
                        textAlign: 'center',
                        backgroundColor: '#f5f5f5',
                        borderRight: '1px solid #e0e0e0',
                        '&:last-child': { borderRight: 'none' },
                        borderBottom: '1px solid #e0e0e0',
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        {day}
                      </Typography>
                    </Box>
                  ))}
                  {/* Calendar days */}
                  {days.map((day, dayIndex) => (
                    <CalendarDay
                      key={day.toISOString()}
                      date={day}
                      scheduledJobs={scheduledJobs}
                      onDrop={handleDropJob}
                      onJobMove={handleJobMove}
                      onJobResize={handleJobResize}
                      isCurrentMonth={isSameMonth(day, month)}
                      isLastInRow={(dayIndex + 1) % 7 === 0}
                      canModify={canModifyCalendar()}
                    />
                  ))}
                  {/* Multi-day job bars */}
                  {monthJobs.length > 0 && console.log(`Rendering ${monthJobs.length} job bars for ${format(month, 'MMMM yyyy')}`, 
                    monthJobs.map(j => ({ title: j.title, start: j.schedule?.startDate, end: j.schedule?.endDate }))
                  )}
                  {monthJobs.map((job) => {
                    if (!job.schedule?.startDate) {
                      console.warn('Skipping job without startDate:', job.title);
                      return null;
                    }
                    return (
                      <MultiDayJobBar
                        key={job._id}
                        job={job}
                        calendarDays={days}
                        onResize={handleJobResize}
                        onMove={handleJobMove}
                        canModify={canModifyCalendar()}
                      />
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Bench Footer */}
      <Box 
        sx={{ 
          flexShrink: 0,
          backgroundColor: isBenchDragOver ? '#E3F2FD' : 'white',
          borderTop: `2px solid ${isBenchDragOver ? '#1976D2' : '#e0e0e0'}`,
          p: 2,
          height: `${benchHeight}px`,
          overflowY: 'auto',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.2s',
        }}
        onDrop={handleBenchDrop}
        onDragOver={handleBenchDragOver}
        onDragLeave={handleBenchDragLeave}
      >
        {/* Resize Handle */}
        <Box
          onMouseDown={(e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = benchHeight;
            
            const handleMouseMove = (moveEvent) => {
              const deltaY = startY - moveEvent.clientY; // Inverted because we're dragging up
              const newHeight = Math.max(150, Math.min(600, startHeight + deltaY));
              setBenchHeight(newHeight);
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
            top: 0,
            left: 0,
            right: 0,
            height: '8px',
            cursor: 'ns-resize',
            backgroundColor: 'transparent',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.1)',
            },
            '&:active': {
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
            },
            transition: 'background-color 0.2s',
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Bench ({benchJobs.length})
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Jobs ready to schedule. Drag to calendar to schedule. Drag scheduled jobs here to unschedule.
          </Typography>
        </Box>
        {benchJobs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No jobs on the bench
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {benchJobs.map((job) => (
              <BenchJobCard key={job._id} job={job} onDragStart={setDraggedJob} canModify={canModifyCalendar()} />
            ))}
          </Box>
        )}
      </Box>

      {/* Scheduled Jobs Dialog */}
      <Dialog
        open={showScheduledList}
        onClose={() => setShowScheduledList(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          All Scheduled Jobs ({scheduledJobs.length})
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
            {scheduledJobs.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No scheduled jobs
              </Typography>
            ) : (
              scheduledJobs
                .filter(job => {
                  if (!searchTerm) return true;
                  const search = searchTerm.toLowerCase();
                  return (
                    job.title?.toLowerCase().includes(search) ||
                    job.customerId?.name?.toLowerCase().includes(search) ||
                    job._id?.toLowerCase().includes(search)
                  );
                })
                .map((job) => {
                  const startDate = job.schedule?.startDate ? new Date(job.schedule.startDate) : null;
                  const endDate = job.schedule?.endDate ? new Date(job.schedule.endDate) : null;
                  
                  return (
                    <Card key={job._id} sx={{ borderLeft: '4px solid #1976D2' }}>
                      <CardContent sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                              {job.title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              Customer: {job.customerId?.name || 'Unknown'}
                            </Typography>
                            {startDate && (
                              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                <Chip
                                  label={`Start: ${format(startDate, 'MMM dd, yyyy')}`}
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                />
                                {endDate && (
                                  <Chip
                                    label={`End: ${format(endDate, 'MMM dd, yyyy')}`}
                                    size="small"
                                    color="secondary"
                                    variant="outlined"
                                  />
                                )}
                                <Chip
                                  label={`Stage: ${job.stage || 'N/A'}`}
                                  size="small"
                                  variant="outlined"
                                />
                              </Box>
                            )}
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowScheduledList(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CalendarPage;
