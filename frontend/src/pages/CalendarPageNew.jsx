import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  CircularProgress,
  Card,
  CardContent,
  Menu,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
  Autocomplete,
  Tooltip,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Today as TodayIcon,
  CheckCircle as CheckCircleIcon,
  DragIndicator as DragIndicatorIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
} from '@mui/icons-material';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, startOfWeek, endOfWeek, isSameDay, addDays } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTheme as useAppTheme } from '../context/ThemeContext';
import JobDetailModal from '../components/jobs/JobDetailModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CALENDAR_HIDDEN_WEEKDAYS_KEY = 'calendarHiddenWeekdays';
const CALENDAR_BENCH_POSITION_KEY = 'calendarBenchPosition';
const SHOP_VIEW_PIN = '1030';
const SHOP_VIEW_AUTO_LOCK_MS = 5 * 60 * 1000;

// Default installer order used for calendar lanes and suggestions
const DEFAULT_INSTALLER_ORDER = [
  'Nick',
  'Ed',
  'Eder',
  'Daniel',
  'Moris',
  'Hayden'
];

function toISODate(year, month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const first = new Date(year, monthIndex, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, monthIndex, 1 + offset + (nth - 1) * 7);
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const last = new Date(year, monthIndex + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, monthIndex, last.getDate() - offset);
}

function buildMajorUSHolidayMap(year) {
  const map = {};
  map[toISODate(year, 1, 1)] = "New Year's Day";
  map[format(nthWeekdayOfMonth(year, 0, 1, 3), 'yyyy-MM-dd')] = 'Martin Luther King Jr. Day';
  map[format(nthWeekdayOfMonth(year, 1, 1, 3), 'yyyy-MM-dd')] = "Presidents' Day";
  map[format(lastWeekdayOfMonth(year, 4, 1), 'yyyy-MM-dd')] = 'Memorial Day';
  map[toISODate(year, 6, 19)] = 'Juneteenth';
  map[toISODate(year, 7, 4)] = 'Independence Day';
  map[format(nthWeekdayOfMonth(year, 8, 1, 1), 'yyyy-MM-dd')] = 'Labor Day';
  map[format(nthWeekdayOfMonth(year, 10, 4, 4), 'yyyy-MM-dd')] = 'Thanksgiving';
  map[toISODate(year, 12, 25)] = 'Christmas Day';
  return map;
}

// Anonymous Gregorian computus for Easter Sunday
function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getHolidayChipLabel(label, tvMode) {
  if (!label) return '';
  if (!tvMode) return label;
  const shortMap = {
    "New Year's Day": 'New Year',
    'Martin Luther King Jr. Day': 'MLK Day',
    "Presidents' Day": "Presidents'",
    'Memorial Day': 'Memorial',
    Juneteenth: 'Juneteenth',
    'Independence Day': 'Independence',
    'Labor Day': 'Labor',
    Thanksgiving: 'Thanksgiving',
    'Christmas Day': 'Christmas',
    Easter: 'Easter',
  };
  return shortMap[label] || label.replace(/\s+Day$/i, '');
}

// Event creation/edit modal
function EventModal({ open, onClose, selectedDate, job, onSave, onViewJob, installerOptions = [], selectedInstaller = '' }) {
  const theme = useTheme();
  const GROUP_ACCENTS = ['#1976D2', '#9C27B0', '#FF9800', '#4CAF50', '#3F51B5'];
  const getGroupAccent = (idx) => GROUP_ACCENTS[idx % GROUP_ACCENTS.length];

  const [formData, setFormData] = useState({
    title: '',
    startTime: '09:00',
    endTime: '17:00',
    allDay: true,
    excludeSaturdays: false,
    excludeSundays: false,
    recurrence: 'none', // none, daily, weekly, monthly, yearly
    recurrenceCount: 1,
    description: '',
    jobId: null,
    color: '#1976D2', // Default blue
    // Each entry is an independent "group":
    // { installer, start date, end date }
    entries: [{ installer: '', startDate: '', endDate: '' }],
  });
  const [availableJobs, setAvailableJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      // Set default dates from selected date or job
      const date = selectedDate || (job?.schedule?.startDate ? new Date(job.schedule.startDate) : new Date());
      const dateStr = format(date, 'yyyy-MM-dd');
      const legacyEndDateStr = job?.schedule?.endDate
        ? format(new Date(job.schedule.endDate), 'yyyy-MM-dd')
        : dateStr;

      const scheduleEntries = Array.isArray(job?.schedule?.entries) ? job.schedule.entries : [];
      let computedEntries = [];

      if (scheduleEntries.length > 0) {
        computedEntries = scheduleEntries.map((entry) => ({
          installer: entry?.installer || '',
          startDate: entry?.startDate ? format(new Date(entry.startDate), 'yyyy-MM-dd') : '',
          endDate: entry?.endDate ? format(new Date(entry.endDate), 'yyyy-MM-dd') : '',
        }));
      } else {
        // Backward compatibility: build grouped entries from legacy fields.
        const installersList = Array.isArray(job?.schedule?.installers) && job.schedule.installers.length > 0
          ? job.schedule.installers.filter(Boolean)
          : (job?.schedule?.installer ? [job.schedule.installer] : []);

        const installers = installersList.length > 0
          ? installersList
          : selectedInstaller
            ? [selectedInstaller]
            : [''];

        computedEntries = installers.map((inst) => ({
          installer: inst,
          startDate: dateStr,
          endDate: legacyEndDateStr,
        }));
      }

      if (selectedInstaller && computedEntries.length > 0 && !computedEntries[0].installer) {
        computedEntries[0].installer = selectedInstaller;
      }
      
      setFormData({
        title: job?.schedule?.title || job?.title || '',
        startTime: '09:00',
        endTime: '17:00',
        allDay: true,
        excludeSaturdays: false,
        excludeSundays: false,
        recurrence: job?.schedule?.recurrence?.type || 'none',
        recurrenceCount: job?.schedule?.recurrence?.count || 1,
        description: job?.customerId?.name ? `Customer: ${job.customerId.name}` : '',
        jobId: job?._id || null,
        color: job?.color || '#1976D2',
        entries: computedEntries,
      });

      // Fetch available jobs
      fetchAvailableJobs();
    }
  }, [open, selectedDate, job, selectedInstaller]);

  const fetchAvailableJobs = async () => {
    try {
      const response = await axios.get(`${API_URL}/jobs`);
      const jobs = response.data.jobs || response.data || [];
      setAvailableJobs(jobs.filter(j => !j.isArchived && !j.isDeadEstimate));
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  // Fuzzy match: every character of `query` appears in order in `str` (case-insensitive)
  const fuzzyMatch = (query, str) => {
    if (!query || !str) return true;
    const q = query.toLowerCase().trim();
    const s = String(str).toLowerCase();
    let i = 0;
    for (let j = 0; j < s.length && i < q.length; j++) {
      if (s[j] === q[i]) i++;
    }
    return i === q.length;
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    try {
      setLoading(true);

      // If jobId is selected, update the job's schedule
      if (formData.jobId) {
        const normalizedEntries = (formData.entries || [])
          .map((entry) => {
            const installer = String(entry?.installer || '').trim();
            const startDate = entry?.startDate || '';
            const endDate = entry?.endDate || entry?.startDate || '';
            return { installer, startDate, endDate };
          })
          .filter((entry) => entry.installer && entry.startDate);

        if (normalizedEntries.length === 0) {
          toast.error('Please add at least one installer group (installer + start date)');
          setLoading(false);
          return;
        }

        const shouldExcludeSaturdays = !!formData.excludeSaturdays;
        const shouldExcludeSundays = !!formData.excludeSundays;

        // Expand each entry range into allowed days, then re-group into smaller consecutive ranges.
        const expandedEntries = [];
        for (const entry of normalizedEntries) {
          const installer = entry.installer;
          const start = new Date(entry.startDate + 'T00:00:00');
          const end = new Date(entry.endDate + 'T00:00:00');

          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

          // Ensure start <= end
          const rangeStart = start.getTime() <= end.getTime() ? start : end;
          const rangeEnd = start.getTime() <= end.getTime() ? end : start;

          let groupStart = null; // Date
          let prevAllowed = null; // Date

          for (let d = rangeStart; d.getTime() <= rangeEnd.getTime(); d = addDays(d, 1)) {
            const day = d.getDay(); // 0=Sun, 6=Sat
            const isBlocked =
              (shouldExcludeSaturdays && day === 6) ||
              (shouldExcludeSundays && day === 0);

            if (isBlocked) {
              if (groupStart && prevAllowed) {
                expandedEntries.push({
                  installer,
                  startDate: format(groupStart, 'yyyy-MM-dd'),
                  endDate: format(prevAllowed, 'yyyy-MM-dd'),
                });
              }
              groupStart = null;
              prevAllowed = null;
              continue;
            }

            if (!groupStart) {
              groupStart = d;
              prevAllowed = d;
              continue;
            }

            const expectedNext = addDays(prevAllowed, 1);
            if (expectedNext.getTime() === d.getTime()) {
              prevAllowed = d;
            } else {
              expandedEntries.push({
                installer,
                startDate: format(groupStart, 'yyyy-MM-dd'),
                endDate: format(prevAllowed, 'yyyy-MM-dd'),
              });
              groupStart = d;
              prevAllowed = d;
            }
          }

          if (groupStart && prevAllowed) {
            expandedEntries.push({
              installer,
              startDate: format(groupStart, 'yyyy-MM-dd'),
              endDate: format(prevAllowed, 'yyyy-MM-dd'),
            });
          }
        }

        if (expandedEntries.length === 0) {
          toast.error('No valid days left after excluding weekends');
          setLoading(false);
          return;
        }

        const updatedEntries = expandedEntries.map((entry) => {
          const startDateTime = formData.allDay
            ? new Date(entry.startDate + 'T00:00:00')
            : new Date(entry.startDate + 'T' + formData.startTime);
          const endDateTime = formData.allDay
            ? new Date(entry.endDate + 'T23:59:59')
            : new Date(entry.endDate + 'T' + formData.endTime);

          return {
            installer: entry.installer,
            startDate: startDateTime.toISOString(),
            endDate: endDateTime.toISOString(),
          };
        });

        const legacyInstallers = Array.from(new Set(updatedEntries.map((e) => e.installer).filter(Boolean)));
        const earliest = updatedEntries.reduce((acc, e) =>
          new Date(e.startDate).getTime() <= new Date(acc.startDate).getTime() ? e : acc
        );
        const latest = updatedEntries.reduce((acc, e) =>
          new Date(e.endDate).getTime() >= new Date(acc.endDate).getTime() ? e : acc
        );

        await axios.patch(`${API_URL}/jobs/${formData.jobId}`, {
          schedule: {
            // Legacy single date range (Google sync + older clients)
            startDate: earliest.startDate,
            endDate: latest.endDate,
            installer: earliest.installer,
            installers: legacyInstallers,

            // Preferred multi-schedule model
            entries: updatedEntries,
            recurrence: {
              type: formData.recurrence,
              interval: 1,
              count: formData.recurrenceCount,
            },
            crewNotes: job?.schedule?.crewNotes,
            title: formData.title,
          },
          // Keep the existing job stage; do not auto-advance it when scheduling
          color: formData.color,
        });

        toast.success('Job scheduled successfully');

        // Sync to Google Calendar (optional; do not block on failure)
        try {
          await axios.post(`${API_URL}/calendar/jobs/${formData.jobId}/sync`);
        } catch (calendarError) {
          const status = calendarError.response?.status;
          const data = calendarError.response?.data;
          const msg = (data && (data.error || data.message)) || calendarError.message;
          if (status === 503 || (typeof msg === 'string' && (msg.includes('not configured') || msg.includes('sync failed')))) {
            toast('Saved. Google Calendar sync skipped.', { icon: 'ℹ️' });
          } else {
            toast('Saved. Google Calendar sync failed.', { icon: 'ℹ️' });
          }
        }
      } // end if (formData.jobId)

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving event:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to save event';
      console.error('Error details:', {
        message: errorMessage,
        status: error.response?.status,
        data: error.response?.data
      });
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };


  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          m: { xs: 1, sm: 2 },
          maxHeight: { xs: '95vh', sm: '90vh' },
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <span>{job ? 'Edit Event' : 'Schedule Job'}</span>
        {(job || formData.jobId) && onViewJob && (
          <Button
            size="small"
            startIcon={<PersonIcon />}
            onClick={() => {
              const id = formData.jobId || job?._id;
              if (id) {
                onViewJob(id);
                onClose();
              }
            }}
          >
            View job
          </Button>
        )}
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            fullWidth
            required
          />

          <Autocomplete
            options={availableJobs}
            value={availableJobs.find(j => j._id === formData.jobId) || null}
            onChange={(_, newValue) => {
              const selectedJob = newValue;
              setFormData({
                ...formData,
                jobId: selectedJob?._id || null,
                title: selectedJob?.schedule?.title || selectedJob?.title || formData.title,
                color: selectedJob?.color || formData.color,
              });
            }}
            getOptionLabel={(j) => (j && j.title) ? `${j.title} - ${j.customerId?.name || 'Unknown'}` : ''}
            filterOptions={(options, { inputValue }) => {
              const q = inputValue.trim();
              if (!q) return options;
              return options.filter(j => fuzzyMatch(q, `${j.title} ${j.customerId?.name || ''}`));
            }}
            renderInput={(params) => (
              <TextField {...params} label="Job (Optional)" placeholder="Type to search jobs..." />
            )}
            isOptionEqualToValue={(option, value) => option?._id === value?._id}
          />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Schedule Groups
              </Typography>
              <IconButton
                size="small"
                onClick={() => {
                  setFormData((prev) => ({
                    ...prev,
                    entries: [
                      ...(Array.isArray(prev.entries) ? prev.entries : []),
                      { installer: '', startDate: '', endDate: '' }, // empty group (as requested)
                    ],
                  }));
                }}
                title="Add another installer/date group"
                sx={{
                  border: `1px solid ${theme.palette.divider}`,
                  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)',
                }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Box>

            {(formData.entries || []).map((entry, idx) => (
              <Box
                key={idx}
                sx={{
                  border: `1px solid ${theme.palette.divider}`,
                  borderLeft: `6px solid ${getGroupAccent(idx)}`,
                  borderRadius: 1.5,
                  p: 1.25,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  backgroundColor:
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.03)'
                      : 'rgba(25, 118, 210, 0.05)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: theme.palette.text.primary }}
                  >
                    Group {idx + 1}
                  </Typography>
                  {(formData.entries || []).length > 1 && (
                    <IconButton
                      size="small"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          entries: prev.entries.filter((_, i) => i !== idx),
                        }));
                      }}
                      title="Remove this group"
                      sx={{
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor:
                          theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)',
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>

                <Autocomplete
                  freeSolo
                  options={installerOptions}
                  value={entry.installer || ''}
                  onChange={(_, newValue) => {
                    const next = typeof newValue === 'string' ? newValue : (newValue || '').toString();
                    setFormData((prev) => ({
                      ...prev,
                      entries: prev.entries.map((e, i) => (i === idx ? { ...e, installer: next } : e)),
                    }));
                  }}
                  inputValue={entry.installer || ''}
                  onInputChange={(_, newInputValue) => {
                    setFormData((prev) => ({
                      ...prev,
                      entries: prev.entries.map((e, i) => (i === idx ? { ...e, installer: newInputValue || '' } : e)),
                    }));
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Installer" fullWidth />
                  )}
                />

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Start Date"
                    type="date"
                    value={entry.startDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        entries: prev.entries.map((en, i) => (i === idx ? { ...en, startDate: next } : en)),
                      }));
                    }}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1, minWidth: 160 }}
                  />

                  <TextField
                    label="End Date"
                    type="date"
                    value={entry.endDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        entries: prev.entries.map((en, i) => (i === idx ? { ...en, endDate: next } : en)),
                      }));
                    }}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1, minWidth: 160 }}
                  />
                </Box>
              </Box>
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: formData.excludeSaturdays
                  ? theme.palette.mode === 'dark'
                    ? 'rgba(76, 175, 80, 0.18)'
                    : 'rgba(76, 175, 80, 0.10)'
                  : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={formData.excludeSaturdays}
                onChange={(e) => setFormData({ ...formData, excludeSaturdays: e.target.checked })}
                id="excludeSaturdays"
              />
              <label htmlFor="excludeSaturdays">Exclude Saturdays</label>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: formData.excludeSundays
                  ? theme.palette.mode === 'dark'
                    ? 'rgba(255, 152, 0, 0.16)'
                    : 'rgba(255, 152, 0, 0.10)'
                  : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={formData.excludeSundays}
                onChange={(e) => setFormData({ ...formData, excludeSundays: e.target.checked })}
                id="excludeSundays"
              />
              <label htmlFor="excludeSundays">Exclude Sundays</label>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <input
              type="checkbox"
              checked={formData.allDay}
              onChange={(e) => setFormData({ ...formData, allDay: e.target.checked })}
              id="allDay"
            />
            <label htmlFor="allDay">All day</label>
          </Box>

          {!formData.allDay && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Start Time"
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End Time"
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Box>
          )}

          <FormControl fullWidth>
            <InputLabel>Repeat</InputLabel>
            <Select
              value={formData.recurrence}
              onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
              label="Repeat"
            >
              <MenuItem value="none">Does not repeat</MenuItem>
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>

          {formData.recurrence !== 'none' && (
            <TextField
              label="Number of occurrences"
              type="number"
              value={formData.recurrenceCount}
              onChange={(e) => setFormData({ ...formData, recurrenceCount: parseInt(e.target.value) || 1 })}
              fullWidth
              inputProps={{ min: 1, max: 365 }}
            />
          )}

          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            fullWidth
            multiline
            rows={3}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" sx={{ minWidth: 100 }}>
              Color:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: 1 }}>
              {[
                { name: 'Blue', value: '#1976D2' },
                { name: 'Green', value: '#4CAF50' },
                { name: 'Orange', value: '#FF9800' },
                { name: 'Red', value: '#F44336' },
                { name: 'Purple', value: '#9C27B0' },
                { name: 'Teal', value: '#009688' },
                { name: 'Pink', value: '#E91E63' },
                { name: 'Brown', value: '#795548' },
                { name: 'Navy', value: '#1565C0' },
                { name: 'Cyan', value: '#00BCD4' },
                { name: 'Lime', value: '#8BC34A' },
                { name: 'Amber', value: '#FFC107' },
                { name: 'Deep Orange', value: '#FF5722' },
                { name: 'Indigo', value: '#3F51B5' },
                { name: 'Deep Purple', value: '#673AB7' },
                { name: 'Blue Grey', value: '#607D8B' },
                { name: 'Grey', value: '#9E9E9E' },
                { name: 'Maroon', value: '#880E4F' },
                { name: 'Forest', value: '#2E7D32' },
              ].map((colorOption) => (
                <Box
                  key={colorOption.value}
                  onClick={() => setFormData({ ...formData, color: colorOption.value })}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: colorOption.value,
                    cursor: 'pointer',
                    border: formData.color === colorOption.value ? '3px solid #000' : '2px solid #ccc',
                    boxShadow: formData.color === colorOption.value ? '0 0 0 2px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'scale(1.1)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    },
                  }}
                  title={colorOption.name}
                />
              ))}
            </Box>
            <TextField
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              sx={{
                width: 60,
                height: 40,
                '& input': {
                  cursor: 'pointer',
                  padding: 0,
                  border: 'none',
                },
              }}
              title="Custom color"
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {(job?.schedule?.entries?.length > 0 || job?.schedule?.startDate) && (
          <Button 
            onClick={async () => {
              if (!window.confirm(`Are you sure you want to remove "${job.title}" from the calendar?`)) {
                return;
              }
              try {
                setLoading(true);
                await axios.patch(`${API_URL}/jobs/${job._id}`, {
                  schedule: {
                    startDate: null,
                    endDate: null,
                    installer: '',
                    installers: [],
                    entries: [],
                  },
                  stage: 'READY_TO_SCHEDULE',
                });

                // Remove from Google Calendar if synced
                try {
                  await axios.delete(`${API_URL}/calendar/jobs/${job._id}/sync`);
                } catch (calendarError) {
                  console.warn('Google Calendar removal failed:', calendarError);
                }

                toast.success('Job removed from calendar');
                onSave();
                onClose();
              } catch (error) {
                console.error('Error removing job from calendar:', error);
                toast.error('Failed to remove job from calendar');
              } finally {
                setLoading(false);
              }
            }}
            color="error"
            disabled={loading}
            startIcon={<DeleteIcon />}
          >
            Remove from Calendar
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Calendar Day Component
function CalendarDay({ date, isCurrentMonth, events, onDayClick, onEventClick, onEventDelete, onViewJob, onDayContextMenu, installerOrder, holidayLabel = '', tvMode = false }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuEvent, setContextMenuEvent] = useState(null);
  // First, get all events that fall on this calendar day
  const eventsForDate = events.filter(e => {
    if (!e.schedule?.startDate) return false;
    const startDate = new Date(e.schedule.startDate);
    const endDate = e.schedule.endDate ? new Date(e.schedule.endDate) : startDate;
    
    // Check if date falls within the event range
    const dateStr = format(date, 'yyyy-MM-dd');
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');
    
    return dateStr >= startStr && dateStr <= endStr;
  })
  // Keep rows visually aligned across days by installer “lane”
  // We support up to 5 horizontal “sections” per day:
  // 4 dedicated installer lanes + 1 “Other” lane.
  const primaryInstallers = installerOrder.slice(0, 4);
  const laneInstallers = [...primaryInstallers, '__OTHER__']; // 5th lane for everything else

  // 1. For each lane, pick at most one event for that lane.
  const laneEvents = laneInstallers.map((installerKey) => {
    if (installerKey === '__OTHER__') {
      // First event whose installer is NOT one of the primary installers
      const match = eventsForDate.find((e) => {
        const name = e.schedule?.installer || '';
        return !primaryInstallers.includes(name);
      });
      return match || null;
    }
    const match = eventsForDate.find(
      (e) => (e.schedule?.installer || '') === installerKey
    );
    return match || null;
  });

  // 2. Count any remaining “other” events for a small "+N more" indicator in the bottom lane.
  const extraOtherEventsCount = eventsForDate.filter((e) => {
    const name = e.schedule?.installer || '';
    const isPrimary = primaryInstallers.includes(name);
    const isInOtherLane =
      !isPrimary &&
      laneEvents[laneEvents.length - 1] &&
      laneEvents[laneEvents.length - 1]._id === e._id;
    return !isPrimary && !isInOtherLane;
  }).length;

  const handleContextMenu = (e, event) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: e.clientX + 2,
            mouseY: e.clientY - 6,
          }
        : null
    );
    setContextMenuEvent(event);
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
    setContextMenuEvent(null);
  };

  const handleDelete = () => {
    if (contextMenuEvent && onEventDelete) {
      onEventDelete(contextMenuEvent);
    }
    handleCloseContextMenu();
  };

  return (
    <>
      <Paper
        sx={{
          width: '100%',
          height: '100%',
          p: 0.5,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: isCurrentMonth 
            ? theme.palette.background.paper 
            : (theme.palette.mode === 'dark' ? '#141414' : '#f7f7f7'),
          // Adjacent-month padding days: keep grid alignment but make jobs nearly invisible
          opacity: isCurrentMonth ? 1 : 0.14,
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          transition: 'background-color 0.15s ease, opacity 0.15s ease',
          '&:hover': {
            backgroundColor: isCurrentMonth 
              ? (theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5') 
              : (theme.palette.mode === 'dark' ? '#1E1E1E' : '#f0f0f0'),
            opacity: isCurrentMonth ? 1 : 0.38,
          },
        }}
        onClick={() => onDayClick(date)}
        onContextMenu={(e) => {
          if (onDayContextMenu) {
            e.preventDefault();
            e.stopPropagation();
            onDayContextMenu(date, e);
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: isToday(date) ? 800 : 600,
              color: isToday(date)
                ? 'primary.main'
                : isCurrentMonth
                  ? 'text.primary'
                  : theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.22)'
                    : 'rgba(0,0,0,0.22)',
              flexShrink: 0,
              lineHeight: 1.2,
              fontSize: { xs: '0.8rem', sm: '0.9rem' },
            }}
          >
            {format(date, 'd')}
          </Typography>
          {holidayLabel && (
            <Typography
              variant="caption"
              title={holidayLabel}
              sx={{
                color: theme.palette.mode === 'dark' ? '#FFD166' : '#8A5A00',
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 209, 102, 0.14)' : 'rgba(255, 209, 102, 0.22)',
                border: theme.palette.mode === 'dark' ? '1px solid rgba(255, 209, 102, 0.35)' : '1px solid rgba(138, 90, 0, 0.25)',
                borderRadius: '10px',
                px: 0.5,
                py: 0.15,
                fontSize: tvMode ? '0.56rem' : '0.62rem',
                fontWeight: 800,
                letterSpacing: '0.01em',
                lineHeight: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'clip',
                maxWidth: tvMode ? '92px' : '140px',
              }}
            >
              {getHolidayChipLabel(holidayLabel, tvMode)}
            </Typography>
          )}
        </Box>
        
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
          gap: 0,
          justifyContent: 'flex-start',
        }}>
          {laneEvents.map((event, index) => (
            <Box
              key={event?._id || `lane-${index}`}
              sx={{
                flex: '1 1 0',
                minHeight: 0,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                justifyContent: 'flex-start',
              }}
            >
              {event && (
                <Chip
                  label={[event.schedule?.title || event.title, event.schedule?.installer].filter(Boolean).join(' | ')}
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(event);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, event)}
                  sx={{
                    fontSize: { xs: '0.8rem', sm: '0.85rem' },
                    height: 24,
                    maxHeight: '100%',
                    maxWidth: '100%',
                    backgroundColor: event.color || '#1976D2',
                    color: 'white',
                    flexShrink: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    '&.MuiChip-root': { py: 0, px: 0 },
                    '& .MuiChip-label': {
                      px: 0.75,
                      py: 0,
                      lineHeight: 1.25,
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                    '&:hover': { opacity: 0.8 },
                  }}
                />
              )}
              {index === laneEvents.length - 1 && extraOtherEventsCount > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.25, fontSize: '0.6rem', flexShrink: 0 }}>
                  +{extraOtherEventsCount} more
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Paper>
      
      {/* Context Menu */}
      {contextMenuEvent && (
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
          {onViewJob && contextMenuEvent?._id && (
            <MenuItem
              onClick={() => {
                // For calendar chips, we pass a pseudo-event with `jobId`
                onViewJob(contextMenuEvent.jobId || contextMenuEvent._id);
                handleCloseContextMenu();
              }}
            >
              <ListItemIcon>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>View job</ListItemText>
            </MenuItem>
          )}
          <MenuItem onClick={handleDelete}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Remove from Calendar</ListItemText>
          </MenuItem>
        </Menu>
      )}
    </>
  );
}

// Bench Job Card Component
function BenchJobCard({ job, onJobClick, onViewJob, onRemoveFromBench }) {
  const jobTotal = job.valueEstimated || job.valueTotal || 0;
  const defaultDuration = Math.max(1, Math.floor(jobTotal / 2000));

  return (
    <Card
      sx={{
        cursor: 'pointer',
        borderLeft: `4px solid ${job.color || '#1976D2'}`,
        minWidth: 150,
        maxWidth: 180,
        position: 'relative',
        '&:hover': {
          boxShadow: 2,
          transform: 'translateY(-1px)',
          transition: 'all 0.2s',
        },
      }}
      onClick={() => onJobClick(job)}
    >
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 800,
                fontSize: '0.85rem',
                mb: 0.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={job.title}
            >
              {job.title}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <Box
                component="span"
                sx={{
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {job.customerId?.name || 'Unknown'}
              </Box>
              <Box component="span" sx={{ flexShrink: 0, opacity: 0.8 }}>
                | {defaultDuration} days
              </Box>
            </Typography>
          </Box>
          {onViewJob && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onViewJob(job._id);
              }}
              title="View job (customer & details)"
              sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
            >
              <PersonIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
          {onRemoveFromBench && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromBench(job);
              }}
              title="Remove from bench (move to dead estimates)"
              sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
            >
              <DeleteIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

// Scheduled Job Card Component (with green checkmark)
function ScheduledJobCard({ job, onJobClick, onJobDelete, onViewJob }) {
  const jobTotal = job.valueEstimated || job.valueTotal || 0;
  const defaultDuration = Math.max(1, Math.floor(jobTotal / 2000));

  return (
    <Card
      sx={{
        borderLeft: `4px solid ${job.color || '#4caf50'}`,
        minWidth: 150,
        maxWidth: 180,
        position: 'relative',
        '&:hover': {
          boxShadow: 2,
          transform: 'translateY(-1px)',
          transition: 'all 0.2s',
        },
      }}
    >
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 18 }} />
          <Box 
            sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            onClick={() => onJobClick(job)}
          >
            <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.85rem', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {defaultDuration} days
            </Typography>
          </Box>
          {onViewJob && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onViewJob(job._id);
              }}
              title="View job (customer & details)"
              sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
            >
              <PersonIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
          {onJobDelete && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onJobDelete(job);
              }}
              sx={{
                padding: 0.5,
                '&:hover': {
                  backgroundColor: 'error.light',
                  color: 'error.main',
                },
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

function CalendarPageNew({ tvMode = false }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { mode, toggleColorMode } = useAppTheme();
  const { user, canModifyCalendar, canViewCalendar } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [currentDate, setCurrentDate] = useState(new Date());
  const [benchJobs, setBenchJobs] = useState([]);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [selectedInstaller, setSelectedInstaller] = useState('');
  const [loading, setLoading] = useState(true);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobIdForDetailModal, setJobIdForDetailModal] = useState(null);
  const [benchHeight, setBenchHeight] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  const [isBenchMinimized, setIsBenchMinimized] = useState(false);
  const [installerOrder, setInstallerOrder] = useState(DEFAULT_INSTALLER_ORDER);

  const [benchPosition, setBenchPosition] = useState(() => {
    if (tvMode) return 'right';
    try {
      const stored = localStorage.getItem(CALENDAR_BENCH_POSITION_KEY);
      if (stored === 'top' || stored === 'right' || stored === 'bottom') return stored;
    } catch (_) {}
    return 'right';
  });
  const [benchWidth, setBenchWidth] = useState(tvMode ? 260 : 320);
  const [sensitiveUnlocked, setSensitiveUnlocked] = useState(user?.role !== 'shop_view');
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [exitPinDialogOpen, setExitPinDialogOpen] = useState(false);
  const [exitPinInput, setExitPinInput] = useState('');
  const lockTimerRef = useRef(null);

  const hideSensitive = user?.role === 'shop_view' && !sensitiveUnlocked;
  const canModifyCalendarWithPin = () => canModifyCalendar() || (user?.role === 'shop_view' && sensitiveUnlocked);
  const requestSensitiveUnlock = () => {
    if (user?.role !== 'shop_view') return;
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
    if (user?.role !== 'shop_view') return;
    setSensitiveUnlocked(false);
    toast.success('Sensitive data locked');
  };
  const requestExitUnlock = () => {
    setExitPinInput('');
    setExitPinDialogOpen(true);
  };
  const handleExitWithPin = () => {
    if (exitPinInput.trim() === SHOP_VIEW_PIN) {
      setExitPinDialogOpen(false);
      navigate('/calendar');
    } else {
      toast.error('Invalid PIN');
    }
  };

  useEffect(() => {
    setSensitiveUnlocked(user?.role !== 'shop_view');
    setPinDialogOpen(false);
    setPinInput('');
    setExitPinDialogOpen(false);
    setExitPinInput('');
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'shop_view') return undefined;
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
  }, [user?.role, sensitiveUnlocked]);

  useEffect(() => {
    if (tvMode) return;
    try {
      localStorage.setItem(CALENDAR_BENCH_POSITION_KEY, benchPosition);
    } catch (_) {}
  }, [benchPosition, tvMode]);

  const [hiddenWeekdays, setHiddenWeekdays] = useState(() => {
    try {
      const stored = localStorage.getItem(CALENDAR_HIDDEN_WEEKDAYS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((d) => d >= 0 && d <= 6) : [];
      }
    } catch (_) {}
    return [];
  });
  const [dayContextMenu, setDayContextMenu] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(CALENDAR_HIDDEN_WEEKDAYS_KEY, JSON.stringify(hiddenWeekdays));
    } catch (_) {}
  }, [hiddenWeekdays]);

  useEffect(() => {
    fetchJobs();
  }, [currentDate]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/jobs`);
      const allJobs = response.data.jobs || response.data || [];

      const jobHasCalendarSchedule = (job) => {
        const entries = job?.schedule?.entries;
        if (Array.isArray(entries) && entries.some((e) => e?.startDate)) return true;
        return !!job?.schedule?.startDate;
      };
      
      // Filter bench jobs (readiness phase only — not already on the calendar)
      const readinessStages = ['DEPOSIT_PENDING', 'JOB_PREP', 'TAKEOFF_COMPLETE', 'READY_TO_SCHEDULE'];
      const bench = allJobs.filter(job => 
        readinessStages.includes(job.stage) && 
        !job.isArchived && 
        !job.isDeadEstimate &&
        !jobHasCalendarSchedule(job)
      );
      
      // Filter scheduled jobs
      const scheduled = allJobs.filter(job => {
        const hasSchedule = jobHasCalendarSchedule(job);
        const isScheduledStage = job.stage === 'SCHEDULED';
        return (hasSchedule || isScheduledStage) && !job.isArchived && !job.isDeadEstimate;
      });
      
      setBenchJobs(bench);
      setScheduledJobs(scheduled);

      // Update installer order based on any installers used in jobs
      const installerSet = new Set(DEFAULT_INSTALLER_ORDER);
      [...bench, ...scheduled].forEach(job => {
        const entries = Array.isArray(job?.schedule?.entries) ? job.schedule.entries : [];
        const installers = entries.length > 0
          ? entries.map((e) => e?.installer).filter(Boolean)
          : (Array.isArray(job?.schedule?.installers) && job.schedule.installers.length > 0
            ? job.schedule.installers
            : (job?.schedule?.installer ? [job.schedule.installer] : []));
        installers.forEach((name) => {
          if (name && typeof name === 'string') installerSet.add(name);
        });
      });
      setInstallerOrder(Array.from(installerSet));
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  // Generate calendar days for a specific month
  const getCalendarDaysForMonth = (date) => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  };

  // Get months: TV mode shows current + next month.
  // Standard mode stays the same (one on mobile, three on desktop).
  const months = useMemo(() => {
    if (tvMode) {
      return [currentDate, addMonths(currentDate, 1)];
    }
    if (isMobile) {
      return [currentDate];
    }
    return [
      currentDate,
      addMonths(currentDate, 1),
      addMonths(currentDate, 2),
    ];
  }, [currentDate, isMobile, tvMode]);

  const holidayMap = useMemo(() => {
    const years = new Set();
    months.forEach((monthDate) => {
      years.add(monthDate.getFullYear());
      years.add(addMonths(monthDate, -1).getFullYear());
      years.add(addMonths(monthDate, 1).getFullYear());
    });
    const combined = {};
    years.forEach((year) => {
      Object.assign(combined, buildMajorUSHolidayMap(year));
      combined[format(getEasterSunday(year), 'yyyy-MM-dd')] = 'Easter';
    });
    return combined;
  }, [months]);

  // Render one calendar chip per schedule entry (installer + start/end date range).
  // Legacy support: if `schedule.entries` is missing, we fall back to the old single-range + `schedule.installers` model.
  const calendarEvents = useMemo(() => {
    return (scheduledJobs || []).flatMap((job) => {
      const schedule = job?.schedule || {};
      const entries = Array.isArray(schedule?.entries) ? schedule.entries : [];

      if (entries.length > 0) {
        return entries
          .filter((entry) => entry?.startDate && entry?.installer)
          .map((entry, entryIndex) => ({
            _id: `${job._id}_entry_${entryIndex}`,
            eventType: 'entries',
            entryIndex,
            jobId: job._id,
            job,
            title: job?.title,
            color: job?.color,
            schedule: {
              startDate: entry.startDate,
              endDate: entry.endDate || entry.startDate,
              installer: entry.installer,
            },
          }));
      }

      // Legacy fallback
      const installers = Array.isArray(schedule?.installers) && schedule.installers.length > 0
        ? schedule.installers
        : (schedule?.installer ? [schedule.installer] : []);

      if (!schedule?.startDate || installers.length === 0) return [];

      return installers
        .filter(Boolean)
        .map((installer, installerIndex) => ({
          _id: `${job._id}_legacy_${installer}_${installerIndex}`,
          eventType: 'legacy_installer',
          jobId: job._id,
          job,
          title: job?.title,
          color: job?.color,
          schedule: {
            startDate: schedule.startDate,
            endDate: schedule.endDate || schedule.startDate,
            installer,
          },
        }));
    });
  }, [scheduledJobs]);

  const handleDayClick = (date) => {
    if (!canModifyCalendarWithPin()) {
      if (user?.role === 'shop_view') {
        requestSensitiveUnlock();
        toast.error('Enter PIN to modify calendar events');
      } else {
        toast.error('You do not have permission to create or modify calendar events');
      }
      return;
    }
    setSelectedDate(date);
    setSelectedJob(null);
    setSelectedInstaller('');
    setEventModalOpen(true);
  };

  const handleEventClick = (eventOrJob) => {
    if (!canModifyCalendarWithPin()) {
      if (user?.role === 'shop_view') {
        requestSensitiveUnlock();
        toast.error('Enter PIN to modify calendar events');
      } else {
        toast.error('You do not have permission to modify calendar events');
      }
      return;
    }
    const job = eventOrJob?.job || eventOrJob;
    setSelectedJob(job);
    setSelectedInstaller(
      eventOrJob?.schedule?.installer ||
        job?.schedule?.installer ||
        (Array.isArray(job?.schedule?.installers) ? job.schedule.installers?.[0] : '') ||
        ''
    );
    const start = eventOrJob?.schedule?.startDate || job?.schedule?.startDate;
    setSelectedDate(start ? new Date(start) : new Date());
    setEventModalOpen(true);
  };

  const handleEventDelete = async (eventOrJob) => {
    const job = eventOrJob?.job || eventOrJob;
    const isCalendarChipEvent = !!eventOrJob?.job && !!eventOrJob?.jobId;
    const eventType = eventOrJob?.eventType;
    const entryIndex = typeof eventOrJob?.entryIndex === 'number' ? eventOrJob.entryIndex : null;
    const installerToRemove = eventOrJob?.schedule?.installer || '';

    if (!canModifyCalendarWithPin()) {
      if (user?.role === 'shop_view') {
        requestSensitiveUnlock();
        toast.error('Enter PIN to modify calendar events');
      } else {
        toast.error('You do not have permission to modify calendar events');
      }
      return;
    }

    const removalLabel =
      isCalendarChipEvent && installerToRemove
        ? `${job.title} (${installerToRemove})`
        : job.title;

    if (!window.confirm(`Are you sure you want to remove "${removalLabel}" from the calendar?`)) {
      return;
    }

    try {
      const clearSchedule = async () => {
        await axios.patch(`${API_URL}/jobs/${job._id}`, {
          schedule: {
            startDate: null,
            endDate: null,
            installer: '',
            installers: [],
            entries: [],
          },
          stage: 'READY_TO_SCHEDULE',
        });

        // Remove from Google Calendar if synced
        try {
          await axios.delete(`${API_URL}/calendar/jobs/${job._id}/sync`);
        } catch (calendarError) {
          console.warn('Google Calendar removal failed:', calendarError);
        }

        toast.success('Job removed from calendar');
      };

      // If user clicked the delete button on the Scheduled Job cards,
      // they pass the whole `job`, not a chip/event.
      if (!isCalendarChipEvent) {
        await clearSchedule();
        await fetchJobs();
        return;
      }

      if (eventType === 'entries' && entryIndex !== null) {
        const existingEntries = Array.isArray(job?.schedule?.entries) ? job.schedule.entries : [];
        const remainingEntries = existingEntries.filter((_, i) => i !== entryIndex);

        if (remainingEntries.length === 0) {
          await clearSchedule();
        } else {
          const remainingInstallers = remainingEntries.map((e) => e?.installer).filter(Boolean);
          const earliest = remainingEntries.reduce((acc, e) =>
            new Date(e?.startDate).getTime() <= new Date(acc?.startDate).getTime() ? e : acc
          , remainingEntries[0] || {});
          const latest = remainingEntries.reduce((acc, e) =>
            new Date(e?.endDate).getTime() >= new Date(acc?.endDate).getTime() ? e : acc
          , remainingEntries[0] || {});

          await axios.patch(`${API_URL}/jobs/${job._id}`, {
            schedule: {
              entries: remainingEntries,
              startDate: earliest?.startDate || null,
              endDate: latest?.endDate || earliest?.startDate || null,
              installer: earliest?.installer || '',
              installers: remainingInstallers,
              recurrence: job?.schedule?.recurrence,
              crewNotes: job?.schedule?.crewNotes,
              title: job?.schedule?.title,
            },
          });

          toast.success('Schedule entry removed from calendar');
        }

        await fetchJobs();
        return;
      }

      // Legacy chip removal (old "multiple installers, same date range")
      const existingInstallers = Array.isArray(job?.schedule?.installers) && job.schedule.installers.length > 0
        ? job.schedule.installers
        : (job?.schedule?.installer ? [job.schedule.installer] : []);

      const remainingInstallers = existingInstallers.filter((i) => i !== installerToRemove);

      if (remainingInstallers.length === 0) {
        await clearSchedule();
      } else {
        await axios.patch(`${API_URL}/jobs/${job._id}`, {
          schedule: {
            startDate: job?.schedule?.startDate,
            endDate: job?.schedule?.endDate,
            installer: remainingInstallers[0],
            installers: remainingInstallers,
            recurrence: job?.schedule?.recurrence,
            crewNotes: job?.schedule?.crewNotes,
            title: job?.schedule?.title,
          },
        });

        toast.success('Installer removed from calendar');
      }

      await fetchJobs();
    } catch (error) {
      console.error('Error removing job from calendar:', error);
      toast.error('Failed to remove job from calendar');
    }
  };

  const handleRemoveFromBench = async (job) => {
    if (!window.confirm(`Remove "${job.title}" from the bench? It will be moved to dead estimates.`)) {
      return;
    }
    try {
      await axios.post(`${API_URL}/jobs/${job._id}/move-to-dead-estimates`);
      toast.success('Job removed from bench');
      await fetchJobs();
    } catch (error) {
      console.error('Error removing job from bench:', error);
      toast.error('Failed to remove job from bench');
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(addMonths(currentDate, -1));
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const effectiveHiddenWeekdays = tvMode ? [] : hiddenWeekdays;
  const visibleWeekdays = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].filter((d) => !effectiveHiddenWeekdays.includes(d)),
    [effectiveHiddenWeekdays]
  );

  const handleDayContextMenu = (date, e) => {
    e.preventDefault();
    setDayContextMenu({
      left: e.clientX,
      top: e.clientY,
      date,
    });
  };

  const handleCloseDayContextMenu = () => setDayContextMenu(null);

  const toggleWeekdayHidden = (weekday) => {
    setHiddenWeekdays((prev) =>
      prev.includes(weekday) ? prev.filter((d) => d !== weekday) : [...prev, weekday].sort((a, b) => a - b)
    );
    setDayContextMenu(null);
  };

  // Render a single month calendar
  const renderMonth = (monthDate, monthIndex) => {
    const calendarDays = getCalendarDaysForMonth(monthDate);
    const visibleDays = calendarDays.filter((d) => !effectiveHiddenWeekdays.includes(d.getDay()));
    const columnCount = visibleWeekdays.length;

    return (
      <Box key={monthIndex} sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Month Header - hide on mobile since it's in the main header */}
        {!isMobile && (
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              mb: tvMode ? 0.25 : 0.5,
              textAlign: 'center',
              fontSize: tvMode ? { xs: '0.9rem', sm: '1rem' } : { xs: '1rem', sm: '1.15rem' },
            }}
          >
            {format(monthDate, 'MMMM yyyy')}
          </Typography>
        )}

        {/* Day Headers - only visible weekdays */}
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${columnCount}, 1fr)`, mb: 0, gap: 0 }}>
          {visibleWeekdays.map((dayIndex) => (
            <Paper
              key={dayIndex}
              sx={{
                p: tvMode ? 0.25 : 0.5,
                textAlign: 'center',
                backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5',
                border: `1px solid ${theme.palette.divider}`,
                fontWeight: 600,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontSize: tvMode ? { xs: '0.65rem', sm: '0.7rem' } : { xs: '0.75rem', sm: '0.8rem' },
                  lineHeight: 1.1,
                }}
              >
                {isMobile ? WEEKDAY_LABELS[dayIndex].substring(0, 1) : WEEKDAY_LABELS[dayIndex].substring(0, 3)}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* Calendar Days Grid - only visible weekdays */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
          gridAutoRows: 'auto',
          gap: 0,
          minHeight: 0,
          '& > *': {
            minWidth: 0,
            aspectRatio: tvMode ? '1.6' : '1',
          }
        }}>
          {visibleDays.map((date, index) => (
            <Box
              key={index}
              sx={{
                width: '100%',
                minWidth: 0,
                aspectRatio: tvMode ? '1.6' : '1',
                display: 'block',
              }}
            >
              <CalendarDay
                key={index}
                date={date}
                isCurrentMonth={isSameMonth(date, monthDate)}
                events={calendarEvents}
                holidayLabel={holidayMap[format(date, 'yyyy-MM-dd')] || ''}
                tvMode={tvMode}
                onDayClick={handleDayClick}
                onEventClick={handleEventClick}
                onEventDelete={handleEventDelete}
                onViewJob={(id) => setJobIdForDetailModal(id)}
                onDayContextMenu={handleDayContextMenu}
                installerOrder={installerOrder}
              />
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  const renderCalendarContent = () =>
    loading ? (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    ) : (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: tvMode ? { xs: 0.35, sm: 0.5 } : { xs: 1, sm: 1.5 } }}>
        {months.map((monthDate, index) => renderMonth(monthDate, index))}
      </Box>
    );

  const renderBenchPanelContent = (placement) => {
    const isVertical = placement !== 'right';
    const resizeEdge = placement === 'top' ? 'bottom' : placement === 'bottom' ? 'top' : 'left';
    return (
      <>
        {/* Minimize/Expand Button */}
        <Box
          sx={{
            position: 'absolute',
            ...(placement === 'right'
              ? { top: isBenchMinimized ? 0 : 4, right: 4 }
              : { top: isBenchMinimized ? 0 : -3, right: 8 }),
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <IconButton
            onClick={() => {
              setIsBenchMinimized(!isBenchMinimized);
              if (!isBenchMinimized && benchHeight < 150) setBenchHeight(250);
            }}
            size="small"
            sx={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              '&:hover': {
                backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5',
              },
            }}
            title={isBenchMinimized ? 'Expand Bench' : 'Minimize Bench'}
          >
            {isBenchMinimized ? <ExpandMoreIcon /> : <ExpandLessIcon />}
          </IconButton>
        </Box>

        {/* Resize Handle - vertical (top/bottom) or horizontal (right) */}
        {!isBenchMinimized && isVertical && (
          <Box
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsResizing(true);
              const startY = e.clientY;
              const startHeight = benchHeight;
              const handleMouseMove = (moveEvent) => {
                moveEvent.preventDefault();
                const deltaY = placement === 'bottom' ? startY - moveEvent.clientY : moveEvent.clientY - startY;
                const newHeight = Math.max(150, Math.min(600, startHeight + deltaY));
                setBenchHeight(newHeight);
              };
              const handleMouseUp = () => {
                setIsResizing(false);
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              ...(resizeEdge === 'top' ? { top: -3, height: '16px' } : { bottom: -3, height: '16px' }),
              cursor: 'ns-resize',
              backgroundColor: 'transparent',
              zIndex: 10,
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '40px',
                  height: '4px',
                  backgroundColor: '#999',
                  borderRadius: '2px',
                },
              },
            }}
          />
        )}

        {!isBenchMinimized && placement === 'right' && (
          <Box
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const startX = e.clientX;
              const startWidth = benchWidth;
              const handleMouseMove = (moveEvent) => {
                moveEvent.preventDefault();
                const deltaX = startX - moveEvent.clientX;
                const newWidth = Math.max(280, Math.min(600, startWidth + deltaX));
                setBenchWidth(newWidth);
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
              left: -3,
              top: 0,
              bottom: 0,
              width: '16px',
              cursor: 'ew-resize',
              backgroundColor: 'transparent',
              zIndex: 10,
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '4px',
                  height: '40px',
                  backgroundColor: '#999',
                  borderRadius: '2px',
                },
              },
            }}
          />
        )}

        {isBenchMinimized ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: { xs: 1, sm: 2 },
              py: 1,
              height: '100%',
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5',
              },
            }}
            onClick={() => setIsBenchMinimized(false)}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
              Bench ({benchJobs.length}) • Scheduled ({scheduledJobs.length})
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              Tap to expand
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: placement === 'right' ? 'column' : { xs: 'column', md: 'row' }, gap: { xs: 2, md: 3 }, height: '100%', mt: 1, flexWrap: placement === 'right' ? 'nowrap' : undefined }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Bench ({benchJobs.length})
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                Jobs ready to schedule. Click to schedule on calendar.
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, sm: 2 } }}>
                {benchJobs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No jobs on bench</Typography>
                ) : (
                  benchJobs.map((job) => (
                    <BenchJobCard
                      key={job._id}
                      job={job}
                      onJobClick={(j) => {
                        if (!canModifyCalendarWithPin()) {
                          if (user?.role === 'shop_view') {
                            requestSensitiveUnlock();
                            toast.error('Enter PIN to modify calendar events');
                          } else {
                            toast.error('You do not have permission to modify calendar events');
                          }
                          return;
                        }
                        setSelectedJob(j);
                        setSelectedInstaller('');
                        setSelectedDate(new Date());
                        setEventModalOpen(true);
                      }}
                      onViewJob={(id) => setJobIdForDetailModal(id)}
                      onRemoveFromBench={handleRemoveFromBench}
                    />
                  ))
                )}
              </Box>
            </Box>
            <Box sx={{
              flex: 1,
              minWidth: 0,
              borderLeft: placement === 'right' ? 'none' : { xs: 'none', md: '1px solid #e0e0e0' },
              borderTop: placement === 'right' ? '1px solid #e0e0e0' : { xs: '1px solid #e0e0e0', md: 'none' },
              pl: { xs: 0, md: placement === 'right' ? 0 : 3 },
              pt: { xs: 2, md: 0 },
            }}>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Scheduled ({scheduledJobs.length})
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                Jobs with scheduled dates. Click to edit.
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, sm: 2 } }}>
                {scheduledJobs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No scheduled jobs</Typography>
                ) : (
                  scheduledJobs.map((job) => (
                    <ScheduledJobCard
                      key={job._id}
                      job={job}
                      onJobClick={(j) => {
                        if (!canModifyCalendarWithPin()) {
                          if (user?.role === 'shop_view') {
                            requestSensitiveUnlock();
                            toast.error('Enter PIN to modify calendar events');
                          } else {
                            toast.error('You do not have permission to modify calendar events');
                          }
                          return;
                        }
                        setSelectedJob(j);
                        setSelectedInstaller(
                          j?.schedule?.installer ||
                            (Array.isArray(j?.schedule?.installers) ? j.schedule.installers?.[0] : '') ||
                            ''
                        );
                        setSelectedDate(j.schedule?.startDate ? new Date(j.schedule.startDate) : new Date());
                        setEventModalOpen(true);
                      }}
                      onJobDelete={handleEventDelete}
                      onViewJob={(id) => setJobIdForDetailModal(id)}
                    />
                  ))
                )}
              </Box>
            </Box>
          </Box>
        )}
      </>
    );
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ 
        p: tvMode ? { xs: 0.5, sm: 1 } : { xs: 1, sm: 2 }, 
        borderBottom: '1px solid #e0e0e0', 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: tvMode ? 'column' : 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: { xs: 1, sm: 0 }
      }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: tvMode ? 'center' : 'flex-start',
            gap: { xs: 1, sm: 2 },
            flexWrap: 'wrap',
            width: '100%',
          }}
        >
          <IconButton onClick={handlePrevMonth} size="small">
            <ChevronLeftIcon />
          </IconButton>
          <Typography 
            variant="h5" 
            sx={{ 
              fontWeight: 600, 
              minWidth: { xs: 'auto', sm: 200 }, 
              textAlign: 'center',
              fontSize: tvMode ? { xs: '0.8rem', sm: '1rem', md: '1.2rem' } : { xs: '0.875rem', sm: '1.25rem', md: '1.5rem' }
            }}
          >
            {isMobile 
              ? format(currentDate, 'MMMM yyyy')
              : tvMode
                ? `${format(currentDate, 'MMMM yyyy')} - ${format(addMonths(currentDate, 1), 'MMMM yyyy')}`
                : `${format(currentDate, 'MMMM yyyy')} - ${format(addMonths(currentDate, 2), 'MMMM yyyy')}`
            }
          </Typography>
          <IconButton onClick={handleNextMonth} size="small">
            <ChevronRightIcon />
          </IconButton>
          <Button
            startIcon={<TodayIcon />}
            onClick={handleToday}
            variant="outlined"
            size="small"
            sx={{ display: { xs: 'none', sm: 'flex' } }}
          >
            Today
          </Button>
          <Button
            onClick={() => {
              if (tvMode) {
                requestExitUnlock();
                return;
              }
              navigate('/calendar-view');
            }}
            variant={tvMode ? 'contained' : 'outlined'}
            size="small"
            sx={{ display: { xs: 'none', sm: 'flex' } }}
          >
            {tvMode ? 'Exit Calendar view' : 'Calendar view'}
          </Button>
          {tvMode && (
            <Button
              onClick={toggleColorMode}
              variant="outlined"
              size="small"
              startIcon={mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
              sx={{ display: { xs: 'none', sm: 'flex' } }}
            >
              {mode === 'dark' ? 'Light mode' : 'Dark mode'}
            </Button>
          )}
          {user?.role === 'shop_view' && (
            <Tooltip title={hideSensitive ? 'Unlock sensitive data (PIN)' : 'Lock sensitive data'}>
              <IconButton
                onClick={hideSensitive ? requestSensitiveUnlock : lockSensitiveData}
                size="small"
                color={hideSensitive ? 'default' : 'warning'}
              >
                {hideSensitive ? <LockIcon /> : <LockOpenIcon />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {/* Standalone event creation removed; calendar now only schedules existing jobs */}
        <FormControl size="small" sx={{ minWidth: 120, display: { xs: 'none', sm: tvMode ? 'none' : 'flex' } }}>
          <InputLabel>Bench position</InputLabel>
          <Select
            value={benchPosition}
            label="Bench position"
            onChange={(e) => setBenchPosition(e.target.value)}
          >
            <MenuItem value="top">Top</MenuItem>
            <MenuItem value="right">Right</MenuItem>
            <MenuItem value="bottom">Bottom</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Main area: layout depends on bench position */}
      {benchPosition === 'top' && (
        <>
          {/* Bench at top */}
          <Box
            sx={{
              flexShrink: 0,
              backgroundColor: theme.palette.background.paper,
              borderBottom: `3px solid ${theme.palette.divider}`,
              p: isBenchMinimized ? 0 : { xs: 1, sm: 2 },
              height: isBenchMinimized ? '40px' : isMobile ? '200px' : `${benchHeight}px`,
              overflow: isBenchMinimized ? 'hidden' : 'auto',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              transition: 'height 0.3s ease, padding 0.3s ease',
            }}
          >
            {renderBenchPanelContent('top')}
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 0.5, sm: 1 }, minHeight: 0 }}>
            {renderCalendarContent()}
          </Box>
        </>
      )}

      {benchPosition === 'right' && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'hidden' }}>
          <Box sx={{ flex: 1, overflow: 'auto', p: tvMode ? { xs: 0.2, sm: 0.4 } : { xs: 0.5, sm: 1 }, minWidth: 0 }}>
            {renderCalendarContent()}
          </Box>
          <Box
            sx={{
              flexShrink: 0,
              width: isBenchMinimized ? 48 : benchWidth,
              backgroundColor: theme.palette.background.paper,
              borderLeft: `3px solid ${theme.palette.divider}`,
              p: isBenchMinimized ? 0 : tvMode ? { xs: 0.5, sm: 0.75 } : { xs: 1, sm: 2 },
              overflow: isBenchMinimized ? 'hidden' : 'auto',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              transition: 'width 0.3s ease',
            }}
          >
            {renderBenchPanelContent('right')}
          </Box>
        </Box>
      )}

      {benchPosition === 'bottom' && (
        <>
          <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 0.5, sm: 1 }, minHeight: 0 }}>
            {renderCalendarContent()}
          </Box>
          {/* Bench at bottom - resizable */}
          <Box
            sx={{
              flexShrink: 0,
              backgroundColor: theme.palette.background.paper,
              borderTop: `3px solid ${theme.palette.divider}`,
              p: isBenchMinimized ? 0 : { xs: 1, sm: 2 },
              height: isBenchMinimized ? '40px' : isMobile ? '200px' : `${benchHeight}px`,
              overflow: isBenchMinimized ? 'hidden' : 'auto',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              transition: 'height 0.3s ease, padding 0.3s ease',
            }}
          >
            {renderBenchPanelContent('bottom')}
          </Box>
        </>
      )}

      {/* Event Modal */}
      <EventModal
        open={eventModalOpen}
        onClose={() => {
          setEventModalOpen(false);
          setSelectedDate(null);
          setSelectedJob(null);
          setSelectedInstaller('');
        }}
        selectedDate={selectedDate}
        job={selectedJob}
        onSave={fetchJobs}
        onViewJob={(id) => setJobIdForDetailModal(id)}
        installerOptions={installerOrder}
        selectedInstaller={selectedInstaller}
      />

      {/* Job detail modal (customer, files, etc.) */}
      <JobDetailModal
        jobId={jobIdForDetailModal}
        open={!!jobIdForDetailModal}
        onClose={() => setJobIdForDetailModal(null)}
        onJobUpdate={async (jobId, updates) => { await fetchJobs(); }}
        onJobDelete={(jobId) => {
          setJobIdForDetailModal(null);
          fetchJobs();
        }}
        onJobArchive={(jobId) => {
          setJobIdForDetailModal(null);
          fetchJobs();
        }}
        hideSensitive={hideSensitive}
        onRequestSensitiveUnlock={requestSensitiveUnlock}
      />
      <Dialog open={pinDialogOpen} onClose={() => setPinDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Unlock Sensitive Data</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter PIN to view financial numbers and files.
          </Typography>
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
      <Dialog open={exitPinDialogOpen} onClose={() => setExitPinDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Exit Calendar View</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter PIN to exit kiosk calendar view.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="PIN"
            type="password"
            value={exitPinInput}
            onChange={(e) => setExitPinInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleExitWithPin();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExitPinDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleExitWithPin}>
            Exit
          </Button>
        </DialogActions>
      </Dialog>

      {/* Right-click on a date: hide/show that weekday */}
      <Menu
        open={!!dayContextMenu}
        onClose={handleCloseDayContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          dayContextMenu
            ? { top: dayContextMenu.top, left: dayContextMenu.left }
            : undefined
        }
      >
        {dayContextMenu && (() => {
          const weekday = dayContextMenu.date.getDay();
          const label = WEEKDAY_LABELS[weekday];
          const isHidden = hiddenWeekdays.includes(weekday);
          return (
            <MenuItem
              onClick={() => toggleWeekdayHidden(weekday)}
            >
              {isHidden ? `Show ${label}s` : `Hide ${label}s`}
            </MenuItem>
          );
        })()}
      </Menu>
    </Box>
  );
}

export default CalendarPageNew;

