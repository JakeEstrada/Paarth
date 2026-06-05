export function jobHasCalendarSchedule(job) {
  if (!job) return false;
  if (job.schedule?.startDate) return true;
  if (Array.isArray(job.schedule?.entries) && job.schedule.entries.some((e) => e?.startDate)) {
    return true;
  }
  return false;
}

/** Same left-border accent logic as pipeline JobCard. */
export function getJobCardAccent(job, theme) {
  const readinessStages = ['DEPOSIT_PENDING', 'JOB_PREP', 'TAKEOFF_COMPLETE', 'READY_TO_SCHEDULE'];
  const isArchived = !!job?.isArchived;
  const isDeadEstimate = !!job?.isDeadEstimate;
  const hasSchedule = jobHasCalendarSchedule(job);
  const isScheduledJob =
    (hasSchedule || job?.stage === 'SCHEDULED') && !isArchived && !isDeadEstimate;
  const isBenchJob =
    readinessStages.includes(job?.stage) &&
    !isArchived &&
    !isDeadEstimate &&
    !hasSchedule;

  if (isScheduledJob) {
    return { color: theme.palette.success.main };
  }
  if (isBenchJob) {
    return { color: '#F57C00' };
  }
  return { color: theme.palette.info.main };
}

/** e.g. "Create final invoice - We will be finished by 10 am | RWA" */
export function formatTaskDisplayLabel(task) {
  const title = (task?.title || '').trim();
  const description = (task?.description || '').trim();
  const jobTitle = (task?.jobId?.title || '').trim();
  const customerName = (task?.customerId?.name || '').trim();

  let label = title || 'Untitled task';
  if (description) {
    label += ` - ${description}`;
  }
  if (jobTitle) {
    label += ` | ${jobTitle}`;
  } else if (customerName) {
    label += ` | ${customerName}`;
  }
  return label;
}

export function getTaskCardStyle(task, theme, { isProject = false } = {}) {
  if (task?.isUrgent) {
    return {
      borderLeft: '3px solid #D32F2F',
      backgroundColor: 'rgba(211, 47, 47, 0.05)',
    };
  }
  if (isProject || task?.isProject) {
    return {
      borderLeft: '3px solid #9C27B0',
      backgroundColor: 'inherit',
    };
  }
  if (task?.jobId) {
    const { color } = getJobCardAccent(task.jobId, theme);
    return {
      borderLeft: `3px solid ${color}`,
      backgroundColor: 'inherit',
    };
  }
  return {
    borderLeft: '3px solid #1976D2',
    backgroundColor: 'inherit',
  };
}
