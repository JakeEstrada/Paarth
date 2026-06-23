/**
 * DocumentsPage — File explorer (folders, uploads, job/customer links).
 * Route: /documents
 * APIs: /files/*
 * Docs: ../../../docs/PAGES.md#documentspagetsx
 */
import FileExplorer from '../components/documents/fileExplorer/FileExplorer';

function DocumentsPage() {
  return (
    <FileExplorer />
  );
}

export default DocumentsPage;
