import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
  IconButton,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Breadcrumbs,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Search as SearchIcon,
  AttachFile as AttachFileIcon,
  Description as DescriptionIcon,
  Close as CloseIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  NavigateNext as NavigateNextIcon,
  Home as HomeIcon,
  DriveFileRenameOutline as RenameIcon,
  CreateNewFolder as CreateNewFolderIcon,
  NoteAdd as NoteAddIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const ROOT_KEY = 'root';

const asId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value._id || null;
};

function DocumentExplorer() {
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [draggingDocId, setDraggingDocId] = useState(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [editDescriptionOpen, setEditDescriptionOpen] = useState(false);
  const [documentToEdit, setDocumentToEdit] = useState(null);
  const [descriptionInput, setDescriptionInput] = useState('');

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [creatingFile, setCreatingFile] = useState(false);
  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [editingTextDoc, setEditingTextDoc] = useState(null);
  const [textContent, setTextContent] = useState('');
  const [textFileName, setTextFileName] = useState('');
  const [savingTextDoc, setSavingTextDoc] = useState(false);
  const [renameFolderOpen, setRenameFolderOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);

  useEffect(() => {
    fetchTree();
  }, []);

  const fetchTree = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/files/documents/tree`);
      setFolders(response.data?.folders || []);
      setDocuments(response.data?.files || []);
    } catch (error) {
      console.error('Error fetching document tree:', error);
      toast.error(error.response?.data?.error || 'Failed to load documents');
      setFolders([]);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const folderById = useMemo(() => {
    const map = new Map();
    folders.forEach((f) => map.set(String(f._id), f));
    return map;
  }, [folders]);

  const childFoldersByParent = useMemo(() => {
    const map = new Map();
    folders.forEach((f) => {
      const key = asId(f.parentId) || ROOT_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    });
    for (const [, arr] of map.entries()) {
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return map;
  }, [folders]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [{ _id: null, name: 'Root' }];
    let cursor = selectedFolderId ? folderById.get(String(selectedFolderId)) : null;
    const chain = [];
    while (cursor) {
      chain.push(cursor);
      const parentId = asId(cursor.parentId);
      cursor = parentId ? folderById.get(String(parentId)) : null;
    }
    chain.reverse().forEach((c) => crumbs.push(c));
    return crumbs;
  }, [selectedFolderId, folderById]);

  const currentFolderChildren = useMemo(() => {
    const key = selectedFolderId || ROOT_KEY;
    return childFoldersByParent.get(key) || [];
  }, [childFoldersByParent, selectedFolderId]);

  const currentFolderFiles = useMemo(
    () =>
      documents
        .filter((d) => (asId(d.folderId) || null) === selectedFolderId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [documents, selectedFolderId]
  );

  const filteredFolders = useMemo(() => {
    if (!searchTerm.trim()) return currentFolderChildren;
    const s = searchTerm.trim().toLowerCase();
    return currentFolderChildren.filter((f) => f.name?.toLowerCase().includes(s));
  }, [currentFolderChildren, searchTerm]);

  const filteredFiles = useMemo(() => {
    if (!searchTerm.trim()) return currentFolderFiles;
    const s = searchTerm.trim().toLowerCase();
    return currentFolderFiles.filter(
      (d) =>
        d.originalName?.toLowerCase().includes(s) ||
        d.filename?.toLowerCase().includes(s) ||
        d.description?.toLowerCase().includes(s)
    );
  }, [currentFolderFiles, searchTerm]);

  const toggleExpand = (folderId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await axios.post(`${API_URL}/files/documents/folders`, {
        name,
        parentId: selectedFolderId,
      });
      toast.success('Folder created');
      setNewFolderName('');
      setNewFolderOpen(false);
      await fetchTree();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create folder');
    }
  };

  const handleRenameFolder = async () => {
    const name = renameFolderName.trim();
    if (!folderToRename || !name) return;
    try {
      await axios.patch(`${API_URL}/files/documents/folders/${folderToRename._id}`, { name });
      toast.success('Folder renamed');
      setRenameFolderOpen(false);
      setFolderToRename(null);
      setRenameFolderName('');
      await fetchTree();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to rename folder');
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      await axios.delete(`${API_URL}/files/documents/folders/${folderToDelete._id}?recursive=true`);
      toast.success('Folder deleted');
      if (selectedFolderId === String(folderToDelete._id)) setSelectedFolderId(null);
      setDeleteFolderOpen(false);
      setFolderToDelete(null);
      await fetchTree();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete folder');
    }
  };

  const composePathPrefix = () => {
    if (breadcrumbs.length <= 1) return '';
    return `${breadcrumbs.slice(1).map((c) => c.name).join('/')}/`;
  };

  const openNewFileDialog = () => {
    setNewFilePath(`${composePathPrefix()}new-document.txt`);
    setNewFileContent('');
    setNewFileOpen(true);
  };

  const handleCreateTextFile = async () => {
    const filePath = newFilePath.trim();
    if (!filePath) return toast.error('File path is required');
    try {
      setCreatingFile(true);
      await axios.post(`${API_URL}/files/documents/text`, {
        path: filePath,
        content: newFileContent,
      });
      toast.success('File created');
      setNewFileOpen(false);
      setNewFilePath('');
      setNewFileContent('');
      await fetchTree();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create file');
    } finally {
      setCreatingFile(false);
    }
  };

  const handleOpenTextFile = async (doc) => {
    try {
      const response = await axios.get(`${API_URL}/files/documents/text/${doc._id}`);
      setEditingTextDoc(doc);
      setTextFileName(doc.originalName || 'document.txt');
      setTextContent(response.data?.content || '');
      setTextEditorOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to open file');
    }
  };

  const handleSaveTextFile = async () => {
    if (!editingTextDoc) return;
    const nextName = textFileName.trim();
    if (!nextName) return toast.error('File name cannot be empty');
    try {
      setSavingTextDoc(true);
      await axios.put(`${API_URL}/files/documents/text/${editingTextDoc._id}`, {
        content: textContent,
        originalName: nextName,
      });
      toast.success('File saved');
      setTextEditorOpen(false);
      setEditingTextDoc(null);
      await fetchTree();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save file');
    } finally {
      setSavingTextDoc(false);
    }
  };

  const handleFileUpload = async (file, resetInput = null) => {
    if (!file) return;
    if (file.type !== 'application/pdf') return toast.error('Only PDF files are allowed');
    if (file.size > 50 * 1024 * 1024) return toast.error('File size must be less than 50MB');
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', 'other');
      if (selectedFolderId) formData.append('folderId', selectedFolderId);
      await axios.post(`${API_URL}/files/upload-document`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Document uploaded successfully');
      await fetchTree();
      if (resetInput) resetInput.value = '';
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = (doc) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteFileConfirm = async () => {
    if (!documentToDelete) return;
    try {
      await axios.delete(`${API_URL}/files/${documentToDelete._id}`);
      toast.success('Document deleted successfully');
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
      await fetchTree();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete document');
    }
  };

  const handleDownload = async (doc) => {
    try {
      const response = await axios.get(`${API_URL}/files/${doc._id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.originalName || 'document.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (_) {
      toast.error('Failed to download document');
    }
  };

  const handleSaveDescription = async () => {
    if (!documentToEdit) return;
    try {
      await axios.patch(`${API_URL}/files/${documentToEdit._id}`, { description: descriptionInput });
      toast.success('Description updated');
      setEditDescriptionOpen(false);
      setDocumentToEdit(null);
      setDescriptionInput('');
      await fetchTree();
    } catch (_) {
      toast.error('Failed to update description');
    }
  };

  const moveDocumentToFolder = async (docId, targetFolderId) => {
    const doc = documents.find((d) => String(d._id) === String(docId));
    if (!doc) return;
    const currentFolder = asId(doc.folderId) || null;
    const nextFolder = targetFolderId || null;
    if (currentFolder === nextFolder) return;
    try {
      await axios.patch(`${API_URL}/files/${docId}`, { folderId: nextFolder });
      toast.success('Document moved');
      await fetchTree();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to move document');
    }
  };

  const handleDocDragStart = (e, docId) => {
    setDraggingDocId(docId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-doc-id', String(docId));
  };

  const handleDocDragEnd = () => {
    setDraggingDocId(null);
    setDropTargetFolderId(null);
  };

  const handleFolderDrop = async (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    const docId = e.dataTransfer.getData('application/x-doc-id') || draggingDocId;
    setDropTargetFolderId(null);
    if (!docId) return;
    await moveDocumentToFolder(docId, folderId);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  };

  const renderTree = (parentId = null, depth = 0) => {
    const key = parentId || ROOT_KEY;
    const nodes = childFoldersByParent.get(key) || [];
    if (nodes.length === 0) return null;
    return nodes.map((folder) => {
      const id = String(folder._id);
      const expanded = expandedIds.has(id);
      const hasChildren = (childFoldersByParent.get(id) || []).length > 0;
      const selected = selectedFolderId === id;
      return (
        <Box key={id}>
          <Box
            onDragOver={(e) => {
              if (!draggingDocId) return;
              e.preventDefault();
              setDropTargetFolderId(id);
            }}
            onDragLeave={() => {
              if (dropTargetFolderId === id) setDropTargetFolderId(null);
            }}
            onDrop={(e) => handleFolderDrop(e, id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              pl: depth * 1.5,
              py: 0.4,
              borderRadius: 1,
              bgcolor:
                dropTargetFolderId === id
                  ? 'action.selected'
                  : selected
                    ? 'action.selected'
                    : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <IconButton
              size="small"
              onClick={() => (hasChildren ? toggleExpand(id) : setSelectedFolderId(id))}
              sx={{ p: 0.4, mr: 0.4 }}
            >
              {hasChildren ? (expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />) : <Box sx={{ width: 20 }} />}
            </IconButton>
            <Button
              size="small"
              onClick={() => setSelectedFolderId(id)}
              startIcon={selected || expanded ? <FolderOpenIcon fontSize="small" /> : <FolderIcon fontSize="small" />}
              sx={{ justifyContent: 'flex-start', textTransform: 'none', minWidth: 0, px: 0.5, flex: 1 }}
            >
              <Typography variant="body2" noWrap>{folder.name}</Typography>
            </Button>
          </Box>
          {expanded && renderTree(id, depth + 1)}
        </Box>
      );
    });
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>Document Explorer</Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, gap: 2 }}>
        <Paper sx={{ p: 2, maxHeight: '75vh', overflow: 'auto' }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <Button size="small" variant="contained" startIcon={<CreateNewFolderIcon />} onClick={() => setNewFolderOpen(true)} sx={{ textTransform: 'none' }}>
              New Folder
            </Button>
            <Button size="small" variant="outlined" startIcon={<NoteAddIcon />} onClick={openNewFileDialog} sx={{ textTransform: 'none' }}>
              New File
            </Button>
          </Box>
          <Button
            size="small"
            startIcon={<HomeIcon fontSize="small" />}
            onClick={() => setSelectedFolderId(null)}
            onDragOver={(e) => {
              if (!draggingDocId) return;
              e.preventDefault();
              setDropTargetFolderId('__root__');
            }}
            onDragLeave={() => {
              if (dropTargetFolderId === '__root__') setDropTargetFolderId(null);
            }}
            onDrop={(e) => handleFolderDrop(e, null)}
            sx={{ textTransform: 'none', mb: 1, justifyContent: 'flex-start' }}
          >
            Root
          </Button>
          <Divider sx={{ mb: 1 }} />
          {renderTree(null, 0)}
        </Paper>

        <Box>
          <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
            {breadcrumbs.map((c) => (
              <Button
                key={c._id || 'root'}
                size="small"
                onClick={() => setSelectedFolderId(c._id ? String(c._id) : null)}
                onDragOver={(e) => {
                  if (!draggingDocId) return;
                  e.preventDefault();
                  setDropTargetFolderId(c._id ? String(c._id) : '__root__');
                }}
                onDragLeave={() => {
                  const key = c._id ? String(c._id) : '__root__';
                  if (dropTargetFolderId === key) setDropTargetFolderId(null);
                }}
                onDrop={(e) => handleFolderDrop(e, c._id ? String(c._id) : null)}
                sx={{
                  textTransform: 'none',
                  minWidth: 0,
                  border: dropTargetFolderId === (c._id ? String(c._id) : '__root__') ? '1px dashed' : '1px solid transparent',
                  borderColor: dropTargetFolderId === (c._id ? String(c._id) : '__root__') ? 'primary.main' : 'transparent',
                }}
              >
                {c.name}
              </Button>
            ))}
          </Breadcrumbs>

          <TextField
            fullWidth
            placeholder="Search in current folder..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          />

          <Paper
            sx={{ p: 2, mb: 2, border: '2px dashed', borderColor: dragActive ? 'primary.main' : 'grey.300', bgcolor: dragActive ? 'action.hover' : 'background.default', cursor: 'pointer' }}
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]); }}
            onClick={() => document.getElementById('document-upload')?.click()}
          >
            <input
              id="document-upload"
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], e.target)}
              disabled={uploading}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="body2">
                Upload PDF to <strong>{breadcrumbs[breadcrumbs.length - 1]?.name || 'Root'}</strong>
              </Typography>
              <Button variant="contained" startIcon={uploading ? <CircularProgress size={16} /> : <AddIcon />} sx={{ textTransform: 'none' }}>
                {uploading ? 'Uploading...' : 'Browse'}
              </Button>
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0,1fr) 88px', md: 'minmax(0,1fr) 110px 130px 90px 180px' },
                gap: 1,
                px: 1.5,
                py: 1,
                bgcolor: 'action.hover',
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>Name</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', display: { xs: 'none', md: 'block' } }}>Type</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', display: { xs: 'none', md: 'block' } }}>Modified</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', display: { xs: 'none', md: 'block' } }}>Size</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Actions</Typography>
            </Box>

            {filteredFolders.map((folder) => (
              <Box
                key={folder._id}
                onDragOver={(e) => {
                  if (!draggingDocId) return;
                  e.preventDefault();
                  setDropTargetFolderId(String(folder._id));
                }}
                onDragLeave={() => {
                  if (dropTargetFolderId === String(folder._id)) setDropTargetFolderId(null);
                }}
                onDrop={(e) => handleFolderDrop(e, String(folder._id))}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'minmax(0,1fr) 88px', md: 'minmax(0,1fr) 110px 130px 90px 180px' },
                  gap: 1,
                  px: 1.5,
                  py: 0.9,
                  alignItems: 'center',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: dropTargetFolderId === String(folder._id) ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Button
                  startIcon={<FolderIcon />}
                  onClick={() => setSelectedFolderId(String(folder._id))}
                  sx={{ textTransform: 'none', justifyContent: 'flex-start', minWidth: 0, px: 0 }}
                >
                  <Typography noWrap title={folder.name}>{folder.name}</Typography>
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>Folder</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                  {folder.createdAt ? format(new Date(folder.createdAt), 'MMM dd, yyyy') : '-'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>-</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => { setFolderToRename(folder); setRenameFolderName(folder.name || ''); setRenameFolderOpen(true); }}>
                    <RenameIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => { setFolderToDelete(folder); setDeleteFolderOpen(true); }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))}

            {filteredFiles.map((doc) => (
              <Box
                key={doc._id}
                draggable
                onDragStart={(e) => handleDocDragStart(e, String(doc._id))}
                onDragEnd={handleDocDragEnd}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'minmax(0,1fr) 88px', md: 'minmax(0,1fr) 110px 130px 90px 180px' },
                  gap: 1,
                  px: 1.5,
                  py: 0.9,
                  alignItems: 'center',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  opacity: draggingDocId === String(doc._id) ? 0.5 : 1,
                  cursor: 'grab',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    {doc.mimetype === 'application/pdf' ? (
                      <PictureAsPdfIcon sx={{ color: '#F44336', fontSize: 18, flexShrink: 0 }} />
                    ) : (
                      <DescriptionIcon sx={{ color: 'primary.main', fontSize: 18, flexShrink: 0 }} />
                    )}
                    <Typography variant="body2" noWrap title={doc.originalName}>{doc.originalName}</Typography>
                  </Box>
                  {doc.description && (
                    <Typography variant="caption" color="text.secondary" noWrap title={doc.description} sx={{ display: 'block', pl: 3.25 }}>
                      {doc.description}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <Chip
                    size="small"
                    label={doc.mimetype === 'application/pdf' ? 'PDF' : 'TEXT'}
                    color={doc.mimetype === 'application/pdf' ? 'error' : 'primary'}
                    variant="outlined"
                  />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                  {format(new Date(doc.createdAt), 'MMM dd, yyyy')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                  {formatFileSize(doc.size)}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {doc.mimetype === 'application/pdf' ? (
                    <IconButton size="small" onClick={() => { setViewingDocument(doc); setViewDialogOpen(true); }} title="View PDF">
                      <DescriptionIcon fontSize="small" />
                    </IconButton>
                  ) : (
                    <IconButton size="small" onClick={() => handleOpenTextFile(doc)} title="Open file">
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                  <IconButton size="small" onClick={() => { setDocumentToEdit(doc); setDescriptionInput(doc.description || ''); setEditDescriptionOpen(true); }} title="Edit description">
                    <RenameIcon fontSize="small" />
                  </IconButton>
                  {doc.mimetype === 'application/pdf' && (
                    <IconButton size="small" onClick={() => handleDownload(doc)} title="Download">
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  )}
                  <IconButton size="small" color="error" onClick={() => handleDeleteFile(doc)} title="Delete">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))}
          </Paper>

          {filteredFolders.length === 0 && filteredFiles.length === 0 && (
            <Paper sx={{ p: 4, textAlign: 'center', mt: 2 }}>
              <AttachFileIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">This folder is empty. Create a folder or new text file path to begin.</Typography>
            </Paper>
          )}
        </Box>
      </Box>

      <Dialog open={newFileOpen} onClose={() => setNewFileOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create New File</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="File path"
            helperText="Example: Shop SOPs/Opening/opening-checklist.txt"
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            multiline
            minRows={10}
            label="File content"
            value={newFileContent}
            onChange={(e) => setNewFileContent(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFileOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateTextFile} disabled={creatingFile}>
            {creatingFile ? 'Creating...' : 'Create File'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={newFolderOpen} onClose={() => setNewFolderOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create Folder</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateFolder}>Create</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={renameFolderOpen} onClose={() => setRenameFolderOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename Folder</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Folder name" value={renameFolderName} onChange={(e) => setRenameFolderName(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameFolderOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleRenameFolder}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteFolderOpen} onClose={() => setDeleteFolderOpen(false)}>
        <DialogTitle>Delete Folder</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{folderToDelete?.name}</strong> and all child folders/files?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFolderOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteFolder}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Document</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{documentToDelete?.originalName}</strong>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteFileConfirm}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editDescriptionOpen} onClose={() => setEditDescriptionOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Description</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline minRows={3} value={descriptionInput} onChange={(e) => setDescriptionInput(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDescriptionOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveDescription}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '90vh' } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{viewingDocument?.originalName}</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button startIcon={<DownloadIcon />} onClick={() => viewingDocument && handleDownload(viewingDocument)} size="small">Download</Button>
            <IconButton onClick={() => setViewDialogOpen(false)} size="small"><CloseIcon /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, height: '100%' }}>
          {viewingDocument && (
            <iframe
              src={`${API_URL}/files/${viewingDocument._id}/download`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title={viewingDocument.originalName}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={textEditorOpen} onClose={() => setTextEditorOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Edit File</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="File name"
            value={textFileName}
            onChange={(e) => setTextFileName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            multiline
            minRows={16}
            label="Content"
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTextEditorOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTextFile} disabled={savingTextDoc}>
            {savingTextDoc ? 'Saving...' : 'Save File'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default DocumentExplorer;
