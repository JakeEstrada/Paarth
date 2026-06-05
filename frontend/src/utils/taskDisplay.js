export function jobHasCalendarSchedule(job) {
  if (!job) return false;
  if (job.schedule?.startDate) return true;
  if (Array.isArray(job.schedule?.entries) && job.schedule.entries.some((e) => e?.startDate)) {
    return true;
  }
  return false;
}

export function getTaskJobId(task) {
  if (!task?.jobId) return null;
  if (typeof task.jobId === 'object') {
    return task.jobId._id || task.jobId.id || null;
  }
  return task.jobId;
}

/** Prefer a full pipeline job (has schedule/stage) over a lightly populated task.jobId. */
export function resolveTaskJob(task, jobsById = null) {
  const jobId = getTaskJobId(task);
  if (!jobId) return null;

  const fromPipeline = jobsById?.[String(jobId)];
  if (fromPipeline) return fromPipeline;

  if (task?.jobId && typeof task.jobId === 'object') {
    return task.jobId;
  }
  return null;
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

export function buildJobsById(jobs = []) {
  const map = {};
  jobs.forEach((job) => {
    if (job?._id) map[String(job._id)] = job;
  });
  return map;
}

export function getTaskCardStyle(task, theme, { isProject = false, jobsById = null } = {}) {
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
  const linkedJob = resolveTaskJob(task, jobsById);
  if (linkedJob) {
    const { color } = getJobCardAccent(linkedJob, theme);
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
