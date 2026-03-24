const User = require('../models/User');
const Customer = require('../models/Customer');
const Job = require('../models/Job');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Appointment = require('../models/Appointment');
const File = require('../models/File');
const DocumentFolder = require('../models/DocumentFolder');
const Bill = require('../models/Bill');

async function backfillTenantIds(defaultTenantId) {
  const filter = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
  const update = { $set: { tenantId: defaultTenantId } };

  const models = [User, Customer, Job, Task, Activity, Appointment, File, DocumentFolder, Bill];
  for (const Model of models) {
    await Model.updateMany(filter, update);
  }
}

module.exports = { backfillTenantIds };
