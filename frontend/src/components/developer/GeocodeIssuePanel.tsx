import { Box, Paper, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import api from '../../utils/axios';

type GeoIssue = {
  id: string;
  title: string;
  stage: string;
  customerName: string;
  address: string;
  reason: string;
  isArchived?: boolean;
  isDeadEstimate?: boolean;
};

export default function GeocodeIssuePanel() {
  const [jobs, setJobs] = useState<GeoIssue[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api
      .get('/jobs/geo-issues')
      .then((response) => {
        if (!cancelled) setJobs(response.data?.jobs || []);
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((job) =>
      [job.customerName, job.title, job.address, job.reason, job.stage]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [jobs, query]);

  return (
    <Paper sx={{ p: 2.5, mb: 4, borderRadius: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        Jobs missing map points ({jobs.length})
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        These addresses did not convert to latitude/longitude. Search by customer, job, or address,
        then fix the street on the job or customer and save.
      </Typography>
      <TextField
        size="small"
        fullWidth
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search customer, job, address..."
        sx={{ mb: 2 }}
      />
      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : null}
      {!loading && !filtered.length ? (
        <Typography variant="body2" color="text.secondary">
          {jobs.length ? 'No matches.' : 'Every job with an address has a map point.'}
        </Typography>
      ) : null}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 420, overflow: 'auto' }}>
        {filtered.map((job) => (
          <Box
            key={job.id}
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {job.customerName || 'No customer'} · {job.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {job.address || 'No address'} · {job.reason}
              {job.isArchived ? ' · archived' : ''}
              {job.isDeadEstimate ? ' · dead estimate' : ''}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
