/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Tenant = require('../models/Tenant');
const WebsiteContent = require('../models/WebsiteContent');
const { storeWebsiteFileFromDisk } = require('../utils/websiteAssetStore');

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

function defaultSiteRoot() {
  if (process.env.SCWW_SITE_ROOT) return process.env.SCWW_SITE_ROOT;
  return path.resolve(__dirname, '../../../../sites/scww_site');
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
  const slug = String(args.slug || args.tenant || 'scww').trim().toLowerCase();
  if (tenantId) {
    const byId = await Tenant.findById(tenantId).setOptions({ bypassTenant: true });
    if (!byId) throw new Error(`Tenant not found for id ${tenantId}\nAvailable:\n${await listTenants()}`);
    return byId;
  }
  const bySlug = await Tenant.findOne({ slug }).setOptions({ bypassTenant: true });
  if (bySlug) return bySlug;
  const byName = await Tenant.findOne({
    name: { $regex: /san\s*clemente\s*woodworking/i },
  }).setOptions({ bypassTenant: true });
  if (byName) return byName;
  throw new Error(
    `Tenant not found for slug "${slug}". Pass --slug <tenant-slug> or --tenantId <id>.\nAvailable:\n${await listTenants() || '(none found)'}`,
  );
}

async function getOrCreateWebsite(tenantId) {
  let doc = await WebsiteContent.findOne({ tenantId }).setOptions({ bypassTenant: true });
  if (doc) return doc;
  doc = new WebsiteContent({ tenantId });
  await doc.save({ validateBeforeSave: true });
  return doc;
}

function alreadyHasFile(project, originalName) {
  const name = String(originalName || '').toLowerCase();
  const photos = Array.isArray(project.photos) ? project.photos : [];
  return photos.some((photo) => String(photo.originalName || '').toLowerCase() === name);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = String(args.dryRun || '').toLowerCase() === 'true';
  const siteRoot = path.resolve(String(args.siteRoot || defaultSiteRoot()));
  const jsonPath = path.join(siteRoot, 'public', 'projects.json');

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required in environment.');
    process.exit(1);
  }
  if (!fs.existsSync(jsonPath)) {
    console.error(`projects.json not found at ${jsonPath}`);
    console.error('Set SCWW_SITE_ROOT or pass --siteRoot /path/to/scww_site');
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const items = Array.isArray(catalog.projects) ? catalog.projects : [];
  if (!items.length) {
    console.error('projects.json has no projects');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  try {
    const tenant = await resolveTenant(args);
    console.log(`Tenant: ${tenant.slug} (${tenant.name}) ${tenant._id}`);
    console.log(`Catalog: ${items.length} projects from ${jsonPath}${dryRun ? ' [dry run]' : ''}`);

    const doc = await getOrCreateWebsite(tenant._id);
    if (!Array.isArray(doc.projects)) doc.projects = [];

    let created = 0;
    let updated = 0;
    let photosAdded = 0;
    let photosSkipped = 0;
    let filesMissing = 0;

    for (const item of items) {
      const slug = String(item.id || '').trim();
      if (!slug) continue;
      let project = doc.projects.find((row) => String(row.slug || '') === slug);
      if (!project) {
        doc.projects.push({
          slug,
          title: String(item.title || slug).slice(0, 160),
          description: String(item.description || '').slice(0, 2000),
          photos: [],
        });
        project = doc.projects[doc.projects.length - 1];
        created += 1;
      } else {
        project.title = String(item.title || project.title || slug).slice(0, 160);
        project.description = String(item.description || project.description || '').slice(0, 2000);
        if (!Array.isArray(project.photos)) project.photos = [];
        if (project.photo && project.photos.length === 0) project.photos.push(project.photo);
        updated += 1;
      }

      const images = Array.isArray(item.images) ? item.images : [];
      for (const imagePath of images) {
        const relative = String(imagePath || '').replace(/^\//, '');
        const originalName = path.basename(relative);
        if (alreadyHasFile(project, originalName)) {
          photosSkipped += 1;
          continue;
        }
        const abs = path.join(siteRoot, 'public', relative);
        if (!fs.existsSync(abs)) {
          console.warn(`Missing file: ${abs}`);
          filesMissing += 1;
          continue;
        }
        if (dryRun) {
          photosAdded += 1;
          continue;
        }
        const asset = await storeWebsiteFileFromDisk(tenant._id, abs, originalName);
        project.photos.push(asset);
        photosAdded += 1;
      }
    }

    const ordered = [];
    const used = new Set();
    for (const item of items) {
      const row = doc.projects.find((project) => String(project.slug || '') === String(item.id || ''));
      if (row) {
        ordered.push(row);
        used.add(String(row._id));
      }
    }
    for (const row of doc.projects) {
      if (!used.has(String(row._id))) ordered.push(row);
    }
    doc.projects = ordered;

    if (!dryRun) {
      await doc.save();
    }

    console.log(
      JSON.stringify(
        {
          dryRun,
          created,
          updated,
          photosAdded,
          photosSkipped,
          filesMissing,
          projectCount: doc.projects.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
