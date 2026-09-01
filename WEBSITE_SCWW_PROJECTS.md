# SCWW marketing site — projects (Paarth)

Handoff from `sites/scww_site`. Do **not** add a second Mongo or Socket.io. This backend is the only store. The public Vite site only `GET`s.

Paarth already has a Website CMS. Do not start over. Extend it so projects match the live marketing catalog.

---

## What already exists (use it)

| Piece | Where |
|--------|--------|
| Model | `backend/src/models/WebsiteContent.js` |
| Staff + public API | `backend/src/routes/website.js` + `controllers/websiteController.js` |
| Uploads → S3 / `uploads/website/<tenantId>/` | `middleware/uploadWebsiteImage.js` |
| Staff UI | `frontend/src/pages/WebsitePage.tsx` at `/website` (super admin) |
| Public read | `GET /website/public?slug=<tenantSlug>` (no JWT) |
| Public photo | `GET /website/public/media/:tenantId/:assetId` |
| CORS | `localhost:5173` already allowed in `server.js` |

Staff save in Paarth. Visitors hit the public GET. That is the whole loop.

---

## Gap vs the marketing site

The catalog at `sanclementewoodworking` / `scww_site` `/projects` is:

- Numbered list: display number = **array index + 1** (never stored)
- Each job: `title`, `description`, **`images[]`** (many photos)
- Cover = `images[0]`; **View more** opens a lightbox of the rest

Paarth today stores **one** `project.photo`. That cannot drive the real page. Change it to **`photos[]`** (same `assetSchema` as hero/gallery).

Keep `title` and `description`. First photo in the array is the cover.

---

## Transferable data (ready now)

All of this is on disk in the sibling repo:

**Repo:** `/home/jake/Desktop/Liminal Innovations & Technologies/sites/scww_site`

| What | Path |
|------|------|
| Titles, descriptions, order, image paths | `public/projects.json` |
| Photo files | `public/projects/<project-id>/` |

Shape of each item in `projects.json`:

```json
{
  "id": "01-floating-box-treads-w-horizontal-rails",
  "title": "Floating Box Treads w/ Horizontal Rails",
  "description": "Rail system: Custom || White oak box treads",
  "images": [
    "/projects/01-floating-box-treads-w-horizontal-rails/1788196622755-Robco7.png"
  ]
}
```

`description` uses ` || ` as spec separators (post / rail / balustrade). Keep that string as-is; the public page splits it.

**Inventory (as of this handoff):** 24 projects, ~30 image refs in JSON, ~36 files on disk (~96 MB). Several jobs have 5 shots; many still have `images: []` (title/description only). Some files are **8–10 MB**. Current multer cap is **10 MB** (`uploadWebsiteImage.js`) — bump to **15 MB** before seeding or those JPGs will fail.

Do **not** scrape Squarespace. Do **not** invent new copy. Seed from this JSON + folders.

Keep the string `id` from JSON as `slug` (or `externalId`) on the project subdocument so re-seeds do not duplicate. Display number is still list order after `PATCH /website/order`.

---

## v1 work (projects only)

1. **Model** — `projectSchema.photos: [assetSchema]` (replace or migrate `photo`). If `photo` exists on old docs, treat it as `photos[0]`.
2. **Serialize** — public + staff JSON:

```js
{
  id,           // Mongo subdoc id
  slug,         // from scww_site id, optional
  title,
  description,
  photos: [{ id, url, alt, originalName }]  // url = /website/public/media/:tenantId/:assetId
}
```

3. **Uploads** — `POST /website/projects/:projectId/photos` (plural, `multiple`). Do not delete existing shots. `DELETE` one photo by asset id. Reorder photos on a project (ids array) or reuse `PATCH /website/order` with `section: 'projectPhotos', projectId`.
4. **Staff UI** — Website → Projects tab: list in order (1, 2, 3…), title, description, drop/add many photos, drag to reorder jobs and shots, Save. Match the local manager at `http://127.0.0.1:5178` in behavior, MUI in look. Numbers = list position.
5. **Seed script** — `backend/src/scripts/seedWebsiteProjects.js`:
   - Resolve tenant (slug `scww` or the San Clemente Woodworking tenant — do not guess; print tenants if missing).
   - Read `../sites/scww_site/public/projects.json` (or `SCWW_SITE_ROOT`).
   - For each project, upsert by `slug`. Copy each file from `public/projects/...` into the website upload pipeline (S3 key `website/<tenantId>/...` or local `uploads/website/<tenantId>/`).
   - Skip missing files. Do not wipe hero/story fields.
   - Idempotent: running twice does not duplicate projects.
6. **Public GET** — already `GET /website/public?slug=...`. After serialize change, `projects[].photos` must be a list. Add `Cache-Control: public, max-age=60` on that GET if not present.
7. **CORS** — `localhost:5173` is already listed. Production: add the marketing origin.

Do not build a second public Express app. Do not sync into another database.

---

## What the marketing site will do (this repo, after Paarth)

`scww_site` will:

```
GET {VITE_API_URL}/website/public?slug={VITE_TENANT_SLUG}
```

Map `photos[].url` (prefix `VITE_API_URL` if relative) → `images[]`. Fallback: current `public/projects.json` if the API is down.

Until Paarth ships `photos[]` + seed, the public page keeps using local JSON. Do not block the brochure on Paarth.

---

## Later (do not do in v1)

WebsiteContent already has hero headline/sub/CTA, hero photos, about, story, gallery. After projects work:

- Public GET already returns them.
- Marketing site swaps hardcoded `Hero.jsx` / `Story.jsx` / mosaic tiles to that payload.
- Footer, reviews, traffic can follow.

One document per tenant. Add fields later; do not split collections per page.

---

## Out of scope

- Socket.io / change streams for the brochure
- A Mongo just for `scww_site`
- Copying the Vite marketing app into Paarth
- WordPress or a second login
- Compressing images in v1 (note: 10 MB originals will feel slow on `/projects`; a later image-size pass is the real speed work)

---

## Done when

- Super admin opens Paarth `/website` → Projects and sees the seeded catalog (titles + photos).
- Reorder + extra photo + save.
- `GET /website/public?slug=<scww-tenant>` returns `projects[]` with `photos[].url` that load in a browser with no cookie.
- Marketing `/projects` can switch to that GET without changing the 2-up card layout (cover + View more lightbox).
