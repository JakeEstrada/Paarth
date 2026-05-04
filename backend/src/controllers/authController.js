const User = require('../models/User');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateToken');
const { getFileStream, deleteStoredFileBinary } = require('./fileController');

function photoPayloadFromMulterFile(file) {
  if (!file) return null;
  if (file.key) {
    return {
      filename: file.originalname || 'photo.png',
      path: file.key,
      s3Key: file.key,
      mimetype: file.mimetype || 'image/png',
    };
  }
  return {
    filename: file.filename,
    path: file.path,
    s3Key: undefined,
    mimetype: file.mimetype || 'image/png',
  };
}

function hasPhotoDoc(doc) {
  return !!(doc && (doc.path || doc.s3Key || doc.filename));
}

/** Light: themed light, else default. Dark: themed dark, else default. */
function resolveUserProfilePhoto(user, themeMode) {
  const isDark = themeMode === 'dark';
  if (isDark) {
    if (hasPhotoDoc(user?.profilePhotoDark)) return user.profilePhotoDark;
    if (hasPhotoDoc(user?.profilePhoto)) return user.profilePhoto;
    return null;
  }
  if (hasPhotoDoc(user?.profilePhotoLight)) return user.profilePhotoLight;
  if (hasPhotoDoc(user?.profilePhoto)) return user.profilePhoto;
  return null;
}

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
    let user = await User.findOne({
      $or: [{ email: loginField.toLowerCase() }, { email: loginField }],
    });
    if (!user) {
      user = await User.findOne({
        $or: [{ email: loginField.toLowerCase() }, { email: loginField }],
      }).setOptions({ bypassTenant: true });
    }
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
    
    const userWithTenant = await User.findById(user._id)
      .populate('tenantId', 'name slug logo updatedAt')
      .setOptions({ bypassTenant: true });

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.json({
      user: userWithTenant,
      accessToken,
      refreshToken
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get current user
async function me(req, res) {
  const userWithTenant = await User.findById(req.user._id)
    .populate('tenantId', 'name slug logo updatedAt')
    .setOptions({ bypassTenant: true });
  res.json({ user: userWithTenant });
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
    
    let user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      user = await User.findOne({ email: email.toLowerCase() }).setOptions({ bypassTenant: true });
    }
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
    
    let user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      user = await User.findOne({ email: email.toLowerCase() }).setOptions({ bypassTenant: true });
    }
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
    
    let user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      user = await User.findOne({ email: email.toLowerCase() }).setOptions({ bypassTenant: true });
    }
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

/** Stream a single stored variant (default | light | dark) for previews in account settings. */
async function getMyProfilePhotoRaw(req, res) {
  try {
    const v = String(req.params.variant || '').toLowerCase();
    const fieldMap = { default: 'profilePhoto', light: 'profilePhotoLight', dark: 'profilePhotoDark' };
    const field = fieldMap[v];
    if (!field) {
      return res.status(400).json({ error: 'Invalid variant' });
    }
    const user = await User.findById(req.user._id)
      .select(`${field}`)
      .setOptions({ bypassTenant: true });
    const doc = user[field];
    if (!hasPhotoDoc(doc)) {
      return res.status(404).end();
    }
    const pseudoFile = {
      filename: doc.filename,
      path: doc.path,
      s3Key: doc.s3Key,
      mimetype: doc.mimetype,
    };
    res.setHeader('Content-Type', doc.mimetype || 'image/png');
    res.setHeader('Cache-Control', 'private, no-cache');
    const stream = await getFileStream(pseudoFile);
    stream.on('error', (err) => {
      console.error('getMyProfilePhotoRaw stream:', err);
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    console.error('getMyProfilePhotoRaw:', error);
    if (!res.headersSent) res.status(500).end();
  }
}

/** Authenticated: stream resolved profile photo for current user (for light/dark UI). */
async function getMyProfilePhoto(req, res) {
  try {
    const themeMode = String(req.query.mode || 'light').toLowerCase() === 'dark' ? 'dark' : 'light';
    const user = await User.findById(req.user._id)
      .select('profilePhoto profilePhotoLight profilePhotoDark')
      .setOptions({ bypassTenant: true });
    const resolved = resolveUserProfilePhoto(user, themeMode);
    if (!resolved) {
      return res.status(404).end();
    }
    const pseudoFile = {
      filename: resolved.filename,
      path: resolved.path,
      s3Key: resolved.s3Key,
      mimetype: resolved.mimetype,
    };
    res.setHeader('Content-Type', resolved.mimetype || 'image/png');
    res.setHeader('Cache-Control', 'private, no-cache');
    const stream = await getFileStream(pseudoFile);
    stream.on('error', (err) => {
      console.error('getMyProfilePhoto stream:', err);
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    console.error('getMyProfilePhoto:', error);
    if (!res.headersSent) res.status(500).end();
  }
}

/** variant: default | light | dark */
async function uploadUserProfilePhoto(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }
    const variant = String(req.params.variant || 'default').toLowerCase();
    const fieldMap = { default: 'profilePhoto', light: 'profilePhotoLight', dark: 'profilePhotoDark' };
    const field = fieldMap[variant];
    if (!field) {
      return res.status(400).json({ error: 'Invalid variant. Use default, light, or dark.' });
    }

    const user = await User.findById(req.user._id).setOptions({ bypassTenant: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const previous = user[field];
    if (previous && (previous.path || previous.s3Key || previous.filename)) {
      await deleteStoredFileBinary({
        filename: previous.filename,
        path: previous.path,
        s3Key: previous.s3Key,
        mimetype: previous.mimetype,
      });
    }

    user[field] = photoPayloadFromMulterFile(req.file);
    await user.save();

    const userResponse = user.toJSON();
    delete userResponse.password;
    res.json({
      message: 'Profile photo updated',
      user: userResponse,
    });
  } catch (error) {
    console.error('uploadUserProfilePhoto:', error);
    res.status(500).json({ error: error.message || 'Failed to upload profile photo' });
  }
}

// Update own profile (name required; address optional; email cannot be changed)
async function updateProfile(req, res) {
  try {
    const { name, address } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // User is already attached to req by requireAuth middleware
    const user = req.user;
    user.name = name.trim();
    if (address !== undefined) {
      user.address = address == null ? '' : String(address).trim();
    }
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
  changePassword,
  getMyProfilePhoto,
  getMyProfilePhotoRaw,
  uploadUserProfilePhoto,
};
