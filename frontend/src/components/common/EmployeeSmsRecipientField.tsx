import { useState, useEffect, useMemo } from 'react';
import { Autocomplete, TextField, Box, CircularProgress, Typography, FormHelperText } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import axios from 'axios';
import { formatPhoneForDisplay } from '../../utils/phoneFormat';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/** `value` format: `user:<mongoId>`, `contact:<mongoId>`, or `phone:<raw number>` */
export function parseSmsRecipientSelection(value) {
  if (!value || typeof value !== 'string') return {};
  if (value.startsWith('user:')) {
    return { employeeUserId: value.slice(5) };
  }
  if (value.startsWith('contact:')) {
    return { employeeContactId: value.slice(8) };
  }
  if (value.startsWith('phone:')) {
    return { to: value.slice(6).trim() };
  }
  return {};
}

function toCustomPhoneValue(raw: string): string {
  const trimmed = String(raw || '').trim();
  return trimmed ? `phone:${trimmed}` : '';
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
 * Searchable combo of team members with mobile on file, or type any phone number.
 * Sends `employeeUserId`, `employeeContactId`, or `to` to `/twilio/send-sms`.
 */
export default function EmployeeSmsRecipientField({
  value,
  onChange,
  disabled,
  label = 'Send to',
  helperText = 'Search employees or type any phone number',
  sx,
  autoSelectByName,
  dialogOpen = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  sx?: SxProps<Theme>;
  /** When set (e.g. employee display name), picks a matching SMS recipient once `value` is still empty */
  autoSelectByName?: string;
  dialogOpen?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState([]);
  const [didAutoSelect, setDidAutoSelect] = useState(false);

  const smsOptions = useMemo(
    () => recipients.filter((r) => r.hasMobile && r.mobile).map(toSmsOption),
    [recipients]
  );

  const autocompleteValue = useMemo(() => {
    if (!value) return null;
    const option = smsOptions.find((o) => o.selectionKey === value);
    if (option) return option;
    if (value.startsWith('phone:')) return value.slice(6);
    return null;
  }, [smsOptions, value]);

  const commitTypedRecipient = (raw: string) => {
    const typed = String(raw || '').trim();
    if (!typed) {
      onChange('');
      return;
    }
    const exactOption = smsOptions.find((o) => {
      const display = formatPhoneForDisplay(o.mobile) || o.mobile;
      const label = `${display} · ${o.name}`;
      return (
        label.toLowerCase() === typed.toLowerCase() ||
        display === typed ||
        o.mobile === typed
      );
    });
    if (exactOption) {
      onChange(exactOption.selectionKey);
      return;
    }
    onChange(toCustomPhoneValue(typed));
  };

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
    if (!autoSelectByName?.trim() || didAutoSelect || value || !recipients.length) return;
    const q = autoSelectByName.trim().toLowerCase();
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
        value={autocompleteValue}
        onChange={(_, newVal) => {
          if (newVal == null || newVal === '') {
            onChange('');
            return;
          }
          if (typeof newVal === 'string') {
            onChange(toCustomPhoneValue(newVal));
            return;
          }
          onChange(newVal.selectionKey || '');
        }}
        disabled={disabled}
        freeSolo
        autoHighlight
        selectOnFocus
        handleHomeEndKeys
        isOptionEqualToValue={(a, b) => {
          if (typeof a === 'string' && typeof b === 'string') return a === b;
          if (typeof a === 'string' || typeof b === 'string') return false;
          return a.selectionKey === b.selectionKey;
        }}
        getOptionLabel={(opt) => {
          if (typeof opt === 'string') return opt;
          return opt ? `${formatPhoneForDisplay(opt.mobile) || opt.mobile} · ${opt.name}` : '';
        }}
        filterOptions={(opts, state) => {
          const q = state.inputValue.trim().toLowerCase();
          if (!q) return opts;
          return opts.filter((o) => {
            const hay = `${o.mobile} ${formatPhoneForDisplay(o.mobile)} ${o.name} ${o.sub}`.toLowerCase();
            return hay.includes(q);
          });
        }}
        noOptionsText="No employee match — press Enter to use the number you typed."
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
            placeholder="Search by name or type any phone number…"
            helperText={helperText}
            onBlur={(e) => {
              if (typeof params.inputProps?.onBlur === 'function') {
                params.inputProps.onBlur(e);
              }
              commitTypedRecipient(e.target.value);
            }}
            inputProps={{
              ...params.inputProps,
              autoComplete: 'off',
            }}
          />
        )}
      />
      {!recipients.length ? (
        <FormHelperText sx={{ mx: 1.75 }}>
          No team members loaded — you can still type any phone number above.
        </FormHelperText>
      ) : null}
    </Box>
  );
}
