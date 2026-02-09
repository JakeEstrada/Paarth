// Stage enum → Human-readable labels for frontend
const STAGE_LABELS = {
    // Appointments
    APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
    
    // Sales phase
    ESTIMATE_IN_PROGRESS: 'Estimate Current, first 5 days',
    ESTIMATE_SENT: 'Estimate Sent',
    ENGAGED_DESIGN_REVIEW: 'Design Review',
    CONTRACT_OUT: 'Contract Out',
    CONTRACT_SIGNED: 'Contract Signed', // Kept for backward compatibility but not shown in UI
    
    // Job readiness phase
    DEPOSIT_PENDING: 'Signed / Deposit Pending',
    JOB_PREP: 'Job Prep',
    TAKEOFF_COMPLETE: 'Takeoff Complete',
    READY_TO_SCHEDULE: 'Ready to Schedule',
    
    // Execution phase
    SCHEDULED: 'Scheduled',
    IN_PRODUCTION: 'In Production',
    INSTALLED: 'Installed',
    FINAL_PAYMENT_CLOSED: 'Final Payment Closed'
  };
  
  // Phase groupings for UI organization
  const STAGE_PHASES = {
    appointments: [
      'APPOINTMENT_SCHEDULED'
    ],
    sales: [
      'ESTIMATE_IN_PROGRESS',
      'ESTIMATE_SENT',
      'ENGAGED_DESIGN_REVIEW',
      'CONTRACT_OUT'
    ],
    readiness: [
      'DEPOSIT_PENDING',
      'JOB_PREP',
      'TAKEOFF_COMPLETE',
      'READY_TO_SCHEDULE'
    ],
    execution: [
      'SCHEDULED',
      'IN_PRODUCTION',
      'INSTALLED',
      'FINAL_PAYMENT_CLOSED'
    ]
  };
  
  // Get all stages in order (excluding CONTRACT_SIGNED from active pipeline)
  const ALL_STAGES = [
    ...STAGE_PHASES.appointments,
    ...STAGE_PHASES.sales,
    ...STAGE_PHASES.readiness,
    ...STAGE_PHASES.execution
  ];
  
  module.exports = {
    STAGE_LABELS,
    STAGE_PHASES,
    ALL_STAGES
  };