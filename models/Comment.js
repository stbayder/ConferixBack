// models/Comments.js
const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  ProjectAssignment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ProjectAssignments', 
    required: true 
  },
  Author: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Users', 
    required: true 
  },
  Content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  CreatedAt: {
    type: Date,
    default: Date.now
  },
  UpdatedAt: {
    type: Date,
    default: Date.now
  },
  IsEdited: {
    type: Boolean,
    default: false
  },
  IsDeleted: {
    type: Boolean,
    default: false
  }
}, { 
  collection: 'Comments',
  timestamps: true // This will automatically handle createdAt and updatedAt
});

// Index for better query performance
CommentSchema.index({ ProjectAssignment: 1, CreatedAt: -1 });
CommentSchema.index({ Author: 1 });

// Pre-save middleware to update the UpdatedAt field
CommentSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.UpdatedAt = new Date();
    this.IsEdited = true;
  }
  next();
});

module.exports = mongoose.model('Comments', CommentSchema);