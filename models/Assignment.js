const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  Step: String,
  Assignment: String,
  EstimatedTime: Number, // in hours
  RecommendedStartOffset: Number, 
  IsOngoing: Boolean,
  IsDayOf: Boolean,
  Type: [String],
  Status: String
}, { collection: 'Assignments' });


module.exports = mongoose.model('Assignments', assignmentSchema);
