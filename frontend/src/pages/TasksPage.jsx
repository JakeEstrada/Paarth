import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Checkbox,
  IconButton,
  Card,
  CardContent,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import AddTodoModal from '../components/todos/AddTodoModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function TasksPage() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  const [editTodoOpen, setEditTodoOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    fetchTodos();
  }, [refreshTrigger]);

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
      setRefreshTrigger(prev => prev + 1);
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
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const handleEditClick = (todoId, todo) => {
    setEditingTodo(todo);
    setEditTodoOpen(true);
  };

  const handleAddClick = () => {
    setAddTodoOpen(true);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Tasks
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
          sx={{
            borderRadius: '8px',
            textTransform: 'none',
          }}
        >
          Add Task
        </Button>
      </Box>

      {todos.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
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
            <Card
              key={todo._id}
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                borderLeft: '3px solid #1976D2',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  transform: 'translateY(-2px)',
                  transition: 'all 0.2s',
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
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(todo._id, todo);
                  }}
                  sx={{ color: 'primary.main' }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => handleDelete(todo._id, e)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Card>
          ))}
        </Box>
      )}

      {/* Add Task Modal */}
      <AddTodoModal
        open={addTodoOpen}
        onClose={() => {
          setAddTodoOpen(false);
          setRefreshTrigger(prev => prev + 1);
        }}
        refreshTrigger={refreshTrigger}
      />

      {/* Edit Task Modal */}
      {editingTodo && (
        <AddTodoModal
          open={editTodoOpen}
          onClose={() => {
            setEditTodoOpen(false);
            setEditingTodo(null);
            setRefreshTrigger(prev => prev + 1);
          }}
          taskId={editingTodo._id}
          initialData={{
            title: editingTodo.title,
            description: editingTodo.description,
          }}
          refreshTrigger={refreshTrigger}
        />
      )}
    </Box>
  );
}

export default TasksPage;

