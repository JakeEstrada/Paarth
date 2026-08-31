import { useEffect, useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let cached: { at: number; names: string[] } | null = null;
const CACHE_MS = 60_000;

async function loadReferralCompanies(): Promise<string[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.names;
  const { data } = await axios.get(`${API_URL}/jobs/referral-companies`);
  const names = Array.isArray(data?.companies) ? data.companies.map((name: unknown) => String(name || '').trim()).filter(Boolean) : [];
  cached = { at: Date.now(), names };
  return names;
}

export function rememberReferralCompany(name: string) {
  const clipped = String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (!clipped) return;
  const names = cached?.names ? [...cached.names] : [];
  const without = names.filter((row) => row.toLowerCase() !== clipped.toLowerCase());
  cached = { at: Date.now(), names: [clipped, ...without] };
}

export default function ReferralCompanyField({
  value,
  onChange,
  size = 'medium',
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  size?: 'small' | 'medium';
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<string[]>(cached?.names || []);

  useEffect(() => {
    let cancelled = false;
    loadReferralCompanies()
      .then((names) => {
        if (!cancelled) setOptions(names);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Autocomplete
      freeSolo
      options={options}
      value={value || ''}
      inputValue={value || ''}
      onChange={(_, next) => onChange(typeof next === 'string' ? next.slice(0, 120) : '')}
      onInputChange={(_, next) => onChange(String(next || '').slice(0, 120))}
      disabled={disabled}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Referring company"
          placeholder="Type a company name"
          size={size}
          helperText="Optional. Companies you've used before show up as you type."
        />
      )}
    />
  );
}
