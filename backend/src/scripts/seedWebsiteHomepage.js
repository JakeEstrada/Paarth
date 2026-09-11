/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Tenant = require('../models/Tenant');
const WebsiteContent = require('../models/WebsiteContent');
const { storeWebsiteFileFromDisk } = require('../utils/websiteAssetStore');

/** Same rotation as sites/scww_site/src/components/Hero.jsx */
const HERO_SLIDES = [
  'black-stringer-open.jpg',
  'floating-oak-sunburst.jpg',
  'black-stringer-entry.jpg',
  'floating-oak-glass-rail.jpg',
  'white-rail-herringbone.jpg',
];

/** Mosaic covers from sites/scww_site/src/lib/galleryAlbums.js */
const GALLERY_COVERS = [
  { file: 'white-rail-herringbone.jpg', alt: 'Box treads' },
  { file: 'oak-rail-landing.jpg', alt: 'Horizontal rods' },
  { file: 'black-stringer-entry.jpg', alt: 'Satin black iron' },
  { file: 'floating-oak-glass-rail.jpg', alt: 'Waterfall' },
  { file: 'black-stringer-open.jpg', alt: 'Transitional' },
];

const HOMEPAGE_COPY = {
  heroHeadline: 'Stairs. Done Right.',
  heroSubheadline: 'Custom stairs, railings, and millwork for Southern California homes.',
  heroCtaLabel: 'Contact us',
  heroCtaUrl: 'mailto:office@sanclementewoodworking.com',
  aboutTitle: 'About Us',
  aboutBody:
    'Founded in 1986, San Clemente Woodworking is a family-owned and operated staircase business. We specialize in elegant custom staircases, including wood staircases, curved stairs, and stainless steel. By selectively using our own local milling and purchasing materials directly from manufacturers, we are able to maintain competitive pricing. Our skilled craftsmen are stair experts in bending rails, custom woodturning, and precise duplication of architectural designs. Your beautiful staircase by San Clemente Woodworking will be the envy of the neighborhood.',
  storyTitle: 'Our Story',
  storyBody:
    'We here at San Clemente Woodworking are committed to high quality workmanship in all of our stair building projects, specializing in custom staircases, iron and wood staircases, curved staircases and stainless steel. Today we are one of the largest custom staircase builders in the southern California area, providing our expert stair building services to numerous residents and building contractors throughout Orange County.\n\nAt San Clemente Woodworking, we pride ourselves on excellent and innovative custom staircase design. All of our staircases are created using traditional woodworking techniques, unsurpassed skill in installing and crafting your beautiful stairway. Stairways are available in a variety of woods, styles, components and stains.\n\nWhether renovating an existing staircase or creating a new staircase, San Clemente Woodworking will craft a stair design that is just right for you. You will be the envy of the neighborhood.',
  quoteHeadline: 'Contact Us for a Free Quote!',
};

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
  const slug = String(args.slug || args.tenant || 'default').trim().toLowerCase();
  if (tenantId) {
    const byId = await Tenant.findById(tenantId).setOptions({ bypassTenant: true });
    if (!byId) throw new Error(`Tenant not found for id ${tenantId}\nAvailable:\n${await listTenants()}`);
    return byId;
  }
  const bySlug = await Tenant.findOne({ slug }).setOptions({ bypassTenant: true });
  if (bySlug) return bySlug;
  throw new Error(
    `Tenant not found for slug "${slug}". Pass --slug <tenant-slug> or --tenantId <id>.\nAvailable:\n${await listTenants() || '(none found)'}`,
  );
}

function alreadyHasName(list, originalName) {
  const name = String(originalName || '').toLowerCase();
  return (Array.isArray(list) ? list : []).some(
    (photo) => String(photo.originalName || '').toLowerCase() === name,
  );
}

async function addPhotos(tenantId, list, files, { dryRun, siteRoot, missing, added }) {
  if (!Array.isArray(list)) list = [];
  for (const entry of files) {
    const file = typeof entry === 'string' ? entry : entry.file;
    const alt = typeof entry === 'string' ? '' : entry.alt || '';
    if (alreadyHasName(list, file)) continue;
    const abs = path.join(siteRoot, 'public', 'hero', file);
    if (!fs.existsSync(abs)) {
      console.warn(`Missing file: ${abs}`);
      missing.count += 1;
      continue;
    }
    if (dryRun) {
      added.count += 1;
      continue;
    }
    const asset = await storeWebsiteFileFromDisk(tenantId, abs, file);
    asset.alt = String(alt || '').slice(0, 160);
    list.push(asset);
    added.count += 1;
  }
  return list;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = String(args.dryRun || '').toLowerCase() === 'true';
  const siteRoot = path.resolve(String(args.siteRoot || defaultSiteRoot()));
  const heroDir = path.join(siteRoot, 'public', 'hero');

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required in environment.');
    process.exit(1);
  }
  if (!fs.existsSync(heroDir)) {
    console.error(`Hero folder not found at ${heroDir}`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  try {
    const tenant = await resolveTenant(args);
    console.log(`Tenant: ${tenant.slug} (${tenant.name}) ${tenant._id}${dryRun ? ' [dry run]' : ''}`);

    let doc = await WebsiteContent.findOne({ tenantId: tenant._id }).setOptions({ bypassTenant: true });
    if (!doc) {
      doc = new WebsiteContent({ tenantId: tenant._id });
    }

    let copyFilled = 0;
    for (const [key, value] of Object.entries(HOMEPAGE_COPY)) {
      if (!String(doc[key] || '').trim()) {
        doc[key] = value;
        copyFilled += 1;
      }
    }

    const missing = { count: 0 };
    const heroAdded = { count: 0 };
    const galleryAdded = { count: 0 };
    doc.heroPhotos = await addPhotos(tenant._id, doc.heroPhotos, HERO_SLIDES, {
      dryRun,
      siteRoot,
      missing,
      added: heroAdded,
    });
    doc.gallery = await addPhotos(tenant._id, doc.gallery, GALLERY_COVERS, {
      dryRun,
      siteRoot,
      missing,
      added: galleryAdded,
    });

    if (!dryRun) await doc.save();

    console.log(
      JSON.stringify(
        {
          dryRun,
          copyFilled,
          heroAdded: heroAdded.count,
          heroCount: (doc.heroPhotos || []).length,
          galleryAdded: galleryAdded.count,
          galleryCount: (doc.gallery || []).length,
          filesMissing: missing.count,
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
