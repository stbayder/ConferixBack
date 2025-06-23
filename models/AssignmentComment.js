const mongoose = require('mongoose');

const AssignmentCommentSchema = new mongoose.Schema({
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignments',
    required: true
  },
  AuthorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Users', 
    required: false
  },
  title: String,
  text: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['comment', 'question', 'update', 'issue', 'suggestion'],
    default: 'comment'
  },
  status: {
    type: String,
    enum: ['active', 'deleted'],
    default: 'active'
  },
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AssignmentComments',
    default: null 
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { 
  collection: 'AssignmentComments',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual field to calculate likes count
AssignmentCommentSchema.virtual('likesCount', {
  ref: 'Likes',
  localField: '_id',
  foreignField: 'commentId',
  count: true
});

module.exports = mongoose.model('AssignmentComments', AssignmentCommentSchema);