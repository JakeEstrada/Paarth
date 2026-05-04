import { useState, useEffect, useMemo } from 'react';
import { Autocomplete, TextField, Box, CircularProgress, Typography, FormHelperText } from '@mui/material';
import axios from 'axios';
import { formatPhoneForDisplay } from '../../utils/phoneFormat';

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

function toSmsOption(r) {
  const selectionKey = r.kind === 'contact' ? `contact:${r._id}` : `user:${r._id}`;
  const sub = r.kind === 'contact' ? 'Roster (no login)' : formatRoleLabel(r.role);
  return {
    selectionKey,
    mobile: r.mobile || '',
    name: r.name || 'Unnamed',
    sub,
  };
}

/**
 * Searchable combo of team members who have a mobile on file (users + roster).
 * Sends `employeeUserId` or `employeeContactId` to `/twilio/send-sms`. Arbitrary phone numbers cannot be entered.
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

  const smsOptions = useMemo(
    () => recipients.filter((r) => r.hasMobile && r.mobile).map(toSmsOption),
    [recipients]
  );

  const selectedOption = useMemo(
    () => smsOptions.find((o) => o.selectionKey === value) || null,
    [smsOptions, value]
  );

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
    const withMobile = recipients.filter((r) => r.hasMobile);
    const exact = withMobile.find((r) => match(r) && r.name.trim().toLowerCase() === q);
    const partial = withMobile.find((r) => match(r));
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
    <Box sx={sx}>
      <Autocomplete
        options={smsOptions}
        value={selectedOption}
        onChange={(_, newVal) => onChange(newVal?.selectionKey || '')}
        disabled={disabled}
        freeSolo={false}
        autoHighlight
        selectOnFocus
        handleHomeEndKeys
        isOptionEqualToValue={(a, b) => a.selectionKey === b.selectionKey}
        getOptionLabel={(opt) =>
          opt ? `${formatPhoneForDisplay(opt.mobile) || opt.mobile} · ${opt.name}` : ''
        }
        filterOptions={(opts, state) => {
          const q = state.inputValue.trim().toLowerCase();
          if (!q) return opts;
          return opts.filter((o) => {
            const hay = `${o.mobile} ${formatPhoneForDisplay(o.mobile)} ${o.name} ${o.sub}`.toLowerCase();
            return hay.includes(q);
          });
        }}
        noOptionsText="No employee matches that search (with a mobile on file)."
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.selectionKey}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatPhoneForDisplay(option.mobile) || option.mobile}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.name} · {option.sub}
              </Typography>
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            required
            placeholder="Search by phone or name…"
            helperText={helperText}
            inputProps={{
              ...params.inputProps,
              autoComplete: 'off',
            }}
          />
        )}
      />
      {!recipients.length ? (
        <FormHelperText error sx={{ mx: 1.75 }}>
          No team members found. Add users or roster employees.
        </FormHelperText>
      ) : !smsOptions.length ? (
        <FormHelperText error sx={{ mx: 1.75 }}>
          No one has a mobile number on file. Add mobile in Users or roster before sending SMS.
        </FormHelperText>
      ) : null}
    </Box>
  );
}
