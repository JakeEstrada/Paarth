import {
  Box,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { CalendarToday as CalendarIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import {
  formatJobScheduleDateRange,
  getJobScheduleDayCount,
  getJobScheduleSegments,
} from '../../utils/jobSchedule';

type JobSchedulePanelProps = {
  job: {
    schedule?: {
      crewNotes?: string;
      installer?: string;
      installers?: string[];
      startDate?: string;
      endDate?: string;
      entries?: Array<{
        installer?: string;
        startDate?: string;
        endDate?: string;
      }>;
    };
  } | null;
};

export default function JobSchedulePanel({ job }: JobSchedulePanelProps) {
  const segments = getJobScheduleSegments(job);
  const crewNotes = String(job?.schedule?.crewNotes || '').trim();
  const uniqueInstallers = [...new Set(segments.map((segment) => segment.installer))];

  if (!segments.length) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CalendarIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          This job is not scheduled on the calendar yet.
        </Typography>
        <Button component={RouterLink} to="/calendar" variant="outlined">
          Open calendar
        </Button>
      </Paper>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {segments.length} visit{segments.length === 1 ? '' : 's'} on the calendar
        {uniqueInstallers.length > 1
          ? ` · ${uniqueInstallers.length} installers`
          : uniqueInstallers[0]
            ? ` · ${uniqueInstallers[0]}`
            : ''}
        . Jobs can span multiple weeks when work is split across return visits.
      </Typography>

      {crewNotes ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Crew notes
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {crewNotes}
          </Typography>
        </Paper>
      ) : null}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 48 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Installer</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Scheduled dates</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Days
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {segments.map((segment, index) => (
              <TableRow key={segment.id} hover>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <Chip label={segment.installer} size="small" sx={{ fontWeight: 600 }} />
                </TableCell>
                <TableCell>{formatJobScheduleDateRange(segment.startDate, segment.endDate)}</TableCell>
                <TableCell align="right">
                  {getJobScheduleDayCount(segment.startDate, segment.endDate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Button component={RouterLink} to="/calendar" size="small" sx={{ mt: 2 }}>
        View on calendar
      </Button>
    </Box>
  );
}
