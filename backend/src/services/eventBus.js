function safeEmit(io, room, event, payload) {
  if (!io || !room || !event) return;
  io.to(room).emit(event, payload);
}

function shapeEntityEvent(event, entityName, entity, sourceSocketId) {
  const tenantId = entity?.tenantId ? String(entity.tenantId) : null;
  const entityId = entity?._id ? String(entity._id) : null;
  const patch = entity && typeof entity === 'object' ? entity : null;
  return {
    type: event,
    tenantId,
    entityId,
    patch,
    updatedAt: entity?.updatedAt || new Date().toISOString(),
    sourceSocketId: sourceSocketId || null,
    // Backward compatibility for existing listeners.
    [entityName]: patch,
  };
}

function publishProjectCreated(io, project, opts = {}) {
  if (!project?._id) return;
  const data = shapeEntityEvent('project.created', 'project', project, opts.sourceSocketId);
  safeEmit(io, `project:${project._id}`, 'project.created', data);
  if (project.tenantId) {
    safeEmit(io, `tenant:${project.tenantId}`, 'project.created', data);
  }
}

function publishProjectUpdated(io, project, opts = {}) {
  if (!project?._id) return;
  const data = shapeEntityEvent('project.updated', 'project', project, opts.sourceSocketId);
  safeEmit(io, `project:${project._id}`, 'project.updated', data);
  if (project.tenantId) {
    safeEmit(io, `tenant:${project.tenantId}`, 'project.updated', data);
  }
}

function publishTaskCreated(io, task, opts = {}) {
  if (!task?._id) return;
  const data = shapeEntityEvent('task.created', 'task', task, opts.sourceSocketId);
  safeEmit(io, `task:${task._id}`, 'task.created', data);
  if (task.tenantId) {
    safeEmit(io, `tenant:${task.tenantId}`, 'task.created', data);
  }
}

function publishTaskUpdated(io, task, opts = {}) {
  if (!task?._id) return;
  const data = shapeEntityEvent('task.updated', 'task', task, opts.sourceSocketId);
  safeEmit(io, `task:${task._id}`, 'task.updated', data);
  if (task.tenantId) {
    safeEmit(io, `tenant:${task.tenantId}`, 'task.updated', data);
  }
}

function publishRfidScanCreated(io, scan, opts = {}) {
  if (!scan?._id) return;
  const tenantId = scan.tenantId ? String(scan.tenantId) : null;
  const data = {
    type: 'rfid.scan.created',
    tenantId,
    scan: {
      _id: String(scan._id),
      uid: scan.uid,
      displayName: scan.displayName,
      scannedAt: scan.scannedAt,
      source: scan.source,
      deviceLabel: scan.deviceLabel,
      pin: scan.pin || '',
      knownTag: opts.knownTag === true,
      knownPin: opts.knownPin === true,
    },
    sourceSocketId: opts.sourceSocketId || null,
  };
  if (tenantId) {
    safeEmit(io, `tenant:${tenantId}`, 'rfid.scan.created', data);
  }
}

function publishRfidPinUpserted(io, pinEntry, opts = {}) {
  if (!pinEntry?._id) return;
  const tenantId = pinEntry.tenantId ? String(pinEntry.tenantId) : null;
  const data = {
    type: 'rfid.pin.upserted',
    tenantId,
    pinEntry: {
      _id: String(pinEntry._id),
      pin: pinEntry.pin,
      displayName: pinEntry.displayName,
      notes: pinEntry.notes,
    },
    sourceSocketId: opts.sourceSocketId || null,
  };
  if (tenantId) {
    safeEmit(io, `tenant:${tenantId}`, 'rfid.pin.upserted', data);
  }
}

function publishRfidPinDeleted(io, pinEntry, opts = {}) {
  if (!pinEntry?._id) return;
  const tenantId = pinEntry.tenantId ? String(pinEntry.tenantId) : null;
  const data = {
    type: 'rfid.pin.deleted',
    tenantId,
    pinId: String(pinEntry._id),
    sourceSocketId: opts.sourceSocketId || null,
  };
  if (tenantId) {
    safeEmit(io, `tenant:${tenantId}`, 'rfid.pin.deleted', data);
  }
}

function publishRfidTagUpserted(io, tag, opts = {}) {
  if (!tag?._id) return;
  const tenantId = tag.tenantId ? String(tag.tenantId) : null;
  const data = {
    type: 'rfid.tag.upserted',
    tenantId,
    tag: {
      _id: String(tag._id),
      uid: tag.uid,
      displayName: tag.displayName,
      notes: tag.notes,
    },
    sourceSocketId: opts.sourceSocketId || null,
  };
  if (tenantId) {
    safeEmit(io, `tenant:${tenantId}`, 'rfid.tag.upserted', data);
  }
}

function publishRfidTagDeleted(io, tag, opts = {}) {
  if (!tag?._id) return;
  const tenantId = tag.tenantId ? String(tag.tenantId) : null;
  const data = {
    type: 'rfid.tag.deleted',
    tenantId,
    tagId: String(tag._id),
    sourceSocketId: opts.sourceSocketId || null,
  };
  if (tenantId) {
    safeEmit(io, `tenant:${tenantId}`, 'rfid.tag.deleted', data);
  }
}

function publishRfidTimesheetUpdated(io, timesheet, opts = {}) {
  if (!timesheet?.employeeKey || !timesheet?.periodId) return;
  const tenantId = timesheet.tenantId ? String(timesheet.tenantId) : null;
  const data = {
    type: 'rfid.timesheet.updated',
    tenantId,
    timesheet: timesheet && typeof timesheet === 'object' ? timesheet : null,
    employeeKey: String(timesheet.employeeKey),
    periodId: String(timesheet.periodId),
    sourceSocketId: opts.sourceSocketId || null,
  };
  if (tenantId) {
    safeEmit(io, `tenant:${tenantId}`, 'rfid.timesheet.updated', data);
  }
}

function publishRfidEmployeeProfileUpdated(io, profile, opts = {}) {
  if (!profile?.employeeKey) return;
  const tenantId = profile.tenantId ? String(profile.tenantId) : null;
  const data = {
    type: 'rfid.employee-profile.updated',
    tenantId,
    profile: profile && typeof profile === 'object' ? profile : null,
    employeeKey: String(profile.employeeKey),
    sourceSocketId: opts.sourceSocketId || null,
  };
  if (tenantId) {
    safeEmit(io, `tenant:${tenantId}`, 'rfid.employee-profile.updated', data);
  }
}

module.exports = {
  publishProjectCreated,
  publishProjectUpdated,
  publishTaskCreated,
  publishTaskUpdated,
  publishRfidScanCreated,
  publishRfidTagUpserted,
  publishRfidTagDeleted,
  publishRfidPinUpserted,
  publishRfidPinDeleted,
  publishRfidTimesheetUpdated,
  publishRfidEmployeeProfileUpdated,
};
