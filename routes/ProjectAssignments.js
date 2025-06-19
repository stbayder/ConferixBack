// Updated Routes - routes/projectAssignments.js
const express = require('express');
const router = express.Router();
const ProjectAssignments = require('../models/ProjectAssignment');
const Project = require("../models/Project")
const Users = require('../models/User');
const Comments = require('../models/Comment'); // New import
const {auth} = require('../utils/auth')

// Create a new ProjectAssignment
router.post('/', async (req, res) => {
  try {
    const {
      Assignment,
      Project,
      Assignee,
      EstimatedTime,
      RecommendedStartDate,
      Important = false,
      Status = 'Pending'
    } = req.body;

    // Validate required fields
    if (!Assignment || !Project || !Assignee) {
      return res.status(400).json({
        error: 'Assignment, Project, and Assignee are required fields'
      });
    }

    const newProjectAssignment = new ProjectAssignments({
      Assignment,
      Project,
      Assignee,
      EstimatedTime,
      RecommendedStartDate,
      Comments: [], // Initialize empty comments array
      Important,
      Status
    });

    const savedProjectAssignment = await newProjectAssignment.save();
    
    // Populate references for response
    const populatedAssignment = await ProjectAssignments.findById(savedProjectAssignment._id)
      .populate('Assignment')
      .populate('Project')
      .populate('Assignee')
      .populate({
        path: 'Comments',
        populate: { path: 'Author', select: 'Email Role' }
      });

    res.status(201).json(populatedAssignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change ProjectAssignment importance
router.patch('/:id/importance', async (req, res) => {
  try {
    const { id } = req.params;
    const { Important } = req.body;

    if (typeof Important !== 'boolean') {
      return res.status(400).json({ error: 'Important field must be a boolean' });
    }

    const updatedAssignment = await ProjectAssignments.findByIdAndUpdate(
      id,
      { "Important" : Important },
     );

    if (!updatedAssignment) {
      return res.status(404).json({ error: 'ProjectAssignment not found' });
    }

    res.json(updatedAssignment);
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: error.message });
  }
});

// Change ProjectAssignment status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { Status } = req.body;
    
    if (!Status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // First, check if the document exists
    const existingAssignment = await ProjectAssignments.findById(id);
    
    if (!existingAssignment) {
      return res.status(404).json({ error: 'ProjectAssignment not found' });
    }

    // Define status transitions
    let newStatus;
    switch (Status) {
      case 'Pending':
        newStatus = 'In Progress';
        break;
      case 'In Progress':
        newStatus = 'Done';
        break;
      case 'Done':
        newStatus = 'In Progress';
        break;
      default:
        return res.status(400).json({ error: 'Invalid status. Must be Pending, In Progress, or Done' });
    }

    console.log('New status will be:', newStatus);

    const updatedAssignment = await ProjectAssignments.findByIdAndUpdate(
      id,
      { Status: newStatus },
      { new: true, runValidators: true }
    ).populate("Assignment");

    
    if (!updatedAssignment) {
      return res.status(404).json({ error: 'Failed to update ProjectAssignment' });
    }

    res.json(updatedAssignment);
  } catch (error) {
    console.error('Error in status update:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete ProjectAssignment
router.delete('/:id',auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { UserID } = req.body;

    // Find the assignment to ensure it exists
    const assignment = await ProjectAssignments.findById(id).populate('Project');
    if (!assignment) {
      return res.status(404).json({ error: 'ProjectAssignment not found' });
    }

    const UserIsCreator = UserID == assignment.Project.Creator

    if(!UserIsCreator){
      return res.status(401).json({ error: 'You are not the Creator of this Project' });
    }

    // First, delete all comments associated with this assignment
    await Comments.deleteMany({ ProjectAssignment: id });

    // Then delete the assignment itself
    await ProjectAssignments.findByIdAndDelete(id);

    res.json({ 
      message: 'ProjectAssignment and associated comments deleted successfully',
      deletedAssignmentId: id
    });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add comment
router.post('/:id/comments', async (req, res) => {
  try {
    console.log('Project model loaded:', Project);
    const { id } = req.params;
    const { Content, Author } = req.body;

    if (!Content || !Author) {
      return res.status(400).json({ error: 'Content and Author are required' });
    }

    // Verify ProjectAssignment exists
    const projectAssignment = await ProjectAssignments.findById(id);
    if (!projectAssignment) {
    console.log(error)
      return res.status(404).json({ error: 'ProjectAssignment not found' });
    }

    // Verify Author exists
    const authorExists = await Users.findById(Author);
    if (!authorExists) {
    console.log(error)
      return res.status(400).json({ error: 'Author user not found' });
    }

    // Create new comment
    const newComment = new Comments({
      ProjectAssignment: id,
      Author,
      Content
    });

    const savedComment = await newComment.save();

    // Add comment reference to ProjectAssignment
    await ProjectAssignments.findByIdAndUpdate(
      id,
      { $push: { Comments: savedComment._id } }
    );

    // Return updated ProjectAssignment with populated comments
    const updatedAssignment = await ProjectAssignments.findById(id)
      .populate('Assignment Project Assignee')
      .populate({
        path: 'Comments',
        populate: { path: 'Author', select: 'Email Role' }
      });

    res.status(201).json(updatedAssignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
    console.log(error)
  }
});

// Remove comment (soft delete)
router.delete('/:id/comments/:commentId', async (req, res) => {
  try {
    const { id, commentId } = req.params;

    // Verify comment belongs to this ProjectAssignment
    const comment = await Comments.findOne({
      _id: commentId,
      ProjectAssignment: id
    });

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Soft delete the comment
    await Comments.findByIdAndUpdate(commentId, { IsDeleted: true });

    // Remove comment reference from ProjectAssignment
    await ProjectAssignments.findByIdAndUpdate(
      id,
      { $pull: { Comments: commentId } }
    );

    // Return updated ProjectAssignment
    const updatedAssignment = await ProjectAssignments.findById(id)
      .populate('Assignment Project Assignee')
      .populate({
        path: 'Comments',
        match: { IsDeleted: false }, // Only show non-deleted comments
        populate: { path: 'Author', select: 'Email Role' }
      });

    if (!updatedAssignment) {
      return res.status(404).json({ error: 'ProjectAssignment not found' });
    }

    res.json(updatedAssignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edit comment
router.patch('/:id/comments/:commentId', async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { Content } = req.body;

    if (!Content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Verify comment belongs to this ProjectAssignment
    const comment = await Comments.findOne({
      _id: commentId,
      ProjectAssignment: id,
      IsDeleted: false
    });

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Update comment
    const updatedComment = await Comments.findByIdAndUpdate(
      commentId,
      { 
        Content,
        UpdatedAt: new Date(),
        IsEdited: true
      },
      { new: true }
    );

    // Return updated ProjectAssignment
    const updatedAssignment = await ProjectAssignments.findById(id)
      .populate('Assignment Project Assignee')
      .populate({
        path: 'Comments',
        match: { IsDeleted: false },
        populate: { path: 'Author', select: 'Email Role' }
      });

    res.json(updatedAssignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change estimated time
router.patch('/:id/estimated-time', async (req, res) => {
  try {
    const { id } = req.params;
    const { EstimatedTime } = req.body;

    if (!EstimatedTime) {
      return res.status(400).json({ error: 'EstimatedTime is required' });
    }

    const estimatedTimeDate = new Date(EstimatedTime);
    if (isNaN(estimatedTimeDate.getTime())) {
      return res.status(400).json({ error: 'Invalid EstimatedTime format' });
    }

    const updatedAssignment = await ProjectAssignments.findByIdAndUpdate(
      id,
      { EstimatedTime: estimatedTimeDate },
      { new: true, runValidators: true }
    ).populate('Assignment Project Assignee')
     .populate({
       path: 'Comments',
       match: { IsDeleted: false },
       populate: { path: 'Author', select: 'Email Role' }
     });

    if (!updatedAssignment) {
      return res.status(404).json({ error: 'ProjectAssignment not found' });
    }

    res.json(updatedAssignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change recommended start date
router.patch('/:id/recommended-start-date', async (req, res) => {
  try {
    const { id } = req.params;
    const { RecommendedStartDate } = req.body;

    if (!RecommendedStartDate) {
      return res.status(400).json({ error: 'RecommendedStartDate is required' });
    }

    const startDate = new Date(RecommendedStartDate);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'Invalid RecommendedStartDate format' });
    }

    const updatedAssignment = await ProjectAssignments.findByIdAndUpdate(
      id,
      { RecommendedStartDate: startDate },
      { new: true, runValidators: true }
    ).populate('Assignment Project Assignee')
     .populate({
       path: 'Comments',
       match: { IsDeleted: false },
       populate: { path: 'Author', select: 'Email Role' }
     });

    if (!updatedAssignment) {
      return res.status(404).json({ error: 'ProjectAssignment not found' });
    }

    res.json(updatedAssignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change assignee
router.patch('/:id/assignee', async (req, res) => {
  try {
    const { id } = req.params;
    const { Assignee } = req.body;

    if (!Assignee) {
      return res.status(400).json({ error: 'Assignee is required' });
    }

    const userExists = await Users.findById(Assignee);
    if (!userExists) {
      return res.status(400).json({ error: 'Assignee user not found' });
    }

    const updatedAssignment = await ProjectAssignments.findByIdAndUpdate(
      id,
      { Assignee },
      { new: true, runValidators: true }
    ).populate('Assignment Project Assignee')
     .populate({
       path: 'Comments',
       match: { IsDeleted: false },
       populate: { path: 'Author', select: 'Email Role' }
     });

    if (!updatedAssignment) {
      return res.status(404).json({ error: 'ProjectAssignment not found' });
    }

    res.json(updatedAssignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all project assignments with comments
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      important, 
      assignee, 
      project 
    } = req.query;

    const filter = {};
    if (status) filter.Status = status;
    if (important !== undefined) filter.Important = important === 'true';
    if (assignee) filter.Assignee = assignee;
    if (project) filter.Project = project;

    const assignments = await ProjectAssignments.find(filter)
      .populate('Assignment Project Assignee')
      .populate({
        path: 'Comments',
        match: { IsDeleted: false },
        populate: { path: 'Author', select: 'Email Role' },
        options: { sort: { CreatedAt: -1 } }
      })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ RecommendedStartDate: 1 });

    const total = await ProjectAssignments.countDocuments(filter);

    res.json({
      assignments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single project assignment with comments
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const assignment = await ProjectAssignments.findById(id)
      .populate('Assignment Project Assignee')
      .populate({
        path: 'Comments',
        match: { IsDeleted: false },
        populate: { path: 'Author', select: 'Email Role' },
        options: { sort: { CreatedAt: -1 } }
      });

    if (!assignment) {
      return res.status(404).json({ error: 'ProjectAssignment not found' });
    }

    res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bonus: Get all comments for a specific project assignment
// Get all comments for a specific project assignment
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { page, limit, all } = req.query;

    // Verify ProjectAssignment exists
    const projectAssignment = await ProjectAssignments.findById(id);
    if (!projectAssignment) {
      return res.status(404).json({ error: 'ProjectAssignment not found' });
    }

    // If 'all' parameter is present or no pagination params, return all comments
    if (all === 'true' || (!page && !limit)) {
      const comments = await Comments.find({
        ProjectAssignment: id,
        IsDeleted: false
      })
      .populate('Author', 'Email Role')
      .sort({ CreatedAt: -1 });

      return res.json({
        comments,
        total: comments.length,
        paginated: false
      });
    }

    // Otherwise, use pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;

    const comments = await Comments.find({
      ProjectAssignment: id,
      IsDeleted: false
    })
    .populate('Author', 'Email Role')
    .sort({ CreatedAt: -1 })
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

    const total = await Comments.countDocuments({
      ProjectAssignment: id,
      IsDeleted: false
    });

    res.json({
      comments,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total,
      paginated: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;