# Documents page — handoff for AI / collaborators

This document describes the **Documents** feature in the Paarth app so another assistant (for example ChatGPT) can help debug, extend, or refactor it without re-reading the whole codebase.

## What the page does

The **Document Explorer** is a tenant-scoped file browser for **standalone documents**: files that are **not** attached to a job or task (`jobId` and `taskId` are null on the `File` model).

Users can:

- Browse a **folder tree** (`DocumentFolder` documents) with expand/collapse.
- Select **Root** or a folder to see **child folders** and **files** in that folder.
- **Upload PDFs only** (max 50 MB in the UI) into the current folder.
- **Create folders** under the current folder.
- **Create plain-text files** by entering a slash-separated **path** (for example `Shop SOPs/Opening/checklist.txt`); the server creates missing folders from the path and stores a `.txt` file on disk.
- **Open/edit/save** text files via a dialog; **rename** the displayed file name (still `.txt`).
- **View PDFs** in a dialog using an `<iframe>` pointed at the download URL.
- **Download** PDFs; edit **description** on any file; **delete** files.
- **Rename** or **recursively delete** folders.
- **Drag a file row** onto a folder (sidebar, breadcrumbs, or folder rows) to **move** it (`PATCH` with `folderId`).

Search only filters the **current folder’s** folders and files (by name / description).

## Where the code lives

| Layer | Path | Role |
|--------|------|------|
| Route | `frontend/src/App.jsx` | `path="/documents"` → `DocumentsPage` inside `MainLayout` + `ProtectedRoute`. |
| Page shell | `frontend/src/pages/DocumentsPage.jsx` | Renders `FileExplorer`. |
| UI + client logic | `frontend/src/components/documents/fileExplorer/FileExplorer.jsx` | Main layout; uses `FolderTree` (react-arborist), `FileTable` (MUI Data Grid), `Toolbar`, and `useDocumentsApi`. |
| Nav label | `frontend/src/components/layout/Sidebar.jsx` | Menu item “Documents” → `/documents`. |
| HTTP routes | `backend/src/routes/files.js` | Mounts under **`/files`** (see server). |
| Server | `backend/src/server.js` | `app.use('/files', fileRoutes)`. |
| Handlers | `backend/src/controllers/fileController.js` | `uploadDocument`, `getDocumentTree`, folder CRUD, text doc CRUD, `updateFile` (move + description), `downloadFile`, `deleteFile`, etc. |
| Folder model | `backend/src/models/DocumentFolder.js` | `name`, `parentId`, `createdBy`, **tenant** plugin; unique index on `(tenantId, parentId, name)`. |
| File model | `backend/src/models/File.js` | Includes `folderId` for placement in the explorer tree. |

## API contract (base: `{VITE_API_URL}/files`)

The frontend uses `import.meta.env.VITE_API_URL || 'http://localhost:4000'` and the global **`axios`** instance. `frontend/src/main.jsx` imports `frontend/src/utils/configureAxios.js`, which attaches **`Authorization: Bearer <accessToken>`** and **`x-tenant-id`** (when `tenantId` in `localStorage` is a 24-char hex string) to requests unless already set.

| Method | Path | Used for |
|--------|------|----------|
| `GET` | `/documents/tree` | Initial load: `{ folders, files }`. |
| `POST` | `/documents/folders` | Body: `{ name, parentId }` (`parentId` null = root). |
| `PATCH` | `/documents/folders/:id` | Body: `{ name }` (and optionally `parentId` on server — UI only sends rename). |
| `DELETE` | `/documents/folders/:id?recursive=true` | Recursive delete (UI always uses `recursive=true`). |
| `POST` | `/documents/text` | Body: `{ path, content }` — path creates folder chain + `.txt` file. |
| `GET` | `/documents/text/:id` | Returns `{ content, ... }` for text editor. |
| `PUT` | `/documents/text/:id` | Body: `{ content, originalName }`. |
| `POST` | `/upload-document` | `multipart/form-data`: field `file` (PDF), `fileType` (`other`), optional `folderId`. |
| `PATCH` | `/:id` | Update `description` and/or **`folderId`** (move to folder or `null` for root). |
| `DELETE` | `/:id` | Delete file record + storage. |
| `GET` | `/:id/download` | Stream file (PDF iframe, download blob, etc.). |

Note: `backend/src/routes/files.js` has **`requireAuth` commented out** on the router; if production relies on another middleware layer, document that when debugging 401/403 issues.

## Data shapes the UI expects

- **Folders**: Mongo documents with `_id`, `name`, `parentId` (null or ObjectId string), `createdAt`, etc.
- **Files** (standalone): `_id`, `originalName`, `filename`, `mimetype` (`application/pdf` or `text/plain`), `size`, `createdAt`, `folderId` (null = root), optional `description`.

Client builds:

- `childFoldersByParent`: map from `parentId` string or synthetic **`ROOT_KEY`** (`'root'`) for root-level folders.
- `currentFolderFiles`: `documents` where `folderId` matches `selectedFolderId` (both normalized with `asId()`).

## Backend behavior worth knowing

- **Standalone files** are selected with `File.find({ jobId: null, taskId: null })` in the tree endpoint.
- **PDF upload** (`uploadDocument`): rejects non-PDF; associates optional `folderId` with a `DocumentFolder` if provided.
- **Text files**: content is written under a server directory (see `DOCUMENT_TEXT_DIR` in `fileController.js`); DB row uses `mimetype: 'text/plain'`.
- **Folder path** for new text files: `resolveFolderPath` walks/creates `DocumentFolder` segments from the path string.
- **Tenant**: `DocumentFolder` uses `tenantScopePlugin`; queries are scoped like other tenant models—keep tenant header consistent with the rest of the app.

## Common extension / bug areas

1. **Non-PDF uploads** — UI and `uploadDocument` are PDF-only; changing type requires both sides + validation + icons.
2. **Text files on S3** — `getTextDocument` / `updateTextDocument` use local path helpers; remote storage may need different handling than job attachments.
3. **Auth on `/files`** — confirm how `req.user` / `resolveCreatedBy` behave if routes are fully public vs behind gateway.
4. **Move vs copy** — UI only implements move via `PATCH` `folderId`.
5. **PDF viewer iframe** — uses same-origin download URL; CORS/cookies can affect embedding if API host differs from the SPA host.

## Copy-paste prompt for another assistant

You can paste the block below into ChatGPT (or similar) together with this file:

> I’m working on a React (Vite) + MUI app with an Express/Mongoose backend. The Documents page is at route `/documents`. The page component is `frontend/src/pages/DocumentsPage.jsx` and the main UI is `frontend/src/components/documents/fileExplorer/FileExplorer.jsx`. It loads `GET {API}/files/documents/tree` and uses the endpoints listed in `documentpage.md` in the repo root. Standalone files are `File` documents with `jobId` and `taskId` null; folders are `DocumentFolder`. Help me with: **[describe your goal or error here]** — reference the paths and APIs in `documentpage.md`.

---

*Generated for the Paarth codebase; update this file if routes or behavior change.*
