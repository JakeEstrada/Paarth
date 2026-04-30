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

module.exports = {
  publishProjectCreated,
  publishProjectUpdated,
  publishTaskCreated,
  publishTaskUpdated,
};
