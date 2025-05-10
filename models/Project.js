const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: String,
  date: Date,
  Creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  Editors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  Assignments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' }],
  Type: [String],
  Budget: Number,
  Area: String,
  Venue: String,
  AmountOfPeople: Number
}, { collection: 'Projects' }); 

module.exports = mongoose.model('Projects', projectSchema);