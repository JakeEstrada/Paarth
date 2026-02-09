import { useState, useEffect, useMemo } from 'react';
import {
  Typography,
  Container,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, Unarchive as UnarchiveIcon } from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import JobCard from '../components/pipeline/JobCard';
import JobDetailModal from '../components/jobs/JobDetailModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function JobArchivePage() {
  const [deadEstimates, setDeadEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuJob, setContextMenuJob] = useState(null);

  useEffect(() => {
    const initialize = async () => {
      // First, auto-move any dead estimates
      await autoMoveDeadEstimates();
      // Then fetch the updated archived jobs list
      await fetchArchivedJobs();
    };
    initialize();
  }, []);

  const fetchArchivedJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/jobs/archive`);
      setDeadEstimates(response.data);
    } catch (error) {
      console.error('Error fetching archived jobs:', error);
      toast.error('Failed to load archived jobs');
    } finally {
      setLoading(false);
    }
  };

  const autoMoveDeadEstimates = async () => {
    try {
      const response = await axios.post(`${API_URL}/jobs/dead-estimates/auto-move`);
      if (response.data.count > 0) {
        console.log(`Auto-moved ${response.data.count} jobs to dead estimates`);
      }
    } catch (error) {
      console.error('Error auto-moving dead estimates:', error);
    }
  };

  const formatCurrency = (value) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getTotalValue = (jobs) => {
    return jobs.reduce((sum, job) => sum + (job.valueEstimated || 0), 0);
  };

  const getDaysSinceSent = (sentAt) => {
    if (!sentAt) return null;
    const sentDate = new Date(sentAt);
    const now = new Date();
    const diffTime = Math.abs(now - sentDate);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const handleJobUpdate = async (jobId, updates) => {
    try {
      await axios.patch(`${API_URL}/jobs/${jobId}`, updates);
      toast.success('Job updated');
      fetchArchivedJobs(); // Refresh
    } catch (error) {
      console.error('Error updating job:', error);
      toast.error('Failed to update job');
    }
  };

  const handleJobDelete = async (jobId) => {
    await fetchArchivedJobs(); // Refresh the list
  };

  const handleJobArchive = async (jobId) => {
    await fetchArchivedJobs(); // Refresh the list
  };

  const handleContextMenu = (event, job) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
          }
        : null
    );
    setContextMenuJob(job);
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
    setContextMenuJob(null);
  };

  const handleUnarchive = async () => {
    if (!contextMenuJob) return;
    
    try {
      await axios.post(`${API_URL}/jobs/${contextMenuJob._id}/unarchive`);
      toast.success('Job restored from archive');
      handleCloseContextMenu();
      await fetchArchivedJobs(); // Refresh the list
    } catch (error) {
      console.error('Error unarchiving job:', error);
      toast.error('Failed to restore job from archive');
    }
  };

  // Reorganize data by year, then by month
  const organizedByYear = useMemo(() => {
    const byYear = {};
    
    deadEstimates.forEach((group) => {
      const year = group.year;
      if (!byYear[year]) {
        byYear[year] = {
          year,
          months: []
        };
      }
      byYear[year].months.push(group);
    });
    
    // Sort months within each year (most recent first)
    Object.keys(byYear).forEach(year => {
      byYear[year].months.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
    });
    
    return byYear;
  }, [deadEstimates]);

  // Get available years (sorted, most recent first)
  const availableYears = useMemo(() => {
    const years = Object.keys(organizedByYear).map(Number);
    return years.sort((a, b) => b - a);
  }, [organizedByYear]);

  // Set selected year to current year if available, otherwise first available year
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    } else if (availableYears.length > 0 && availableYears[0] !== new Date().getFullYear()) {
      // If current year is not available, use the most recent year
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears]);

  // Get months for selected year
  const selectedYearMonths = useMemo(() => {
    return organizedByYear[selectedYear]?.months || [];
  }, [organizedByYear, selectedYear]);

  return (
    <Box>
      {/* Main Content */}
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h1" sx={{ mb: 1 }}>
                Job Archive
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Dead estimates - estimates sent but no response after 7 days
              </Typography>
            </Box>
            {availableYears.length > 0 && (
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel id="year-select-label">Year</InputLabel>
                <Select
                  labelId="year-select-label"
                  id="year-select"
                  value={selectedYear}
                  label="Year"
                  onChange={(e) => setSelectedYear(e.target.value)}
                >
                  {availableYears.map((year) => (
                    <MenuItem key={year} value={year}>
                      {year}
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
        ) : deadEstimates.length === 0 ? (
          <Card sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No archived jobs yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Archived jobs and estimates with no response after 7 days will appear here
            </Typography>
          </Card>
        ) : selectedYearMonths.length === 0 ? (
          <Card sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No archived jobs for {selectedYear}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Select a different year to view archived jobs
            </Typography>
          </Card>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {selectedYearMonths.map((group, index) => (
              <Accordion
                key={`${group.year}-${group.month}`}
                defaultExpanded={index === 0}
                sx={{
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  borderRadius: '12px !important',
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    px: 3,
                    py: 2,
                    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.02)' },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', pr: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {group.monthName} {group.year}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {group.jobs.length} estimate{group.jobs.length !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Typography variant="h6" sx={{ color: '#1976D2', fontWeight: 500 }}>
                        {formatCurrency(getTotalValue(group.jobs))}
                      </Typography>
                    </Box>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 3, pb: 3 }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: 2,
                      mt: 2,
                    }}
                  >
                    {group.jobs.map((job) => {
                      const daysSince = getDaysSinceSent(job.estimate?.sentAt);
                      return (
                        <Card
                          key={job._id}
                          onClick={() => setSelectedJobId(job._id)}
                          onContextMenu={(e) => handleContextMenu(e, job)}
                          sx={{
                            borderLeft: '4px solid #D32F2F',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                              transform: 'translateY(-2px)',
                            },
                          }}
                        >
                          <CardContent sx={{ p: 2 }}>
                            <Typography
                              variant="subtitle1"
                              sx={{
                                fontWeight: 600,
                                mb: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {job.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                              {job.customerId?.name || 'Unknown Customer'}
                            </Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
                              <Typography variant="h6" sx={{ color: '#43A047', fontWeight: 500 }}>
                                {formatCurrency(job.valueEstimated)}
                              </Typography>
                              {daysSince !== null && (
                                <Chip
                                  label={`${daysSince} day${daysSince !== 1 ? 's' : ''} old`}
                                  size="small"
                                  sx={{
                                    backgroundColor: '#D32F2F15',
                                    color: '#D32F2F',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                  }}
                                />
                              )}
                            </Box>
                            {job.estimate?.sentAt && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                Sent: {new Date(job.estimate.sentAt).toLocaleDateString()}
                              </Typography>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}

        {/* Job Detail Modal */}
        <JobDetailModal
          jobId={selectedJobId}
          open={!!selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onJobUpdate={handleJobUpdate}
          onJobDelete={handleJobDelete}
          onJobArchive={handleJobArchive}
        />

        {/* Context Menu */}
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
          <MenuItem onClick={handleUnarchive}>
            <ListItemIcon>
              <UnarchiveIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Restore from Archive</ListItemText>
          </MenuItem>
        </Menu>
      </Container>
    </Box>
  );
}

export default JobArchivePage;

