import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Checkbox,
  IconButton,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function TodoList({ onTodoClick, onTodoComplete, onAddClick, onEditClick, onCountChange, refreshTrigger }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTodos();
  }, [refreshTrigger]);

  useEffect(() => {
    if (onCountChange) {
      onCountChange(todos.length);
    }
  }, [todos, onCountChange]);

  const fetchTodos = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/tasks`);
      setTodos(response.data || []);
    } catch (error) {
      console.error('Error fetching todos:', error);
      console.error('Error response:', error.response?.data);
      toast.error('Failed to load todos');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (todoId, e) => {
    e.stopPropagation();
    try {
      await axios.post(`${API_URL}/tasks/${todoId}/complete`);
      toast.success('Task marked as completed');
      fetchTodos();
      if (onTodoComplete) {
        onTodoComplete();
      }
    } catch (error) {
      console.error('Error completing task:', error);
      toast.error('Failed to complete task');
    }
  };

  const handleDelete = async (todoId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/tasks/${todoId}`);
      toast.success('Task deleted');
      fetchTodos();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };


  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onAddClick}
          sx={{
            borderRadius: '8px',
            textTransform: 'none',
          }}
        >
          Add Task
        </Button>
      </Box>
      
      {todos.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No tasks
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[...todos].sort((a, b) => {
            // Sort by createdAt descending (most recent first)
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
          }).map((todo) => (
            <Paper
              key={todo._id}
              onClick={() => onTodoClick && onTodoClick(todo._id)}
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderLeft: '3px solid #1976D2',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  transform: 'translateY(-2px)',
                },
              }}
            >
              <Checkbox
                icon={<RadioButtonUncheckedIcon />}
                checkedIcon={<CheckCircleIcon />}
                checked={false}
                onChange={(e) => handleComplete(todo._id, e)}
                sx={{ color: 'primary.main' }}
              />
              
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body1" sx={{ fontWeight: 400, color: '#263238' }}>
                  {todo.customerId?.name 
                    ? `${todo.title} - ${todo.description} | ${todo.customerId.name}`
                    : `${todo.title} - ${todo.description}`
                  }
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {onEditClick && (
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditClick(todo._id, todo);
                    }}
                    sx={{ color: 'primary.main' }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => handleDelete(todo._id, e)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default TodoList;

