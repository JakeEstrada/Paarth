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

function AddNoteModal({ open, onClose, onSuccess, job }) {
  const [noteContent, setNoteContent] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open && job) {
      setNoteContent('');
    }
  }, [open, job]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!noteContent.trim()) {
      toast.error('Please enter a note');
      return;
    }

    if (!job) {
      toast.error('Job not found');
      return;
    }

    try {
      setLoading(true);
      
      // Get current job to preserve existing notes
      const currentJob = await axios.get(`${API_URL}/jobs/${job._id}`);
      const existingNotes = currentJob.data.notes || [];
      
      // Add new note to the array
      const updatedNotes = [
        ...existingNotes,
        {
          content: noteContent.trim(),
          createdAt: new Date(),
        }
      ];

      // Update job with new notes array
      await axios.patch(`${API_URL}/jobs/${job._id}`, {
        notes: updatedNotes
      });
      
      toast.success('Note added successfully');
      
      // Reset form
      setNoteContent('');
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error(error.response?.data?.error || 'Failed to add note');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setNoteContent('');
      onClose();
    }
  };

  if (!job) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Add Note for {job.title}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              label="Note"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              required
              fullWidth
              multiline
              rows={4}
              autoFocus
              placeholder="Enter your note here..."
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
            {loading ? 'Adding...' : 'Add Note'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default AddNoteModal;

