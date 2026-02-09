import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Container,
  InputAdornment,
  Alert,
} from '@mui/material';
import {
  Email as EmailIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function ForgotUsernamePage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('Please enter your email');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/forgot-username`, { email });
      if (response.data.username) {
        setUsername(response.data.username);
        toast.success('Username found!');
      } else {
        toast.success('If an account exists, your username has been sent to your email.');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.error || 'Failed to process request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 2,
      }}
    >
      <Container maxWidth="sm">
        <Card sx={{ boxShadow: '0 8px 32px rgba(0,0,0,0.1)', borderRadius: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Box
                component="img"
                src="/logo.png"
                alt="San Clemente Woodworking"
                sx={{
                  height: 80,
                  width: 80,
                  objectFit: 'contain',
                  mb: 2,
                }}
              />
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1976d2' }}>
                Forgot Username
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Enter your email to retrieve your username
              </Typography>
            </Box>

            {username && (
              <Alert severity="success" sx={{ mb: 3 }}>
                <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Your username is:
                </Typography>
                <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                  {username}
                </Typography>
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
                disabled={!!username}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 3 }}
              />

              {!username && (
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{
                    py: 1.5,
                    fontSize: '1rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    borderRadius: 2,
                    mb: 2,
                  }}
                >
                  {loading ? 'Searching...' : 'Find Username'}
                </Button>
              )}

              <Button
                component={Link}
                to="/login"
                fullWidth
                startIcon={<ArrowBackIcon />}
                sx={{ textTransform: 'none' }}
              >
                Back to Login
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

export default ForgotUsernamePage;

