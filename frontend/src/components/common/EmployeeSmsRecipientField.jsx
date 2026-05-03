import { useState, useEffect } from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Box,
  CircularProgress,
} from '@mui/material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Dropdown of tenant employees (role Employee) with a mobile on file for Twilio.
 * Value is the user `_id` string sent as `employeeUserId` to `/twilio/send-sms`.
 */
export default function EmployeeSmsRecipientField({
  value,
  onChange,
  disabled,
  label = 'Send to employee',
  helperText,
  sx,
  /** When set, picks the best name match once per dialog open (see dialogOpen). */
  autoSelectByName,
  /** When this flips true, internal auto-select can run again. */
  dialogOpen = false,
}) {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [didAutoSelect, setDidAutoSelect] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await axios.get(`${API_URL}/users/employees-for-sms`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setEmployees(res.data.employees || []);
      } catch {
        if (!cancelled) setEmployees([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dialogOpen) setDidAutoSelect(false);
  }, [dialogOpen]);

  useEffect(() => {
    if (!autoSelectByName || didAutoSelect || value || !employees.length) return;
    const q = String(autoSelectByName || '').trim().toLowerCase();
    if (!q) return;
    const exact = employees.find((e) => e.name && e.name.trim().toLowerCase() === q && e.hasMobile);
    const partial = employees.find(
      (e) =>
        e.hasMobile &&
        e.name &&
        (e.name.toLowerCase().includes(q) || q.includes(e.name.toLowerCase()))
    );
    const pick = exact || partial;
    if (pick) {
      setDidAutoSelect(true);
      onChange(String(pick._id));
    }
  }, [autoSelectByName, didAutoSelect, value, employees, onChange]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 56, ...sx }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <FormControl fullWidth disabled={disabled} sx={sx} required>
      <InputLabel id="employee-sms-recipient-label">{label}</InputLabel>
      <Select
        labelId="employee-sms-recipient-label"
        label={label}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <MenuItem value="">
          <em>Select an employee</em>
        </MenuItem>
        {employees.map((emp) => (
          <MenuItem key={emp._id} value={emp._id} disabled={!emp.hasMobile}>
            {emp.name}
            {emp.mobile ? ` (${emp.mobile})` : ' — add mobile in Users'}
          </MenuItem>
        ))}
      </Select>
      {helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
      {!employees.length ? (
        <FormHelperText error>
          No employees with mobile numbers. Add them under User Management (Employees).
        </FormHelperText>
      ) : null}
    </FormControl>
  );
}
