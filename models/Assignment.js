const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  Name: String,
  DueDate: Date,
  RequiredTime: Number, // in hours
  DateOfExecution: Date,
  Assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  Project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  Type: String,
  Status: String
}, { collection: 'Assignments' }); 
module.exports = mongoose.model('Assignments', assignmentSchema);