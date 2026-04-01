function safeEmit(io, room, event, payload) {
  if (!io || !room || !event) return;
  io.to(room).emit(event, payload);
}

function publishProjectCreated(io, project) {
  if (!project?._id) return;
  const data = { project };
  safeEmit(io, `project:${project._id}`, 'project.created', data);
  if (project.tenantId) {
    safeEmit(io, `tenant:${project.tenantId}`, 'project.created', data);
  }
}

function publishProjectUpdated(io, project) {
  if (!project?._id) return;
  const data = { project };
  safeEmit(io, `project:${project._id}`, 'project.updated', data);
  if (project.tenantId) {
    safeEmit(io, `tenant:${project.tenantId}`, 'project.updated', data);
  }
}

function publishTaskCreated(io, task) {
  if (!task?._id) return;
  const data = { task };
  safeEmit(io, `task:${task._id}`, 'task.created', data);
  if (task.tenantId) {
    safeEmit(io, `tenant:${task.tenantId}`, 'task.created', data);
  }
}

function publishTaskUpdated(io, task) {
  if (!task?._id) return;
  const data = { task };
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
