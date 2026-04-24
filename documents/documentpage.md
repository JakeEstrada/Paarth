# Documents page — handoff for AI / collaborators

This document reflects the **current** Documents feature used by `/documents`.

## What the page does

The Documents explorer is a tenant-scoped library rooted in:
- `frontend/src/pages/DocumentsPage.jsx` (page shell)
- `frontend/src/components/documents/fileExplorer/FileExplorer.jsx` (main UI)

Primary behavior:
- browse hierarchical folders (`DocumentFolder`)
- browse and manage library files (`File`) that are not tied to job/task in normal use
- create folder trees and text files from slash paths
- edit text files, rename library files, move files across folders
- preview/download files
- recursive folder delete

## Current upload/file-type support

The backend now accepts more than PDFs for document uploads.

Allowed mime types in `uploadDocument`:
- `application/pdf`
- `text/plain`
- `image/png`, `image/jpeg`, `image/webp`, `image/gif`
- `application/msword`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `application/vnd.ms-excel`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

This is enforced in:
- `backend/src/controllers/fileController.js` via `ALLOWED_DOCUMENT_MIME_TYPES`

## Routes and API surface (base `{VITE_API_URL}/files`)

Route registration:
- backend router: `backend/src/routes/files.js`
- mounted in server at `/files`

Endpoints used by document explorer:
- `GET /documents/tree` -> returns `{ folders, files }`
- `POST /documents/folders` -> create folder `{ name, parentId }`
- `PATCH /documents/folders/:id` -> rename/move folder `{ name?, parentId? }`
- `DELETE /documents/folders/:id` (+ `recursive=true`) -> delete folder tree
- `POST /documents/text` -> create `.txt` file from `{ path, content, description? }`
- `GET /documents/text/:id` -> load text file content
- `PUT /documents/text/:id` -> save text content / rename text file
- `POST /upload-document` -> multipart upload (`file`, optional `folderId`, `fileType`, `description`)
- `PATCH /:id` -> update file metadata (`description`, `folderId`, and `originalName` for standalone files)
- `DELETE /:id` -> delete file + stored binary
- `GET /:id/download` -> attachment download stream
- `GET /:id` -> inline content stream

Auth note:
- `requireAuth` is currently commented out in `backend/src/routes/files.js`
- if requests are expected to be protected, confirm enforcement at a higher layer

## Data models and scoping

Folder model:
- `backend/src/models/DocumentFolder.js`
- fields: `name`, `parentId`, `createdBy`
- tenant-scoped with unique `(tenantId, parentId, name)`

File model:
- `backend/src/models/File.js`
- document-library placement uses `folderId`
- storage can be local FS path or S3 key/path (`s3Key`)

## Backend behavior that impacts UI

1) Tree bootstrap and auto-library generation
- `getDocumentTree` calls `ensureCustomerDocumentLibrary(createdBy)` before returning tree data.
- This can auto-create customer-centric folders and generated text summary docs (estimate/contract/invoices/takeoff) from existing app data.

2) Tree file query
- tree currently includes files matching:
  - `{ jobId: null, taskId: null }`
  - **or** `{ folderId: { $ne: null } }`
- meaning files with a folder assignment may appear even if not purely standalone, depending on data state.

3) Storage backend support
- download/get/delete logic supports both local filesystem and S3-backed files.
- text editing currently reads/writes through local-path helpers; verify behavior if plain-text docs are stored remotely.

4) Rename behavior
- `PATCH /files/:id` supports `originalName` rename only for standalone library files.
- text files are normalized to `.txt`.

## Quick debug checklist

For Documents page issues:
1. Check `GET /files/documents/tree` response for folder/file shape consistency.
2. Verify `folderId` normalization between UI and API payloads.
3. Confirm upload mime type against `ALLOWED_DOCUMENT_MIME_TYPES`.
4. For missing text content, verify local/S3 storage resolution paths.
5. If unauthorized behavior is odd, confirm where auth is enforced since router-level `requireAuth` is disabled.

---

Use this as the current reference for `/documents` behavior and APIs.
