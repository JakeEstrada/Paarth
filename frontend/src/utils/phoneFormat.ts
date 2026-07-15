/**
 * US/Canada NANP display: (XXX) XXX-XXXX when 10 digits (optional leading 1 stripped).
 * Storage uses the same formatted string for consistency with Twilio (digits are stripped server-side).
 */

/** Digits only, max 10 for NANP after stripping a single leading country code 1 */
export function nanpDigitsOnly(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.length >= 11 && d[0] === '1') d = d.slice(1);
  return d.slice(0, 10);
}

/**
 * Controlled input: user may type or paste digits or punctuation; value is always reformatted.
 * Examples: "" | "(" | "(949" | "(949)939" | "(949)939-3802"
 */
export function formatNanpTyping(input) {
  const d = nanpDigitsOnly(input);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)})${d.slice(3)}`;
  return `(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Pretty-print if exactly 10 NANP digits are present; otherwise return trimmed original */
export function formatPhoneForDisplay(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const d = nanpDigitsOnly(raw);
  if (d.length === 10) return `(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

/** Split comma/semicolon/newline-separated reminder numbers into trimmed parts */
export function splitReminderPhoneInput(input) {
  return String(input ?? '')
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Display stored reminder list — formats each number, joined with commas */
export function formatReminderPhonesForDisplay(input) {
  const parts = splitReminderPhoneInput(input);
  if (parts.length === 0) return '';
  return parts.map((part) => formatPhoneForDisplay(part) || part).join(', ');
}

/** Keep only valid 10-digit NANP numbers, stored as comma-separated digits */
export function normalizeReminderPhonesInput(input) {
  const digits = splitReminderPhoneInput(input)
    .map((part) => nanpDigitsOnly(part))
    .filter((d) => d.length === 10);
  return [...new Set(digits)].join(',');
}

/** True when at least one valid NANP number is present */
export function hasValidReminderPhone(input) {
  return splitReminderPhoneInput(input).some((part) => nanpDigitsOnly(part).length === 10);
}

/** `tel:` href for mobile browsers */
export function telHref(input) {
  const d = nanpDigitsOnly(input);
  if (d.length === 10) return `tel:+1${d}`;
  const raw = String(input ?? '').trim().replace(/\s/g, '');
  if (raw.startsWith('+')) return `tel:${raw}`;
  return d.length ? `tel:+${d}` : '';
}

/** Search: match literal substring or digit-only overlap (e.g. user types 949939) */
export function phoneSearchMatch(phoneValue, searchRaw) {
  const pv = String(phoneValue || '');
  const sr = String(searchRaw || '').trim();
  if (!sr) return false;
  if (pv.toLowerCase().includes(sr.toLowerCase())) return true;
  const sd = sr.replace(/\D/g, '');
  if (sd.length < 2) return false;
  return nanpDigitsOnly(pv).includes(sd);
}
