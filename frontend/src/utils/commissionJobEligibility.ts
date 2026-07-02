/** Job readiness + execution — accepted jobs (pipeline level 2+), not sales/appointments. */
export const COMMISSION_ELIGIBLE_STAGES = [
  'DEPOSIT_PENDING',
  'JOB_PREP',
  'TAKEOFF_COMPLETE',
  'READY_TO_SCHEDULE',
  'SCHEDULED',
  'IN_PRODUCTION',
  'INSTALLED',
  'FINAL_PAYMENT_CLOSED',
  'CONTRACT_SIGNED',
] as const;

export function isCommissionEligibleJob(job: {
  stage?: string;
  isDeadEstimate?: boolean;
} | null | undefined): boolean {
  if (!job || job.isDeadEstimate) return false;
  const stage = String(job.stage || '').trim();
  if (!stage) return false;
  return (COMMISSION_ELIGIBLE_STAGES as readonly string[]).includes(stage);
}
