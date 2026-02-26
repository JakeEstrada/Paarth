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

  useEffect(() => {
    if (open && projectId) {
      fetchProjectDetails();
    } else {
      setProject(null);
      setNewNote('');
      setNewUpdate('');
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

