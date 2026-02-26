import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Divider,
  Chip,
  IconButton,
  CircularProgress,
  Paper,
  Avatar,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Note as NoteIcon,
  Update as UpdateIcon,
  AttachFile as AttachFileIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function ProjectModal({ open, onClose, projectId, onUpdate }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [newUpdate, setNewUpdate] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [addingUpdate, setAddingUpdate] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (open && projectId) {
      fetchProjectDetails();
      fetchFiles();
    } else {
      setProject(null);
      setNewNote('');
      setNewUpdate('');
      setFiles([]);
    }
  }, [open, projectId]);

  const fetchProjectDetails = async () => {
    try {
      setFetching(true);
      const response = await axios.get(`${API_URL}/tasks/${projectId}/project`);
      setProject(response.data);
    } catch (error) {
      console.error('Error fetching project details:', error);
      toast.error('Failed to load project details');
      onClose();
    } finally {
      setFetching(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error('Please enter a note');
      return;
    }

    try {
      setAddingNote(true);
      const response = await axios.post(`${API_URL}/tasks/${projectId}/project/note`, {
        content: newNote
      });
      setProject(response.data);
      setNewNote('');
      toast.success('Note added successfully');
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const handleAddUpdate = async () => {
    if (!newUpdate.trim()) {
      toast.error('Please enter an update');
      return;
    }

    try {
      setAddingUpdate(true);
      const response = await axios.post(`${API_URL}/tasks/${projectId}/project/update`, {
        content: newUpdate
      });
      setProject(response.data);
      setNewUpdate('');
      toast.success('Update added successfully');
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error adding update:', error);
      toast.error('Failed to add update');
    } finally {
      setAddingUpdate(false);
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await axios.get(`${API_URL}/files/task/${projectId}`);
      setFiles(response.data || []);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleFileUpload = async (file, resetInput = null) => {
    if (!file) return;

    // Validate file type - allow PDFs and images
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only images and PDFs are allowed.');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('taskId', projectId);
      formData.append('fileType', 'other');

      await axios.post(`${API_URL}/files/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success('File uploaded successfully');
      await fetchFiles();
      if (resetInput) {
        resetInput.value = '';
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(error.response?.data?.error || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/files/${fileId}`);
      toast.success('File deleted successfully');
      await fetchFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error('Failed to delete file');
    }
  };

  const handleDownloadFile = async (fileId) => {
    try {
      const response = await axios.get(`${API_URL}/files/${fileId}/download`, {
        responseType: 'blob',
      });
      
      // Create a blob URL and trigger download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from response headers or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'download';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '90vh',
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {project ? project.title : 'Project Details'}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {fetching ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : project ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Project Info */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}>
                DESCRIPTION
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.primary' }}>
                {project.description || 'No description'}
              </Typography>
              {project.customerId && (
                <Chip
                  label={`Customer: ${project.customerId.name}`}
                  size="small"
                  sx={{ mt: 1 }}
                  color="primary"
                  variant="outlined"
                />
              )}
              {project.dueDate && (
                <Chip
                  label={`Due: ${format(new Date(project.dueDate), 'MMM dd, yyyy')}`}
                  size="small"
                  sx={{ mt: 1, ml: 1 }}
                  color={new Date(project.dueDate) < new Date() ? 'error' : 'default'}
                  variant="outlined"
                />
              )}
            </Box>

            <Divider />

            {/* Notes Section */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  NOTES ({project.notes?.length || 0})
                </Typography>
              </Box>

              {/* Add Note */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Add a note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  size="small"
                />
                <Button
                  variant="contained"
                  startIcon={addingNote ? <CircularProgress size={16} /> : <AddIcon />}
                  onClick={handleAddNote}
                  disabled={addingNote || !newNote.trim()}
                  sx={{ minWidth: 100 }}
                >
                  Add
                </Button>
              </Box>

              {/* Notes List */}
              {project.notes && project.notes.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {[...project.notes].reverse().map((note, index) => (
                    <Paper
                      key={index}
                      sx={{
                        p: 2,
                        backgroundColor: 'background.default',
                        borderLeft: '3px solid #1976D2',
                      }}
                    >
                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                          {note.createdBy?.name?.[0]?.toUpperCase() || 'U'}
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {note.createdBy?.name || 'Unknown'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(note.createdAt), 'MMM dd, yyyy h:mm a')}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                        {note.content}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No notes yet
                </Typography>
              )}
            </Box>

            <Divider />

            {/* Updates Section */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  UPDATES ({project.updates?.length || 0})
                </Typography>
              </Box>

              {/* Add Update */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Add an update..."
                  value={newUpdate}
                  onChange={(e) => setNewUpdate(e.target.value)}
                  size="small"
                />
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={addingUpdate ? <CircularProgress size={16} /> : <AddIcon />}
                  onClick={handleAddUpdate}
                  disabled={addingUpdate || !newUpdate.trim()}
                  sx={{ minWidth: 100 }}
                >
                  Add
                </Button>
              </Box>

              {/* Updates List */}
              {project.updates && project.updates.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {[...project.updates].reverse().map((update, index) => (
                    <Paper
                      key={index}
                      sx={{
                        p: 2,
                        backgroundColor: 'background.default',
                        borderLeft: '3px solid #9C27B0',
                      }}
                    >
                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                          {update.createdBy?.name?.[0]?.toUpperCase() || 'U'}
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {update.createdBy?.name || 'Unknown'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(update.createdAt), 'MMM dd, yyyy h:mm a')}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                        {update.content}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No updates yet
                </Typography>
              )}
            </Box>

            <Divider />

            {/* Files Section */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  FILES ({files.length})
                </Typography>
              </Box>

              {/* File Upload Section */}
              <Paper
                sx={{
                  p: 2,
                  border: '2px dashed',
                  borderColor: dragActive ? 'primary.main' : 'grey.300',
                  backgroundColor: dragActive ? 'action.hover' : 'background.default',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  mb: 2,
                }}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('project-file-upload')?.click()}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <AttachFileIcon
                    sx={{
                      fontSize: 32,
                      color: 'primary.main',
                      transition: 'transform 0.2s ease',
                      transform: dragActive ? 'scale(1.1)' : 'scale(1)',
                    }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                      {dragActive ? 'Drop files here' : 'Upload Files'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Drag & drop or click to browse • PDFs or photos • Max 10MB
                    </Typography>
                  </Box>
                  <input
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    id="project-file-upload"
                    type="file"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0], e.target);
                      }
                    }}
                    disabled={uploading}
                  />
                  <Button
                    variant="outlined"
                    component="span"
                    size="small"
                    startIcon={uploading ? <CircularProgress size={16} /> : <AttachFileIcon />}
                    disabled={uploading}
                    sx={{ textTransform: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {uploading ? 'Uploading...' : 'Browse'}
                  </Button>
                </Box>
              </Paper>

              {/* Files List */}
              {files.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {files.map((file) => {
                    const isPDF = file.mimetype === 'application/pdf';
                    const isImage = file.mimetype?.startsWith('image/');
                    return (
                      <Paper
                        key={file._id}
                        sx={{
                          p: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          backgroundColor: 'background.default',
                          borderLeft: '3px solid #FF9800',
                        }}
                      >
                        {isPDF ? (
                          <PictureAsPdfIcon sx={{ color: '#F44336', fontSize: 28 }} />
                        ) : isImage ? (
                          <ImageIcon sx={{ color: '#2196F3', fontSize: 28 }} />
                        ) : (
                          <AttachFileIcon sx={{ color: '#757575', fontSize: 28 }} />
                        )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.originalName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatFileSize(file.size)} • {format(new Date(file.createdAt), 'MMM dd, yyyy')}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => handleDownloadFile(file._id)}
                        sx={{ color: 'primary.main' }}
                        title="Download"
                      >
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteFile(file._id)}
                        sx={{ color: 'error.main' }}
                        title="Delete"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Paper>
                    );
                  })}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No files uploaded yet
                </Typography>
              )}
            </Box>
          </Box>
        ) : null}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default ProjectModal;

