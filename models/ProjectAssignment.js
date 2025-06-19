const mongoose = require('mongoose');

const ProjectAssignmentSchema = new mongoose.Schema({
  Assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignments' },
  Project: { type: mongoose.Schema.Types.ObjectId, ref: 'Projects' },
  Assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
  EstimatedTime: Date,
  RecommendedStartDate: Date,
  DueDate:Date,
  Comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comments' }], // Reference to Comment documents
  Important: Boolean,
  Status: String,
}, { collection: 'ProjectAssignments' }); 

module.exports = mongoose.model('ProjectAssignments', ProjectAssignmentSchema);