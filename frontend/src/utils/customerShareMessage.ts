import { formatPhoneForDisplay, nanpDigitsOnly } from './phoneFormat';

type ContactPhone = { value?: string };
type Address = { street?: string; city?: string; state?: string; zip?: string };

export type ShareableCustomer = {
  name?: string;
  primaryPhone?: string;
  primaryEmail?: string;
  contactPhones?: ContactPhone[];
  address?: Address;
  gateCode?: string;
};

function formatAddress(address?: Address | null): string {
  if (!address) return '';
  return [address.street, address.city, address.state, address.zip].filter(Boolean).join(', ');
}

function collectPhones(customer?: ShareableCustomer | null, extraPhones: string[] = []): string[] {
  const phones: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    const value = String(raw || '').trim();
    if (!value) return;
    const digits = nanpDigitsOnly(value);
    const key = digits.length === 10 ? digits : value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    phones.push(formatPhoneForDisplay(value));
  };
  extraPhones.forEach(add);
  add(customer?.primaryPhone);
  (customer?.contactPhones || []).forEach((row) => add(row?.value));
  return phones;
}

/** Text body used when sharing a customer from the directory, job card, or calendar. */
export function buildCustomerShareMessage(options: {
  customer?: ShareableCustomer | null;
  jobTitle?: string;
  address?: string;
  extraPhones?: string[];
  extraEmail?: string;
  extraEmails?: string[];
} = {}): string {
  const customer = options.customer || {};
  const phones = collectPhones(customer, options.extraPhones || []);
  const emails = [
    ...((options.extraEmails || []).map((value) => String(value || '').trim()).filter(Boolean)),
    String(options.extraEmail || '').trim(),
    String(customer.primaryEmail || '').trim(),
  ].filter((value, index, list) => value && list.indexOf(value) === index);
  const address = String(options.address || formatAddress(customer.address) || '').trim();
  const gateCode = String(customer.gateCode || '').trim();
  return [
    `Customer: ${customer.name || 'Unknown'}`,
    options.jobTitle ? `Job: ${options.jobTitle}` : null,
    phones.length ? `Phone: ${phones.join(', ')}` : null,
    emails.length ? `Email: ${emails.join(', ')}` : null,
    address ? `Address: ${address}` : null,
    gateCode ? `Gate code: ${gateCode}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
