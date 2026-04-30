/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Tenant = require('../models/Tenant');

const COLLECTIONS = [
  'users',
  'customers',
  'pipelinelayouts',
  'jobs',
  'tasks',
  'appointments',
  'documentfolders',
  'files',
  'bills',
  'activities',
  'estimates',
  'invoices',
  'contracts',
  'documentsequences',
  'plaidregistercaches',
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function bool(v, fallback = false) {
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function toObjectId(v) {
  if (!v) return null;
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return null;
  }
}

function setAtPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

function getAtPath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function remapSingleId(raw, map) {
  if (!raw || !map) return raw;
  const key = String(raw);
  return map.get(key) || raw;
}

function remapPath(doc, path, map) {
  const current = getAtPath(doc, path);
  if (current == null) return;
  if (Array.isArray(current)) {
    setAtPath(
      doc,
      path,
      current.map((x) => remapSingleId(x, map))
    );
    return;
  }
  setAtPath(doc, path, remapSingleId(current, map));
}

function anonymizeUser(doc, idx) {
  const n = idx + 1;
  doc.name = `Demo User ${n}`;
  doc.email = `demo.user.${n}@example.com`;
  doc.isActive = true;
  doc.isPending = false;
}

function anonymizeCustomer(doc, idx) {
  const n = idx + 1;
  doc.name = `Customer ${n}`;
  doc.primaryPhone = `555-010${String(n % 10)}`;
  doc.primaryEmail = `customer.${n}@example.com`;
  if (Array.isArray(doc.phones)) doc.phones = doc.phones.map(() => doc.primaryPhone);
  if (Array.isArray(doc.emails)) doc.emails = doc.emails.map(() => doc.primaryEmail);
  if (Array.isArray(doc.contactPhones)) {
    doc.contactPhones = doc.contactPhones.map((p, i) => ({ ...p, value: `555-01${String(n).padStart(2, '0')}${i}` }));
  }
  if (Array.isArray(doc.contactEmails)) {
    doc.contactEmails = doc.contactEmails.map((e, i) => ({ ...e, value: `contact.${n}.${i}@example.com` }));
  }
}

function anonymizeJob(doc, idx) {
  const n = idx + 1;
  if (doc.jobContact?.phone) doc.jobContact.phone = `555-030${String(n % 10)}`;
  if (doc.jobContact?.email) doc.jobContact.email = `job.contact.${n}@example.com`;
}

function anonymizeAppointment(doc, idx) {
  const n = idx + 1;
  if (doc.customerName) doc.customerName = `Customer ${n}`;
  if (doc.customerPhone) doc.customerPhone = `555-040${String(n % 10)}`;
  if (doc.customerEmail) doc.customerEmail = `appointment.${n}@example.com`;
}

function anonymizeByCollection(name, doc, idx) {
  switch (name) {
    case 'users':
      anonymizeUser(doc, idx);
      break;
    case 'customers':
      anonymizeCustomer(doc, idx);
      break;
    case 'jobs':
      anonymizeJob(doc, idx);
      break;
    case 'appointments':
      anonymizeAppointment(doc, idx);
      break;
    default:
      break;
  }
}

function remapReferences(collectionName, doc, maps) {
  const userMap = maps.users;
  const customerMap = maps.customers;
  const jobMap = maps.jobs;
  const taskMap = maps.tasks;
  const fileMap = maps.files;
  const folderMap = maps.documentfolders;
  const estimateMap = maps.estimates;
  const invoiceMap = maps.invoices;
  const contractMap = maps.contracts;
  const pipelineLayoutMap = maps.pipelinelayouts;

  switch (collectionName) {
    case 'users':
      remapPath(doc, 'createdBy', userMap);
      break;
    case 'customers':
      remapPath(doc, 'createdBy', userMap);
      break;
    case 'pipelinelayouts':
      break;
    case 'jobs':
      remapPath(doc, 'customerId', customerMap);
      remapPath(doc, 'assignedTo', userMap);
      remapPath(doc, 'takeoff.completedBy', userMap);
      remapPath(doc, 'notes', null);
      if (Array.isArray(doc.notes)) {
        doc.notes = doc.notes.map((n) => ({
          ...n,
          createdBy: remapSingleId(n.createdBy, userMap),
        }));
      }
      remapPath(doc, 'archivedBy', userMap);
      remapPath(doc, 'completedClosedOutBy', userMap);
      remapPath(doc, 'createdBy', userMap);
      remapPath(doc, 'pipelineLayoutId', pipelineLayoutMap);
      remapPath(doc, 'plaidLink.linkedBy', userMap);
      break;
    case 'tasks':
      remapPath(doc, 'jobId', jobMap);
      remapPath(doc, 'customerId', customerMap);
      remapPath(doc, 'projectTaskId', taskMap);
      remapPath(doc, 'assignedTo', userMap);
      remapPath(doc, 'completedBy', userMap);
      remapPath(doc, 'createdBy', userMap);
      if (Array.isArray(doc.notes)) {
        doc.notes = doc.notes.map((n) => ({ ...n, createdBy: remapSingleId(n.createdBy, userMap) }));
      }
      if (Array.isArray(doc.updates)) {
        doc.updates = doc.updates.map((u) => ({ ...u, createdBy: remapSingleId(u.createdBy, userMap) }));
      }
      break;
    case 'appointments':
      remapPath(doc, 'jobId', jobMap);
      remapPath(doc, 'customerId', customerMap);
      remapPath(doc, 'createdBy', userMap);
      break;
    case 'documentfolders':
      remapPath(doc, 'parentId', folderMap);
      remapPath(doc, 'createdBy', userMap);
      break;
    case 'files':
      remapPath(doc, 'jobId', jobMap);
      remapPath(doc, 'taskId', taskMap);
      remapPath(doc, 'customerId', customerMap);
      remapPath(doc, 'folderId', folderMap);
      remapPath(doc, 'uploadedBy', userMap);
      break;
    case 'bills':
      break;
    case 'activities':
      remapPath(doc, 'jobId', jobMap);
      remapPath(doc, 'taskId', taskMap);
      remapPath(doc, 'customerId', customerMap);
      remapPath(doc, 'fileId', fileMap);
      remapPath(doc, 'createdBy', userMap);
      break;
    case 'estimates':
      remapPath(doc, 'customerId', customerMap);
      remapPath(doc, 'jobId', jobMap);
      remapPath(doc, 'createdBy', userMap);
      remapPath(doc, 'updatedBy', userMap);
      if (doc.derivedDocuments) {
        if (Array.isArray(doc.derivedDocuments.invoiceIds)) {
          doc.derivedDocuments.invoiceIds = doc.derivedDocuments.invoiceIds.map((id) => remapSingleId(id, invoiceMap));
        }
        if (Array.isArray(doc.derivedDocuments.contractIds)) {
          doc.derivedDocuments.contractIds = doc.derivedDocuments.contractIds.map((id) => remapSingleId(id, contractMap));
        }
      }
      break;
    case 'invoices':
      remapPath(doc, 'customerId', customerMap);
      remapPath(doc, 'jobId', jobMap);
      remapPath(doc, 'estimateId', estimateMap);
      remapPath(doc, 'createdBy', userMap);
      remapPath(doc, 'updatedBy', userMap);
      break;
    case 'contracts':
      remapPath(doc, 'customerId', customerMap);
      remapPath(doc, 'jobId', jobMap);
      remapPath(doc, 'estimateId', estimateMap);
      remapPath(doc, 'createdBy', userMap);
      remapPath(doc, 'updatedBy', userMap);
      break;
    case 'documentsequences':
    case 'plaidregistercaches':
      break;
    default:
      break;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceSlug = String(args.source || '').trim();
  const targetSlug = String(args.target || '').trim();
  const targetName = String(args.targetName || targetSlug || '').trim();
  const dryRun = bool(args.dryRun, true);
  const anonymize = bool(args.anonymize, false);
  const demoEmail = String(args.demoEmail || '').trim().toLowerCase();
  const demoPassword = String(args.demoPassword || '').trim();

  if (!sourceSlug || !targetSlug || !targetName) {
    console.error(
      'Usage: node src/scripts/cloneTenant.js --source <source-slug> --target <target-slug> --targetName "<Tenant Name>" [--dryRun true|false] [--anonymize true|false] [--demoEmail email --demoPassword password]'
    );
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required in environment.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  try {
    const sourceTenant = await Tenant.findOne({
      $or: [
        { slug: sourceSlug.toLowerCase() },
        { name: sourceSlug },
        { name: { $regex: `^${sourceSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      ],
    }).setOptions({ bypassTenant: true });
    if (!sourceTenant) {
      const available = await Tenant.find({}, { name: 1, slug: 1, isActive: 1 })
        .setOptions({ bypassTenant: true })
        .lean();
      const options = available
        .map((t) => `- ${t.slug} (${t.name})${t.isActive ? '' : ' [inactive]'}`)
        .join('\n');
      throw new Error(`Source tenant not found: ${sourceSlug}\nAvailable tenants:\n${options || '(none found)'}`);
    }
    const existingTarget = await Tenant.findOne({ slug: targetSlug }).setOptions({ bypassTenant: true });
    if (existingTarget) {
      throw new Error(`Target tenant slug already exists: ${targetSlug}`);
    }

    const targetTenantId = new mongoose.Types.ObjectId();
    const targetTenant = {
      _id: targetTenantId,
      name: targetName,
      slug: targetSlug.toLowerCase(),
      isActive: true,
      logo: sourceTenant.logo || undefined,
      logoLight: sourceTenant.logoLight || undefined,
      logoDark: sourceTenant.logoDark || undefined,
      pipelineStageOverrides: sourceTenant.pipelineStageOverrides || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = mongoose.connection.db;
    const sourceDocs = {};
    const idMaps = {};

    for (const col of COLLECTIONS) {
      const docs = await db.collection(col).find({ tenantId: sourceTenant._id }).toArray();
      sourceDocs[col] = docs;
      const map = new Map();
      docs.forEach((d) => map.set(String(d._id), new mongoose.Types.ObjectId()));
      idMaps[col] = map;
      console.log(`${col}: ${docs.length}`);
    }

    if (dryRun) {
      console.log('\n[DRY RUN] No data written.');
      console.log(`Would create tenant: ${targetTenant.slug} (${targetTenant._id})`);
      return;
    }

    await db.collection('tenants').insertOne(targetTenant);
    console.log(`Created target tenant ${targetSlug}`);

    for (const col of COLLECTIONS) {
      const docs = sourceDocs[col];
      if (!docs.length) continue;
      const out = docs.map((src, idx) => {
        const cloned = { ...src };
        cloned._id = idMaps[col].get(String(src._id));
        cloned.tenantId = targetTenantId;
        remapReferences(col, cloned, idMaps);
        if (anonymize) anonymizeByCollection(col, cloned, idx);
        return cloned;
      });
      await db.collection(col).insertMany(out, { ordered: false });
      console.log(`Cloned ${out.length} -> ${col}`);
    }

    if (demoEmail && demoPassword) {
      const users = db.collection('users');
      const existingDemo = await users.findOne({ tenantId: targetTenantId, email: demoEmail });
      if (!existingDemo) {
        const hash = await bcrypt.hash(demoPassword, 10);
        await users.insertOne({
          _id: new mongoose.Types.ObjectId(),
          tenantId: targetTenantId,
          name: 'Demo Admin',
          email: demoEmail,
          password: hash,
          role: 'admin',
          isActive: true,
          isPending: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`Created demo login: ${demoEmail}`);
      } else {
        console.log(`Demo login already exists: ${demoEmail}`);
      }
    }

    console.log('\nClone complete.');
    console.log(`Source tenant: ${sourceSlug}`);
    console.log(`Target tenant: ${targetSlug}`);
    console.log(`Anonymized: ${anonymize ? 'yes' : 'no'}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('cloneTenant failed:', err?.message || err);
  process.exit(1);
});

