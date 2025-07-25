const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Connect DB and create Models if needed
require('./models/User');
require('./models/Project');
require('./models/Assignment');
require('./models/ProjectAssignment.js')
require('./models/Comment.js')
require('./models/Like.js')


mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('MongoDB connected');
  const loadAssignmentsIfEmpty = require('./utils/loadAssignmentsIfEmpty');
  await loadAssignmentsIfEmpty();
}).catch(err => console.error('MongoDB connection error:', err));

// Import routes
const userRoutes = require('./routes/Users.js');
const projectRoutes = require('./routes/Projects.js');
const projectAssignmentRoutes = require('./routes/ProjectAssignments.js');
const assignmentRoutes = require('./routes/Assignments.js');



// Mount routes
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/project-assignments', projectAssignmentRoutes);
app.use('/api/assignments', assignmentRoutes);



// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));