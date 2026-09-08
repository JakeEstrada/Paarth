/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Tenant = require('../models/Tenant');
const Vendor = require('../models/Vendor');
const User = require('../models/User');

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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    if (row.some((cell) => String(cell || '').trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      pushField();
      pushRow();
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    pushField();
    pushRow();
  }
  return rows;
}

function itemKey(item) {
  const product = String(item.productNumber || '').trim().toLowerCase();
  const code = String(item.itemCode || '').trim().toLowerCase();
  const desc = String(item.description || '').trim().toLowerCase();
  return product || `${code}|${desc}`;
}

async function listTenants() {
  const rows = await Tenant.find({}, { name: 1, slug: 1, isActive: 1 })
    .setOptions({ bypassTenant: true })
    .lean();
  return rows
    .map((t) => `- ${t.slug} (${t.name})${t.isActive === false ? ' [inactive]' : ''}  id=${t._id}`)
    .join('\n');
}

async function resolveTenant(args) {
  const tenantId = String(args.tenantId || '').trim();
  if (tenantId) {
    const byId = await Tenant.findById(tenantId).setOptions({ bypassTenant: true });
    if (!byId) throw new Error(`Tenant not found for id ${tenantId}\nAvailable:\n${await listTenants()}`);
    return byId;
  }
  const slug = String(args.slug || args.tenant || '').trim().toLowerCase();
  if (slug) {
    const bySlug = await Tenant.findOne({ slug }).setOptions({ bypassTenant: true });
    if (bySlug) return bySlug;
    throw new Error(`Tenant not found for slug "${slug}".\nAvailable:\n${await listTenants()}`);
  }
  const boltHits = await Vendor.find({ name: { $regex: /bolt\s*depot/i } })
    .setOptions({ bypassTenant: true })
    .select('name tenantId')
    .lean();
  const tenantIds = [...new Set(boltHits.map((v) => String(v.tenantId || '')))];
  if (tenantIds.length === 1) {
    return Tenant.findById(tenantIds[0]).setOptions({ bypassTenant: true });
  }
  throw new Error(
    `Pass --slug <tenant-slug> or --tenantId <id>. Bolt Depot was found on ${tenantIds.length} tenant(s).\nAvailable:\n${await listTenants()}`,
  );
}

async function findOrCreateVendor(tenantId, name, createdBy, dryRun) {
  const existing = await Vendor.findOne({
    tenantId,
    name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  }).setOptions({ bypassTenant: true });
  if (existing) return { vendor: existing, created: false };
  if (dryRun) return { vendor: { name, orderItems: [] }, created: true };
  const vendor = new Vendor({
    tenantId,
    name,
    category: 'hardware',
    notes: '',
    orderItems: [],
    createdBy,
  });
  await vendor.save({ validateBeforeSave: true });
  return { vendor, created: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = String(args.dryRun || '').toLowerCase() === 'true';
  const csvPath = path.resolve(String(args.csv || path.join(__dirname, '../data/inventory-sheet2.csv')));

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required in environment.');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at ${csvPath}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const header = (rows[0] || []).map((cell) => String(cell || '').trim().toLowerCase());
  const idx = {
    itemCode: header.findIndex((h) => h === 'item#' || h === 'item'),
    description: header.findIndex((h) => h === 'description'),
    productNumber: header.findIndex((h) => h === 'product#' || h === 'product'),
    vendor: header.findIndex((h) => h === 'vendor'),
    link: header.findIndex((h) => h === 'link'),
  };
  if (idx.vendor < 0 || idx.description < 0) {
    console.error('CSV needs Description and Vendor columns');
    process.exit(1);
  }

  const grouped = new Map();
  for (const row of rows.slice(1)) {
    const vendorName = String(row[idx.vendor] || '').trim();
    const description = String(row[idx.description] || '').trim();
    if (!vendorName || !description) continue;
    const item = {
      itemCode: idx.itemCode >= 0 ? String(row[idx.itemCode] || '').trim() : '',
      description,
      productNumber: idx.productNumber >= 0 ? String(row[idx.productNumber] || '').trim() : '',
      link: idx.link >= 0 ? String(row[idx.link] || '').trim() : '',
    };
    if (!grouped.has(vendorName)) grouped.set(vendorName, []);
    grouped.get(vendorName).push(item);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  try {
    const tenant = await resolveTenant(args);
    console.log(`Tenant: ${tenant.slug} (${tenant.name}) ${tenant._id}${dryRun ? ' [dry run]' : ''}`);

    const createdByUser = await User.findOne({ tenantId: tenant._id, isActive: { $ne: false } })
      .setOptions({ bypassTenant: true })
      .select('_id');
    if (!createdByUser && !dryRun) {
      throw new Error('No user on this tenant to set as createdBy');
    }

    const summary = [];
    for (const [vendorName, incoming] of grouped) {
      const { vendor, created } = await findOrCreateVendor(
        tenant._id,
        vendorName,
        createdByUser?._id,
        dryRun,
      );
      if (!Array.isArray(vendor.orderItems)) vendor.orderItems = [];
      const have = new Set(vendor.orderItems.map(itemKey).filter(Boolean));
      let added = 0;
      for (const item of incoming) {
        const key = itemKey(item);
        if (key && have.has(key)) continue;
        if (key) have.add(key);
        vendor.orderItems.push(item);
        added += 1;
      }
      if (!dryRun && (added || created)) await vendor.save();
      summary.push({ vendor: vendorName, created, added, total: vendor.orderItems.length });
    }

    console.log(JSON.stringify({ dryRun, csvPath, vendors: summary }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
