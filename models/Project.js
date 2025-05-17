const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  Creator: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Users',
    required: true
  },
  Editors: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Users' 
  }],
  Type: {
    type: [String],
    required: true
  },
  Budget: {
    type: Number,
    default: 0
  },
  // Keep these fields but make them optional
  Assignments: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ProjectAssignments' 
  }],
  Area: String,
  Venue: String,
  AmountOfPeople: Number
}, { 
  collection: 'Projects',
  timestamps: true // Adds createdAt and updatedAt timestamps
}); 

module.exports = mongoose.model('Projects', projectSchema);