const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

// Get all users (admin only)
async function getUsers(req, res) {
  try {
    // Check if user is admin or super_admin
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
    }

    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    const pendingUsers = users.filter(u => u.isPending);
    const activeUsers = users.filter(u => !u.isPending);
    
    res.json({ 
      users: activeUsers,
      pendingUsers: pendingUsers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create new user (admin only)
async function createUser(req, res) {
  try {
    // Check if user is admin or super_admin
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
    }

    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'sales', 'installer', 'read_only', 'employee'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Only super_admin can create admin users
    if (role === 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can create admin users' });
    }

    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: role || 'sales',
      isActive: true
    });

    await user.save();

    // Return user without password
    const userResponse = user.toJSON();
    delete userResponse.password;

    res.status(201).json({ user: userResponse });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update user (admin only)
async function updateUser(req, res) {
  try {
    // Check if user is admin or super_admin
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
    }

    const { userId } = req.params;
    const { name, email, role, isActive, password, approve, isPending } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only super_admin can modify admin users
    if (user.role === 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can modify admin users' });
    }

    // Approve pending user
    if (approve === true) {
      user.isPending = false;
      user.isActive = true;
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (role !== undefined) {
      // Only super_admin can change roles to/from admin or super_admin
      if ((role === 'admin' || role === 'super_admin' || user.role === 'admin' || user.role === 'super_admin') && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admin can change admin or super_admin roles' });
      }
      user.role = role;
    }
    if (isActive !== undefined) user.isActive = isActive;
    if (isPending !== undefined && req.user.role === 'super_admin') {
      user.isPending = isPending;
    }
    if (password) user.password = password; // Will be hashed by pre-save hook

    await user.save();

    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json({ user: userResponse });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete user (admin only)
async function deleteUser(req, res) {
  try {
    // Check if user is admin or super_admin
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
    }

    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Only super_admin can delete admin users
    if (user.role === 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can delete admin users' });
    }

    await User.findByIdAndDelete(userId);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser
};

