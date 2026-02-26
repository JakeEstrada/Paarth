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
  Tabs,
  Tab,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Transform as TransformIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import AddTodoModal from '../components/todos/AddTodoModal';
import ProjectModal from '../components/todos/ProjectModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function TasksPage() {
  const [todos, setTodos] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  const [editTodoOpen, setEditTodoOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [tabValue, setTabValue] = useState(0); // 0 = Tasks, 1 = Projects
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  useEffect(() => {
    fetchTodos();
  }, [refreshTrigger]);

  const fetchTodos = async () => {
    try {
      setLoading(true);
      // Fetch incomplete tasks (excludes projects)
      const incompleteResponse = await axios.get(`${API_URL}/tasks`);
      const incompleteItems = incompleteResponse.data || [];
      
      // Fetch completed tasks to get completed projects
      const completedResponse = await axios.get(`${API_URL}/tasks/completed`);
      const completedItems = completedResponse.data || [];
      
      // Flatten completed items (they're organized by month)
      const allCompletedItems = completedItems.flatMap(monthData => monthData.tasks || []);
      
      // Combine incomplete and completed items
      const allItems = [...incompleteItems, ...allCompletedItems];
      
      // Separate tasks and projects
      const tasksList = allItems.filter(item => !item.isProject);
      const projectsList = allItems.filter(item => item.isProject);
      
      setTodos(tasksList);
      setProjects(projectsList);
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

  const handleUncomplete = async (itemId, e) => {
    e.stopPropagation();
    try {
      await axios.post(`${API_URL}/tasks/${itemId}/uncomplete`);
      toast.success('Project marked as incomplete');
      fetchTodos();
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error uncompleting project:', error);
      toast.error('Failed to uncomplete project');
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
    if (tabValue === 1) {
      // Creating a new project
      setIsCreatingProject(true);
      setAddTodoOpen(true);
    } else {
      // Creating a regular task
      setIsCreatingProject(false);
      setAddTodoOpen(true);
    }
  };

  const handleConvertToProject = async (taskId, e) => {
    e.stopPropagation();
    if (!window.confirm('Convert this task to a project? This will allow you to add notes and updates.')) {
      return;
    }
    
    try {
      await axios.post(`${API_URL}/tasks/${taskId}/convert-to-project`);
      toast.success('Task converted to project');
      fetchTodos();
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error converting task to project:', error);
      toast.error('Failed to convert task to project');
    }
  };

  const handleProjectClick = (projectId) => {
    setSelectedProjectId(projectId);
    setProjectModalOpen(true);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const currentItems = tabValue === 0 ? todos : projects;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          {tabValue === 0 ? 'Tasks' : 'Projects'}
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
          {tabValue === 0 ? 'Add Task' : 'Add Project'}
        </Button>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography>Tasks</Typography>
                <Chip label={todos.length} size="small" sx={{ height: 20 }} />
              </Box>
            } 
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FolderIcon fontSize="small" />
                <Typography>Projects</Typography>
                <Chip label={projects.length} size="small" sx={{ height: 20 }} />
              </Box>
            } 
          />
        </Tabs>
      </Box>

      {currentItems.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {tabValue === 0 ? 'No tasks' : 'No projects'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[...currentItems].sort((a, b) => {
            // Sort by createdAt descending (most recent first)
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
          }).map((item) => (
            <Card
              key={item._id}
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                borderLeft: item.isProject ? '3px solid #9C27B0' : '3px solid #1976D2',
                cursor: item.isProject ? 'pointer' : 'default',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  transform: 'translateY(-2px)',
                  transition: 'all 0.2s',
                },
              }}
              onClick={() => item.isProject && handleProjectClick(item._id)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {item.isProject && (
                  <FolderOpenIcon sx={{ color: item.completedAt ? '#9C27B0' : '#9C27B0', opacity: item.completedAt ? 0.5 : 1 }} />
                )}
                <Checkbox
                  icon={<RadioButtonUncheckedIcon />}
                  checkedIcon={<CheckCircleIcon />}
                  checked={!!item.completedAt}
                  onChange={(e) => {
                    if (item.completedAt) {
                      handleUncomplete(item._id, e);
                    } else {
                      handleComplete(item._id, e);
                    }
                  }}
                  sx={{ color: item.isProject ? '#9C27B0' : 'primary.main' }}
                />
              </Box>
              
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500, color: '#263238' }}>
                    {item.title}
                  </Typography>
                  {item.isProject && (
                    <Chip 
                      label="Project" 
                      size="small" 
                      sx={{ height: 20, fontSize: '0.7rem' }}
                      color="secondary"
                    />
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {item.customerId?.name 
                    ? `${item.description || 'No description'} | ${item.customerId.name}`
                    : item.description || 'No description'
                  }
                </Typography>
                {item.isProject && (
                  <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      {item.notes?.length || 0} notes
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      •
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.updates?.length || 0} updates
                    </Typography>
                    {item.completedAt && (
                      <>
                        <Typography variant="caption" color="text.secondary">
                          •
                        </Typography>
                        <Chip 
                          label="Completed" 
                          size="small" 
                          sx={{ height: 18, fontSize: '0.65rem' }}
                          color="success"
                        />
                      </>
                    )}
                  </Box>
                )}
              </Box>

              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {!item.isProject && (
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConvertToProject(item._id, e);
                    }}
                    sx={{ color: '#9C27B0' }}
                    title="Convert to Project"
                  >
                    <TransformIcon fontSize="small" />
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(item._id, item);
                  }}
                  sx={{ color: item.isProject ? '#9C27B0' : 'primary.main' }}
                  title={item.isProject ? 'Edit Project' : 'Edit Task'}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item._id, e);
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Card>
          ))}
        </Box>
      )}

      {/* Add Task/Project Modal */}
      <AddTodoModal
        open={addTodoOpen}
        onClose={() => {
          setAddTodoOpen(false);
          setIsCreatingProject(false);
          setRefreshTrigger(prev => prev + 1);
        }}
        refreshTrigger={refreshTrigger}
        isProject={isCreatingProject}
        onSuccess={() => {
          fetchTodos();
        }}
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
          isProject={!!editingTodo.isProject}
          onSuccess={() => {
            fetchTodos();
          }}
        />
      )}

      {/* Project Modal */}
      <ProjectModal
        open={projectModalOpen}
        onClose={() => {
          setProjectModalOpen(false);
          setSelectedProjectId(null);
        }}
        projectId={selectedProjectId}
        onUpdate={() => {
          fetchTodos();
        }}
      />
    </Box>
  );
}

export default TasksPage;

