const User = require('../models/User');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateToken');

// Register new user (requires admin approval)
async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Create user as pending (needs admin approval)
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: 'employee', // Default to employee, admin will change it
      isActive: false,
      isPending: true
    });
    
    await user.save();
    
    res.status(201).json({
      message: 'Registration successful. Your account is pending admin approval.',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isPending: true
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Login
async function login(req, res) {
  try {
    const { email, username, password } = req.body;
    
    // Support both email and username login
    const loginField = username || email;
    if (!loginField) {
      return res.status(400).json({ error: 'Email or username is required' });
    }
    
    // Find user by email or username (if username field exists, otherwise use email)
    // For now, we'll use email as the login field, but check if it matches username pattern
    const user = await User.findOne({ 
      $or: [
        { email: loginField.toLowerCase() },
        { email: loginField } // Also try case-sensitive for username-like emails
      ]
    });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email/username or password' });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check if pending approval
    if (user.isPending) {
      return res.status(401).json({ error: 'Your account is pending admin approval. Please contact an administrator.' });
    }
    
    // Check if active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive. Please contact an administrator.' });
    }
    
    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    
    res.json({
      user,
      accessToken,
      refreshToken
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get current user
async function me(req, res) {
  res.json({ user: req.user });
}

// Logout (client-side handles token removal)
async function logout(req, res) {
  res.json({ message: 'Logged out successfully' });
}

// Forgot password - find user by email
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if user exists for security
      return res.json({ 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    }
    
    // In a real app, you would send an email with a reset token
    // For now, we'll just return a message
    // TODO: Implement email sending with reset token
    
    res.json({ 
      message: 'If an account with that email exists, a password reset link has been sent.',
      // In development, you might want to return the user email for testing
      // Remove this in production
      ...(process.env.NODE_ENV === 'development' && { email: user.email })
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Forgot username - find user by email
async function forgotUsername(req, res) {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if user exists for security
      return res.json({ 
        message: 'If an account with that email exists, your username has been sent.' 
      });
    }
    
    // In a real app, you would send an email with the username
    // For now, we'll return it (in production, only send via email)
    res.json({ 
      message: 'If an account with that email exists, your username has been sent.',
      username: user.email // Email is used as username
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Reset password (would normally require a token from email)
async function resetPassword(req, res) {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // In a real app, verify the reset token here
    // For now, we'll allow direct reset (add token verification in production)
    
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update own profile (name only, email cannot be changed)
async function updateProfile(req, res) {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // User is already attached to req by requireAuth middleware
    const user = req.user;
    user.name = name.trim();
    await user.save();
    
    const userResponse = user.toJSON();
    delete userResponse.password;
    
    res.json({ 
      message: 'Profile updated successfully',
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Change own password
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    
    // User is already attached to req by requireAuth middleware
    const user = req.user;
    
    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  register,
  login,
  me,
  logout,
  forgotPassword,
  forgotUsername,
  resetPassword,
  updateProfile,
  changePassword
};
