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
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function AddTodoModal({ open, onClose, onSuccess, taskId, initialData, isProject = false, refreshTrigger }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const isEditMode = !!taskId;

  // Fetch task data if taskId is provided but initialData is not
  useEffect(() => {
    if (open && isEditMode && taskId && !initialData) {
      const fetchTask = async () => {
        try {
          setFetching(true);
          const response = await axios.get(`${API_URL}/tasks/${taskId}`);
          const task = response.data;
          setTitle(task.title || '');
          setDescription(task.description || '');
          setIsUrgent(task.isUrgent || false);
        } catch (error) {
          console.error('Error fetching task:', error);
          toast.error('Failed to load task data');
        } finally {
          setFetching(false);
        }
      };
      fetchTask();
    }
  }, [open, isEditMode, taskId, initialData]);

  // Reset form when modal opens or initialData changes
  useEffect(() => {
    if (open) {
      if (isEditMode && initialData) {
        setTitle(initialData.title || '');
        setDescription(initialData.description || '');
        setIsUrgent(initialData.isUrgent || false);
      } else if (!isEditMode || (isEditMode && !taskId)) {
        // Only reset if not in edit mode or if we don't have a taskId to fetch
        setTitle('');
        setDescription('');
        setIsUrgent(false);
      }
    }
  }, [open, isEditMode, initialData, taskId]);

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
        isUrgent: isUrgent,
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
      setIsUrgent(false);
      
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
      setIsUrgent(false);
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
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={isUrgent}
                  onChange={(e) => setIsUrgent(e.target.checked)}
                  color="error"
                />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: isUrgent ? 600 : 400, color: isUrgent ? 'error.main' : 'inherit' }}>
                  Mark as Urgent
                </Typography>
              }
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

