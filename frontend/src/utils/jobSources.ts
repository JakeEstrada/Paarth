export const JOB_SOURCE_OPTIONS = [
  { value: 'referral', label: 'Referral' },
  { value: 'vehicle_advertisement', label: 'Vehicle Advertisement' },
  { value: 'yelp', label: 'Yelp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'website', label: 'Website' },
  { value: 'repeat', label: 'Repeat Customer' },
  { value: 'other', label: 'Other' },
] as const;

export function formatJobSource(source: string | null | undefined) {
  const value = String(source || '').trim();
  if (!value) return 'Other';
  const hit = JOB_SOURCE_OPTIONS.find((row) => row.value === value);
  return hit?.label || value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Allow typing dollars freely — digits and one decimal point only. */
export function sanitizeMoneyTypingInput(raw: string) {
  let value = String(raw ?? '').replace(/[^\d.]/g, '');
  const parts = value.split('.');
  if (parts.length > 2) {
    value = `${parts[0]}.${parts.slice(1).join('')}`;
  }
  if (parts.length === 2 && parts[1].length > 2) {
    value = `${parts[0]}.${parts[1].slice(0, 2)}`;
  }
  return value;
}
