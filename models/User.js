const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  Password: String,
  Email: String,
  Projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  Role: String
}, { collection: 'Users' }); 

module.exports = mongoose.model('Users', userSchema);