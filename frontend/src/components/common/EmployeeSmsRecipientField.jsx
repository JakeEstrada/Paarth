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

/** `value` format: `user:<mongoId>` or `contact:<mongoId>` */
export function parseSmsRecipientSelection(value) {
  if (!value || typeof value !== 'string') return {};
  if (value.startsWith('user:')) {
    return { employeeUserId: value.slice(5) };
  }
  if (value.startsWith('contact:')) {
    return { employeeContactId: value.slice(8) };
  }
  return {};
}

function formatRoleLabel(role) {
  if (!role) return 'No app login';
  return String(role).replace(/_/g, ' ');
}

/**
 * Active user accounts (any role) and roster-only employees without login.
 * Sends `employeeUserId` or `employeeContactId` to `/twilio/send-sms`.
 */
export default function EmployeeSmsRecipientField({
  value,
  onChange,
  disabled,
  label = 'Send to employee',
  helperText,
  sx,
  autoSelectByName,
  dialogOpen = false,
}) {
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState([]);
  const [didAutoSelect, setDidAutoSelect] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await axios.get(`${API_URL}/users/employees-for-sms`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const list = res.data.recipients || res.data.employees || [];
        if (!cancelled) setRecipients(list);
      } catch {
        if (!cancelled) setRecipients([]);
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
    if (!autoSelectByName || didAutoSelect || value || !recipients.length) return;
    const q = String(autoSelectByName || '').trim().toLowerCase();
    if (!q) return;
    const match = (r) => {
      if (!r.name) return false;
      const n = r.name.trim().toLowerCase();
      return n === q || n.includes(q) || q.includes(n);
    };
    const exact = recipients.find((r) => r.hasMobile && match(r) && r.name.trim().toLowerCase() === q);
    const partial = recipients.find((r) => r.hasMobile && match(r));
    const pick = exact || partial;
    if (pick) {
      setDidAutoSelect(true);
      const v = pick.kind === 'contact' ? `contact:${pick._id}` : `user:${pick._id}`;
      onChange(v);
    }
  }, [autoSelectByName, didAutoSelect, value, recipients, onChange]);

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
          <em>Select a recipient</em>
        </MenuItem>
        {recipients.map((r) => {
          const v = r.kind === 'contact' ? `contact:${r._id}` : `user:${r._id}`;
          const sub =
            r.kind === 'contact'
              ? 'Roster (no login)'
              : formatRoleLabel(r.role);
          return (
            <MenuItem key={v} value={v} disabled={!r.hasMobile}>
              {r.name} — {sub}
              {r.mobile ? ` · ${r.mobile}` : ' — add mobile in Users / roster'}
            </MenuItem>
          );
        })}
      </Select>
      {helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
      {!recipients.length ? (
        <FormHelperText error>
          No team members with mobile numbers. Add users or roster employees.
        </FormHelperText>
      ) : null}
    </FormControl>
  );
}
