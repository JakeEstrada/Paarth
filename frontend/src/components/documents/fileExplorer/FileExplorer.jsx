import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Menu,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import NavigateNext from '@mui/icons-material/NavigateNext';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { buildArboristFolderData } from './buildFolderTree';
import { API_URL, FILE_DRAG_MIME, ROOT_TREE_ID } from './constants';
import { useDocumentsApi } from './useDocumentsApi';
import FolderTree from './FolderTree';
import FileTable, { formatBytes, typeLabel } from './FileTable';
import Toolbar from './Toolbar';

function parentFolderKey(folder) {
  if (!folder?.parentId) return null;
  const p = folder.parentId;
  return typeof p === 'object' && p?._id ? String(p._id) : String(p);
}

function fileFolderKey(file) {
  if (!file?.folderId) return null;
  const v = file.folderId;
  return typeof v === 'object' && v?._id ? String(v._id) : String(v);
}

export default function FileExplorer() {
  const treeWrapRef = useRef(null);
  const fileInputRef = useRef(null);
  const [treeHeight, setTreeHeight] = useState(420);

  const {
    folders,
    files,
    loading,
    refresh,
    createFolder,
    renameFolder,
    moveFile,
    renameFile,
  } = useDocumentsApi();

  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [gridSelection, setGridSelection] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dropCrumbId, setDropCrumbId] = useState(null);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState([]);
  const [menuState, setMenuState] = useState(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setGridSelection([]);
  }, [selectedFolderId]);

  useLayoutEffect(() => {
    const el = treeWrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      if (h > 120) setTreeHeight(Math.floor(h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedFolderId) return;
    if (!folders.some((f) => String(f._id) === String(selectedFolderId))) {
      setSelectedFolderId(null);
    }
  }, [folders, selectedFolderId]);

  const folderById = useMemo(() => {
    const m = new Map();
    folders.forEach((f) => m.set(String(f._id), f));
    return m;
  }, [folders]);

  const breadcrumbs = useMemo(() => {
    const items = [{ id: null, name: 'Root' }];
    if (!selectedFolderId) return items;
    const chain = [];
    let cur = folderById.get(String(selectedFolderId));
    while (cur) {
      chain.push(cur);
      const pk = parentFolderKey(cur);
      cur = pk ? folderById.get(String(pk)) : null;
    }
    chain.reverse().forEach((f) => items.push({ id: String(f._id), name: f.name || 'Folder' }));
    return items;
  }, [selectedFolderId, folderById]);

  const treeData = useMemo(() => buildArboristFolderData(folders), [folders]);

  const gridRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const inFolder = (folder) => (parentFolderKey(folder) || null) === (selectedFolderId || null);
    const inFile = (file) => (fileFolderKey(file) || null) === (selectedFolderId || null);

    const folderRows = folders
      .filter(inFolder)
      .map((f) => ({
        id: `folder-${f._id}`,
        kind: 'folder',
        entityId: String(f._id),
        name: f.name || 'Untitled',
        typeLabel: 'Folder',
        sizeLabel: '—',
        modified: new Date(f.updatedAt || f.createdAt || 0),
        modifiedLabel: f.updatedAt || f.createdAt ? format(new Date(f.updatedAt || f.createdAt), 'MMM d, yyyy HH:mm') : '—',
      }));

    const fileRows = files
      .filter(inFile)
      .map((f) => ({
        id: `file-${f._id}`,
        kind: 'file',
        entityId: String(f._id),
        name: f.originalName || f.filename || 'File',
        typeLabel: typeLabel({ kind: 'file', mimetype: f.mimetype }),
        sizeLabel: formatBytes(f.size),
        mimetype: f.mimetype,
        modified: new Date(f.updatedAt || f.createdAt || 0),
        modifiedLabel: f.updatedAt || f.createdAt ? format(new Date(f.updatedAt || f.createdAt), 'MMM d, yyyy HH:mm') : '—',
      }));

    const rows = [...folderRows, ...fileRows];
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.typeLabel && r.typeLabel.toLowerCase().includes(q)));
  }, [folders, files, selectedFolderId, searchTerm]);

  const selectedRows = useMemo(
    () => gridRows.filter((r) => gridSelection.includes(r.id)),
    [gridRows, gridSelection]
  );

  const handleOpenFile = useCallback((row) => {
    if (row.kind !== 'file') return;
    window.open(`${API_URL}/files/${row.entityId}`, '_blank', 'noopener,noreferrer');
  }, []);

  const handleOpenRow = useCallback((row) => {
    if (row.kind === 'folder') {
      setSelectedFolderId(row.entityId);
      return;
    }
    handleOpenFile(row);
  }, [handleOpenFile]);

  const handleDownloadFile = useCallback(async (row) => {
    try {
      const response = await axios.get(`${API_URL}/files/${row.entityId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', row.name || 'download');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  }, []);

  const handleFileDroppedOnFolder = useCallback(
    async (fileId, targetFolderId) => {
      const file = files.find((f) => String(f._id) === String(fileId));
      if (!file) return;
      const current = fileFolderKey(file) || null;
      const next = targetFolderId || null;
      if (current === next) return;
      try {
        await moveFile(fileId, next);
      } catch (error) {
        toast.error(error.response?.data?.error || 'Move failed');
      }
    },
    [files, moveFile]
  );

  const handleUploadFiles = useCallback(
    async (fileList) => {
      if (!fileList?.length) return;
      setUploading(true);
      try {
        for (const file of fileList) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('fileType', 'other');
          if (selectedFolderId) formData.append('folderId', selectedFolderId);
          await axios.post(`${API_URL}/files/upload-document`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
        toast.success('Upload complete');
        await refresh();
      } catch (error) {
        toast.error(error.response?.data?.error || 'Upload failed');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [selectedFolderId, refresh]
  );

  const openRename = useCallback(() => {
    if (selectedRows.length !== 1) return;
    const row = selectedRows[0];
    setRenameTarget(row);
    setRenameValue(row.name || '');
    setRenameOpen(true);
  }, [selectedRows]);

  const openRenameForRow = useCallback((row) => {
    if (!row) return;
    setRenameTarget(row);
    setRenameValue(row.name || '');
    setRenameOpen(true);
  }, []);

  const submitRename = useCallback(async () => {
    const name = renameValue.trim();
    if (!renameTarget || !name) return;
    try {
      if (renameTarget.kind === 'folder') {
        await renameFolder(renameTarget.entityId, name);
      } else {
        await renameFile(renameTarget.entityId, name);
      }
      setRenameOpen(false);
      setRenameTarget(null);
      setRenameValue('');
      setGridSelection([]);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Rename failed');
    }
  }, [renameTarget, renameValue, renameFolder, renameFile]);

  const openDelete = useCallback(() => {
    if (!selectedRows.length) return;
    setDeleteTargets(selectedRows);
    setDeleteOpen(true);
  }, [selectedRows]);

  const openDeleteForRows = useCallback((rows) => {
    if (!rows?.length) return;
    setDeleteTargets(rows);
    setDeleteOpen(true);
  }, []);

  const submitDelete = useCallback(async () => {
    try {
      for (const row of deleteTargets) {
        if (row.kind === 'folder') {
          await axios.delete(`${API_URL}/files/documents/folders/${row.entityId}?recursive=true`);
        } else {
          await axios.delete(`${API_URL}/files/${row.entityId}`);
        }
      }
      toast.success('Deleted');
      setDeleteOpen(false);
      setDeleteTargets([]);
      setGridSelection([]);
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Delete failed');
    }
  }, [deleteTargets, refresh]);

  const submitNewFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder(name, selectedFolderId);
      setNewFolderOpen(false);
      setNewFolderName('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not create folder');
    }
  }, [newFolderName, selectedFolderId, createFolder]);

  const openContextMenu = useCallback((event, row = null) => {
    event.preventDefault();
    if (row) {
      setGridSelection([row.id]);
    }
    setMenuState({
      mouseX: event.clientX + 2,
      mouseY: event.clientY - 6,
      row,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setMenuState(null);
  }, []);

  const menuRow = menuState?.row || (selectedRows.length === 1 ? selectedRows[0] : null);

  if (loading && !folders.length && !files.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, flex: 1 }}
      onContextMenu={(e) => openContextMenu(e, null)}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        accept="*/*"
        onChange={(e) => {
          const list = e.target.files;
          if (list?.length) handleUploadFiles([...list]);
        }}
      />

      <Toolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onUploadClick={() => fileInputRef.current?.click()}
        onNewFolder={() => setNewFolderOpen(true)}
        onRename={openRename}
        onDelete={openDelete}
        onRefresh={refresh}
        uploading={uploading}
        renameDisabled={selectedRows.length !== 1}
        deleteDisabled={selectedRows.length === 0}
      />

      <Breadcrumbs separator={<NavigateNext fontSize="small" />} sx={{ flexWrap: 'wrap' }}>
        {breadcrumbs.map((c) => {
          const crumbDropId = c.id == null ? ROOT_TREE_ID : String(c.id);
          return (
            <Link
              key={c.id ?? 'root'}
              component="button"
              type="button"
              underline="hover"
              color="inherit"
              onClick={() => setSelectedFolderId(c.id)}
              onDragOver={(e) => {
                if (![...e.dataTransfer.types].includes(FILE_DRAG_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDragEnter={(e) => {
                if (![...e.dataTransfer.types].includes(FILE_DRAG_MIME)) return;
                e.preventDefault();
                setDropCrumbId(crumbDropId);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setDropCrumbId((cur) => (cur === crumbDropId ? null : cur));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fileId = e.dataTransfer.getData(FILE_DRAG_MIME);
                setDropCrumbId(null);
                handleFileDroppedOnFolder(fileId, c.id);
              }}
              sx={{
                cursor: 'pointer',
                border: dropCrumbId === crumbDropId ? '1px dashed' : 'none',
                borderColor: 'primary.main',
                borderRadius: 1,
                px: 0.5,
                textAlign: 'left',
                font: 'inherit',
              }}
            >
              {c.name}
            </Link>
          );
        })}
      </Breadcrumbs>

      <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 480, alignItems: 'stretch' }}>
        <Paper
          variant="outlined"
          sx={{
            width: { xs: '100%', md: 300 },
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            p: 1,
          }}
        >
          <Typography variant="subtitle2" color="text.secondary" sx={{ px: 0.5, pb: 1 }}>
            Folders
          </Typography>
          <Box ref={treeWrapRef} sx={{ flex: 1, minHeight: 200 }}>
            <FolderTree
              treeData={treeData}
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
              onFileDroppedOnFolder={handleFileDroppedOnFolder}
              width={268}
              height={treeHeight}
            />
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ px: 2, pt: 2, pb: 1 }}>
            Contents
          </Typography>
          <Box sx={{ flex: 1, minHeight: 0, px: 1, pb: 1 }}>
            <FileTable
              rows={gridRows}
              loading={loading}
              selectionModel={gridSelection}
              onSelectionModelChange={setGridSelection}
              onOpenRow={handleOpenRow}
              onDownloadFile={handleDownloadFile}
              onContextMenuRow={openContextMenu}
              onDropFileOnFolderRow={handleFileDroppedOnFolder}
            />
          </Box>
        </Paper>
      </Box>

      <Dialog open={newFolderOpen} onClose={() => setNewFolderOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitNewFolder}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Rename</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Name" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitRename}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Permanently remove the following? Folders delete recursively with all contents.
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {deleteTargets.map((t) => (
              <li key={t.id}>
                <Typography variant="body2">
                  {t.name} ({t.kind === 'folder' ? 'folder' : 'file'})
                </Typography>
              </li>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={submitDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        open={Boolean(menuState)}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          menuState ? { top: menuState.mouseY, left: menuState.mouseX } : undefined
        }
      >
        {menuRow ? (
          <MenuItem
            onClick={() => {
              if (menuRow.kind === 'folder') {
                setSelectedFolderId(menuRow.entityId);
              } else {
                handleOpenFile(menuRow);
              }
              closeContextMenu();
            }}
          >
            Open
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={() => {
            setNewFolderOpen(true);
            closeContextMenu();
          }}
        >
          New folder
        </MenuItem>
        {menuRow?.kind === 'file' ? (
          <MenuItem
            onClick={() => {
              handleDownloadFile(menuRow);
              closeContextMenu();
            }}
          >
            Download
          </MenuItem>
        ) : null}
        {menuRow ? (
          <MenuItem
            onClick={() => {
              openRenameForRow(menuRow);
              closeContextMenu();
            }}
          >
            Edit / Rename
          </MenuItem>
        ) : null}
        {menuRow ? (
          <MenuItem
            onClick={() => {
              openDeleteForRows([menuRow]);
              closeContextMenu();
            }}
          >
            Delete
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={() => {
            fileInputRef.current?.click();
            closeContextMenu();
          }}
        >
          Upload here
        </MenuItem>
        <MenuItem
          onClick={() => {
            refresh();
            closeContextMenu();
          }}
        >
          Refresh
        </MenuItem>
      </Menu>
    </Box>
  );
}
