const mongoose = require('mongoose');

const ProjectAssignmentSchema = new mongoose.Schema({
  Assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignments' },
  Project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  Assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  EstimatedTime: Date,
  RecommendedStartDate: Date,
  Comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comments' }], // Reference to Comment documents
  Important: Boolean,
  Status: String,
}, { collection: 'ProjectAssignments' }); 

module.exports = mongoose.model('ProjectAssignments', ProjectAssignmentSchema);