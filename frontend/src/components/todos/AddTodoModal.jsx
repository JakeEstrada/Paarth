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
} from '@mui/material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function AddTodoModal({ open, onClose, onSuccess, taskId, initialData, isProject = false, refreshTrigger }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const isEditMode = !!taskId;

  // Reset form when modal opens or initialData changes
  useEffect(() => {
    if (open) {
      if (isEditMode && initialData) {
        setTitle(initialData.title || '');
        setDescription(initialData.description || '');
      } else {
        setTitle('');
        setDescription('');
      }
    }
  }, [open, isEditMode, initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    if (!description.trim()) {
      toast.error('Please enter a description');
      return;
    }

    try {
      setLoading(true);
      
      const data = {
        title: title.trim(),
        description: description.trim(),
      };

      // Only set isProject when creating a new project
      if (!isEditMode && isProject) {
        data.isProject = true;
      }

      if (isEditMode) {
        await axios.patch(`${API_URL}/tasks/${taskId}`, data);
        toast.success(isProject ? 'Project updated successfully' : 'Task updated successfully');
      } else {
        const response = await axios.post(`${API_URL}/tasks`, data);
        toast.success(isProject ? 'Project created successfully' : 'Task created successfully');
      }
      
      // Reset form
      setTitle('');
      setDescription('');
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} task:`, error);
      toast.error(error.response?.data?.error || `Failed to ${isEditMode ? 'update' : 'create'} task`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setTitle('');
      setDescription('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {isEditMode
              ? (isProject ? 'Edit Project' : 'Edit Task')
              : (isProject ? 'Create New Project' : 'Add New Task')}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              fullWidth
              autoFocus
            />
            
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              fullWidth
              multiline
              rows={3}
              placeholder="Description"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="contained" 
            disabled={loading}
            sx={{ borderRadius: '8px' }}
          >
            {loading
              ? (isEditMode ? 'Updating...' : 'Creating...')
              : (isEditMode ? (isProject ? 'Update Project' : 'Update Task') : (isProject ? 'Create Project' : 'Create Task'))}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default AddTodoModal;

