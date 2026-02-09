const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'manager', 'sales', 'installer', 'read_only', 'employee'],
    default: 'employee'
  },
  isActive: {
    type: Boolean,
    default: false // New users need admin approval
  },
  isPending: {
    type: Boolean,
    default: true // New registrations are pending approval
  }
}, {
  timestamps: true  // Automatically adds createdAt and updatedAt
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return ;
  
  this.password = await bcrypt.hash(this.password, 10);
  
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Don't return password in JSON responses
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);
