import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Container,
  InputAdornment,
  IconButton,
  useTheme,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Lock as LockIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

function LoginPage() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Please enter both email/username and password');
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      navigate('/pipeline');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.palette.background.default,
        padding: 3,
      }}
    >
      <Container maxWidth="xs">
        <Box 
          sx={{ 
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 0,
            p: 5,
            backgroundColor: theme.palette.background.paper,
          }}
        >
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Box
              component="img"
              src="/logo.png"
              alt="San Clemente Woodworking"
              sx={{
                height: 60,
                width: 60,
                objectFit: 'contain',
                mb: 2,
              }}
            />
            <Typography variant="h5" sx={{ fontWeight: 500, mb: 0.5 }}>
              Sign in
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Enter your credentials to continue
            </Typography>
          </Box>

          <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Email or Username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            variant="outlined"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PersonIcon sx={{ color: theme.palette.text.secondary, fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
            sx={{ 
              mb: 2,
              '& .MuiOutlinedInput-root': {
                borderRadius: 1,
              },
            }}
          />

          <TextField
            fullWidth
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            variant="outlined"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockIcon sx={{ color: theme.palette.text.secondary, fontSize: 20 }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    size="small"
                    sx={{ color: theme.palette.text.secondary }}
                  >
                    {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ 
              mb: 3,
              '& .MuiOutlinedInput-root': {
                borderRadius: 1,
              },
            }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={loading}
            sx={{
              py: 1.5,
              fontSize: '0.9375rem',
              fontWeight: 500,
              textTransform: 'none',
              borderRadius: 1,
              mb: 3,
              backgroundColor: theme.palette.primary.main,
              '&:hover': {
                backgroundColor: theme.palette.primary.dark,
              },
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>

          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 4 }}>
            <Button
              component={Link}
              to="/forgot-username"
              size="small"
              sx={{ 
                textTransform: 'none',
                color: theme.palette.text.secondary,
                fontSize: '0.875rem',
                minWidth: 'auto',
                '&:hover': {
                  backgroundColor: 'transparent',
                  color: theme.palette.primary.main,
                },
              }}
            >
              Forgot Username?
            </Button>
            <Typography sx={{ color: theme.palette.text.disabled }}>•</Typography>
            <Button
              component={Link}
              to="/forgot-password"
              size="small"
              sx={{ 
                textTransform: 'none',
                color: theme.palette.text.secondary,
                fontSize: '0.875rem',
                minWidth: 'auto',
                '&:hover': {
                  backgroundColor: 'transparent',
                  color: theme.palette.primary.main,
                },
              }}
            >
              Forgot Password?
            </Button>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Don't have an account?
            </Typography>
            <Button
              component={Link}
              to="/register"
              variant="outlined"
              size="medium"
              sx={{ 
                textTransform: 'none',
                borderRadius: 1,
                px: 4,
                borderColor: theme.palette.divider,
                '&:hover': {
                  borderColor: theme.palette.divider,
                  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#fafafa',
                },
              }}
            >
              Create Account
            </Button>
          </Box>
        </Box>
        </Box>
      </Container>
    </Box>
  );
}

export default LoginPage;

