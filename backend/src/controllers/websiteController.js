const WebsiteContent = require('../models/WebsiteContent');
const Tenant = require('../models/Tenant');
const { getFileStream, deleteStoredFileBinary } = require('./fileController');
const { getTenantContext } = require('../middleware/tenantContext');

const DEFAULTS = {
  heroHeadline: "Orange County's Skilled Staircase & Railing Experts",
  heroSubheadline: 'Custom staircases, railings, and millwork — family-owned since 1986.',
  heroCtaLabel: 'Contact Us for a Free Quote!',
  heroCtaUrl: 'mailto:office@sanclementewoodworking.com',
  aboutTitle: 'About Us',
  aboutBody:
    'Founded in 1986, San Clemente Woodworking is a family-owned and operated staircase business. We specialize in elegant custom staircases, including wood staircases, curved stairs, and stainless steel. By selectively using our own local milling and purchasing materials directly from manufacturers, we are able to maintain competitive pricing. Our skilled craftsmen are stair experts in bending rails, custom woodturning, and precise duplication of architectural designs. Your beautiful staircase by San Clemente Woodworking will be the envy of the neighborhood.',
  storyTitle: 'Our Story',
  storyBody:
    'We here at San Clemente Woodworking are committed to high quality workmanship in all of our stair building projects, specializing in custom staircases, iron and wood staircases, curved staircases and stainless steel. Today we are one of the largest custom staircase builders in the southern California area, providing our expert stair building services to numerous residents and building contractors throughout Orange County.\n\nAt San Clemente Woodworking, we pride ourselves on excellent and innovative custom staircase design. All of our staircases are created using traditional woodworking techniques, unsurpassed skill in installing and crafting your beautiful stairway. Stairways are available in a variety of woods, styles, components and stains.\n\nWhether renovating an existing staircase or creating a new staircase, San Clemente Woodworking will craft a stair design that is just right for you. You will be the envy of the neighborhood.',
  quoteHeadline: 'Contact Us for a Free Quote!',
};

function clip(value, max) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
}

function tenantIdFromReq(req) {
  return req.user?.tenantId || getTenantContext()?.tenantId || null;
}

function mediaPath(tenantId, assetId) {
  return `/website/public/media/${tenantId}/${assetId}`;
}

function serializeAsset(asset, tenantId) {
  if (!asset) return null;
  const id = String(asset._id || '');
  if (!id) return null;
  return {
    id,
    alt: asset.alt || '',
    originalName: asset.originalName || '',
    url: mediaPath(tenantId, id),
  };
}

function serializeWebsite(doc) {
  const tenantId = String(doc.tenantId);
  return {
    id: String(doc._id),
    heroHeadline: doc.heroHeadline || '',
    heroSubheadline: doc.heroSubheadline || '',
    heroCtaLabel: doc.heroCtaLabel || '',
    heroCtaUrl: doc.heroCtaUrl || '',
    aboutTitle: doc.aboutTitle || '',
    aboutBody: doc.aboutBody || '',
    storyTitle: doc.storyTitle || '',
    storyBody: doc.storyBody || '',
    quoteHeadline: doc.quoteHeadline || '',
    heroPhotos: (doc.heroPhotos || []).map((photo) => serializeAsset(photo, tenantId)).filter(Boolean),
    gallery: (doc.gallery || []).map((photo) => serializeAsset(photo, tenantId)).filter(Boolean),
    projects: (doc.projects || []).map((project) => ({
      id: String(project._id),
      title: project.title || '',
      description: project.description || '',
      photo: serializeAsset(project.photo, tenantId),
    })),
    updatedAt: doc.updatedAt,
  };
}

function assetFromUpload(file, alt = '') {
  const filename = file.filename || (file.key ? String(file.key).split('/').pop() : '');
  const s3Key = file.key || '';
  const storedPath = file.location || file.path || s3Key || filename;
  return {
    originalName: String(file.originalname || '').slice(0, 200),
    filename: String(filename || '').slice(0, 200),
    path: String(storedPath || '').slice(0, 500),
    s3Key: String(s3Key || '').slice(0, 500),
    mimetype: file.mimetype || file.contentType || 'image/jpeg',
    size: Number(file.size) || 0,
    alt: clip(alt, 160),
  };
}

function findAsset(content, assetId) {
  const id = String(assetId || '');
  const hero = (content.heroPhotos || []).find((row) => String(row._id) === id);
  if (hero) return hero;
  const gallery = (content.gallery || []).find((row) => String(row._id) === id);
  if (gallery) return gallery;
  for (const project of content.projects || []) {
    if (project.photo && String(project.photo._id) === id) return project.photo;
  }
  return null;
}

async function getOrCreateWebsite(tenantId) {
  let doc = await WebsiteContent.findOne({ tenantId });
  if (doc) return doc;
  doc = new WebsiteContent({
    tenantId,
    ...DEFAULTS,
  });
  try {
    await doc.save();
    return doc;
  } catch (error) {
    if (error?.code === 11000) {
      return WebsiteContent.findOne({ tenantId });
    }
    throw error;
  }
}

async function getWebsite(req, res) {
  try {
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant is required' });
    const doc = await getOrCreateWebsite(tenantId);
    res.json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load website content' });
  }
}

async function updateWebsite(req, res) {
  try {
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant is required' });
    const doc = await getOrCreateWebsite(tenantId);
    const body = req.body || {};
    doc.heroHeadline = clip(body.heroHeadline, 200);
    doc.heroSubheadline = clip(body.heroSubheadline, 400);
    doc.heroCtaLabel = clip(body.heroCtaLabel, 80);
    doc.heroCtaUrl = clip(body.heroCtaUrl, 400);
    doc.aboutTitle = clip(body.aboutTitle, 120);
    doc.aboutBody = clip(body.aboutBody, 8000);
    doc.storyTitle = clip(body.storyTitle, 120);
    doc.storyBody = clip(body.storyBody, 8000);
    doc.quoteHeadline = clip(body.quoteHeadline, 200);
    await doc.save();
    res.json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to save website content' });
  }
}

async function uploadHeroPhoto(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });
    const tenantId = tenantIdFromReq(req);
    const doc = await getOrCreateWebsite(tenantId);
    if ((doc.heroPhotos || []).length >= 12) {
      return res.status(400).json({ error: 'You can add up to 12 hero photos' });
    }
    doc.heroPhotos.push(assetFromUpload(req.file, req.body?.alt));
    await doc.save();
    res.status(201).json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to upload hero photo' });
  }
}

async function deleteHeroPhoto(req, res) {
  try {
    const tenantId = tenantIdFromReq(req);
    const doc = await getOrCreateWebsite(tenantId);
    const asset = (doc.heroPhotos || []).find((row) => String(row._id) === String(req.params.assetId));
    if (!asset) return res.status(404).json({ error: 'Photo not found' });
    await deleteStoredFileBinary(asset);
    doc.heroPhotos = doc.heroPhotos.filter((row) => String(row._id) !== String(req.params.assetId));
    await doc.save();
    res.json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete hero photo' });
  }
}

async function uploadGalleryPhoto(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });
    const tenantId = tenantIdFromReq(req);
    const doc = await getOrCreateWebsite(tenantId);
    if ((doc.gallery || []).length >= 60) {
      return res.status(400).json({ error: 'You can add up to 60 gallery photos' });
    }
    doc.gallery.push(assetFromUpload(req.file, req.body?.alt));
    await doc.save();
    res.status(201).json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to upload gallery photo' });
  }
}

async function deleteGalleryPhoto(req, res) {
  try {
    const tenantId = tenantIdFromReq(req);
    const doc = await getOrCreateWebsite(tenantId);
    const asset = (doc.gallery || []).find((row) => String(row._id) === String(req.params.assetId));
    if (!asset) return res.status(404).json({ error: 'Photo not found' });
    await deleteStoredFileBinary(asset);
    doc.gallery = doc.gallery.filter((row) => String(row._id) !== String(req.params.assetId));
    await doc.save();
    res.json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete gallery photo' });
  }
}

async function createProject(req, res) {
  try {
    const tenantId = tenantIdFromReq(req);
    const doc = await getOrCreateWebsite(tenantId);
    if ((doc.projects || []).length >= 40) {
      return res.status(400).json({ error: 'You can add up to 40 projects' });
    }
    doc.projects.push({
      title: clip(req.body?.title, 160) || 'New project',
      description: clip(req.body?.description, 2000),
    });
    await doc.save();
    res.status(201).json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to add project' });
  }
}

async function updateProject(req, res) {
  try {
    const tenantId = tenantIdFromReq(req);
    const doc = await getOrCreateWebsite(tenantId);
    const project = (doc.projects || []).id(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (req.body?.title !== undefined) project.title = clip(req.body.title, 160);
    if (req.body?.description !== undefined) project.description = clip(req.body.description, 2000);
    if (req.body?.alt !== undefined && project.photo) project.photo.alt = clip(req.body.alt, 160);
    await doc.save();
    res.json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update project' });
  }
}

async function deleteProject(req, res) {
  try {
    const tenantId = tenantIdFromReq(req);
    const doc = await getOrCreateWebsite(tenantId);
    const project = (doc.projects || []).id(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.photo) await deleteStoredFileBinary(project.photo);
    project.deleteOne();
    await doc.save();
    res.json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete project' });
  }
}

async function uploadProjectPhoto(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });
    const tenantId = tenantIdFromReq(req);
    const doc = await getOrCreateWebsite(tenantId);
    const project = (doc.projects || []).id(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.photo) await deleteStoredFileBinary(project.photo);
    project.photo = assetFromUpload(req.file, req.body?.alt || project.title);
    await doc.save();
    res.json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to upload project photo' });
  }
}

function reorderByIds(items, ids) {
  const list = Array.isArray(items) ? [...items] : [];
  const wanted = (Array.isArray(ids) ? ids : []).map((id) => String(id));
  const byId = new Map(list.map((row) => [String(row._id), row]));
  const next = [];
  for (const id of wanted) {
    const row = byId.get(id);
    if (row) {
      next.push(row);
      byId.delete(id);
    }
  }
  for (const row of list) {
    if (byId.has(String(row._id))) next.push(row);
  }
  return next;
}

async function reorderWebsite(req, res) {
  try {
    const tenantId = tenantIdFromReq(req);
    const doc = await getOrCreateWebsite(tenantId);
    const section = String(req.body?.section || '');
    const ids = req.body?.ids;
    if (section === 'hero') doc.heroPhotos = reorderByIds(doc.heroPhotos, ids);
    else if (section === 'gallery') doc.gallery = reorderByIds(doc.gallery, ids);
    else if (section === 'projects') doc.projects = reorderByIds(doc.projects, ids);
    else return res.status(400).json({ error: 'section must be hero, gallery, or projects' });
    await doc.save();
    res.json(serializeWebsite(doc));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to reorder' });
  }
}

async function getPublicWebsite(req, res) {
  try {
    const slug = String(req.query.slug || req.headers['x-tenant-slug'] || '').trim().toLowerCase();
    const tenantIdQuery = String(req.query.tenantId || '').trim();
    let tenant = null;
    if (tenantIdQuery && /^[a-fA-F0-9]{24}$/.test(tenantIdQuery)) {
      tenant = await Tenant.findById(tenantIdQuery).setOptions({ bypassTenant: true });
    } else if (slug) {
      tenant = await Tenant.findOne({ slug, isActive: { $ne: false } }).setOptions({ bypassTenant: true });
    } else {
      tenant = await Tenant.findOne({ isActive: { $ne: false } }).sort({ createdAt: 1 }).setOptions({ bypassTenant: true });
    }
    if (!tenant) return res.status(404).json({ error: 'Website not found' });
    const doc = await WebsiteContent.findOne({ tenantId: tenant._id }).setOptions({ bypassTenant: true });
    const payload = doc
      ? serializeWebsite(doc)
      : serializeWebsite({
          _id: 'default',
          tenantId: tenant._id,
          ...DEFAULTS,
          heroPhotos: [],
          gallery: [],
          projects: [],
        });
    res.json({
      companyName: tenant.name || 'San Clemente Woodworking',
      ...payload,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load public website' });
  }
}

async function getPublicWebsiteMedia(req, res) {
  try {
    const { tenantId, assetId } = req.params;
    if (!/^[a-fA-F0-9]{24}$/.test(String(tenantId || '')) || !/^[a-fA-F0-9]{24}$/.test(String(assetId || ''))) {
      return res.status(400).json({ error: 'Invalid media id' });
    }
    const doc = await WebsiteContent.findOne({ tenantId }).setOptions({ bypassTenant: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const asset = findAsset(doc, assetId);
    if (!asset) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', asset.mimetype || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const stream = await getFileStream(asset);
    stream.on('error', (error) => {
      if (!res.headersSent) res.status(404).json({ error: 'Media missing' });
      else res.end();
      console.error('Website media stream error:', error?.message || error);
    });
    stream.pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(404).json({ error: error.message || 'Media not found' });
    }
  }
}

module.exports = {
  getWebsite,
  updateWebsite,
  uploadHeroPhoto,
  deleteHeroPhoto,
  uploadGalleryPhoto,
  deleteGalleryPhoto,
  createProject,
  updateProject,
  deleteProject,
  uploadProjectPhoto,
  reorderWebsite,
  getPublicWebsite,
  getPublicWebsiteMedia,
};
