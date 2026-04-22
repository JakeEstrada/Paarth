const mongoose = require('mongoose');

const developerTaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    priorityDots: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('DeveloperTask', developerTaskSchema);
