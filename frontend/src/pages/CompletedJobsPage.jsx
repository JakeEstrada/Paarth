import { useState, useEffect } from 'react';
import {
  Typography,
  Container,
  Box,
  Card,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import JobDetailModal from '../components/jobs/JobDetailModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function CompletedJobsPage() {
  const [completedJobs, setCompletedJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);

  useEffect(() => {
    fetchCompletedJobs();
  }, []);

  const fetchCompletedJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/jobs/completed`);
      setCompletedJobs(response.data);
    } catch (error) {
      console.error('Error fetching completed jobs:', error);
      toast.error('Failed to load completed jobs');
    } finally {
      setLoading(false);
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
    return jobs.reduce((sum, job) => sum + (job.valueContracted || job.valueEstimated || 0), 0);
  };

  const handleJobUpdate = async (jobId, updates) => {
    try {
      await axios.patch(`${API_URL}/jobs/${jobId}`, updates);
      toast.success('Job updated');
      fetchCompletedJobs();
    } catch (error) {
      console.error('Error updating job:', error);
      toast.error('Failed to update job');
    }
  };

  const handleJobDelete = async (jobId) => {
    await fetchCompletedJobs();
  };

  const handleJobArchive = async (jobId) => {
    await fetchCompletedJobs();
  };

  return (
    <Box>
      {/* Main Content */}
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h1" sx={{ mb: 1 }}>
            Completed Jobs
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Successfully completed projects with final payment closed
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : completedJobs.length === 0 ? (
          <Card sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No completed jobs yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Jobs that reach Final Payment Closed will appear here
            </Typography>
          </Card>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {completedJobs.map((group) => (
              <Accordion
                key={`${group.year}-${group.month}`}
                defaultExpanded={completedJobs.indexOf(group) === 0}
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
                        {group.jobs.length} job{group.jobs.length !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Typography variant="h6" sx={{ color: '#43A047', fontWeight: 500 }}>
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
                    {group.jobs.map((job) => (
                      <Card
                        key={job._id}
                        onClick={() => setSelectedJobId(job._id)}
                        sx={{
                          borderLeft: '4px solid #43A047',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                            transform: 'translateY(-2px)',
                          },
                        }}
                      >
                        <Box sx={{ p: 2 }}>
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
                              {formatCurrency(job.valueContracted || job.valueEstimated)}
                            </Typography>
                            <Chip
                              label="Completed"
                              size="small"
                              sx={{
                                backgroundColor: '#43A04715',
                                color: '#43A047',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                              }}
                            />
                          </Box>
                        </Box>
                      </Card>
                    ))}
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
      </Container>
    </Box>
  );
}

export default CompletedJobsPage;

