import api from './axios';
import { formatPhoneForDisplay } from './phoneFormat';

export const PIPELINE_SMS_STAGE_LABELS: Record<string, string> = {
  APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
  ESTIMATE_IN_PROGRESS: 'Estimate Current, first 5 days',
  ESTIMATE_SENT: 'Estimate Sent',
  ENGAGED_DESIGN_REVIEW: 'Design Review',
  CONTRACT_OUT: 'Contract Out',
  CONTRACT_SIGNED: 'Contract Signed',
  DEPOSIT_PENDING: 'Signed / Deposit Pending',
  JOB_PREP: 'Job Prep',
  TAKEOFF_COMPLETE: 'Fabrication',
  READY_TO_SCHEDULE: 'Ready to Schedule',
  SCHEDULED: 'Scheduled',
  IN_PRODUCTION: 'In Production',
  INSTALLED: 'Installed',
  FINAL_PAYMENT_CLOSED: 'Final Payment Closed',
};

export const PIPELINE_SMS_STAGES = Object.keys(PIPELINE_SMS_STAGE_LABELS);

const STAGE_ALIASES: Record<string, string[]> = {
  DEPOSIT_PENDING: ['DEPOSIT_PENDING', 'CONTRACT_SIGNED'],
  CONTRACT_SIGNED: ['CONTRACT_SIGNED', 'DEPOSIT_PENDING'],
};

export type PipelineSmsTemplate = {
  id?: string;
  stage: string;
  name: string;
  body: string;
  enabled: boolean;
};

export function stageLabel(stage: string) {
  return PIPELINE_SMS_STAGE_LABELS[stage] || String(stage || '').replace(/_/g, ' ');
}

export function findTemplateForStage(templates: PipelineSmsTemplate[], stage: string) {
  const keys = STAGE_ALIASES[stage] || [stage];
  return (templates || []).find((row) => row.enabled !== false && keys.includes(row.stage)) || null;
}

export function firstNameFromCustomer(name: string) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

export function resolveCustomerPhone(job: {
  jobContact?: { phone?: string };
  customerId?: {
    primaryPhone?: string;
    phones?: string[];
    contactPhones?: Array<{ value?: string }>;
  };
} | null | undefined) {
  const customer = job?.customerId && typeof job.customerId === 'object' ? job.customerId : null;
  const candidates = [
    customer?.primaryPhone,
    ...(Array.isArray(customer?.phones) ? customer.phones : []),
    ...(Array.isArray(customer?.contactPhones) ? customer.contactPhones.map((row) => row?.value) : []),
    job?.jobContact?.phone,
  ];
  const raw = candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
  return raw;
}

export function fillPipelineSmsTemplate(
  body: string,
  {
    customerName = '',
    senderName = '',
    companyName = '',
  }: { customerName?: string; senderName?: string; companyName?: string },
) {
  const first = firstNameFromCustomer(customerName);
  const replacements: Record<string, string> = {
    customer: customerName || 'there',
    name: customerName || 'there',
    firstname: first || customerName || 'there',
    sender: senderName || '',
    company: companyName || 'San Clemente Woodworking',
  };
  return String(body || '').replace(/\{\{\s*([a-zA-Z]+)\s*\}\}|\{\s*([a-zA-Z]+)\s*\}/g, (match, a, b) => {
    const key = String(a || b || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(replacements, key)) return replacements[key];
    return match;
  });
}

export async function fetchPipelineSmsTemplates(): Promise<PipelineSmsTemplate[]> {
  const { data } = await api.get('/tenants/pipeline-sms-templates');
  return Array.isArray(data?.templates) ? data.templates : [];
}

export async function savePipelineSmsTemplates(templates: PipelineSmsTemplate[]): Promise<PipelineSmsTemplate[]> {
  const { data } = await api.put('/tenants/pipeline-sms-templates', { templates });
  return Array.isArray(data?.templates) ? data.templates : [];
}

export function formatPromptPhone(phone: string) {
  return formatPhoneForDisplay(phone) || phone;
}
