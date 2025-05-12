const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  Step: String,
  Assignment: String,
  EstimatedTime: String,
  RecommendedStartDate: String,
  Type: [String], 
  Status: String
}, { collection: 'Assignments' });

module.exports = mongoose.model('Assignments', assignmentSchema);
