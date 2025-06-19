const express = require('express');
const router = express.Router();
const Assignments = require('../models/Assignment'); // Updated to use Assignment model
const Comments = require('../models/Comment');
const { auth } = require('../utils/auth');
const mongoose = require('mongoose');

// GET /api/assignments - Get all assignments with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      search = '',
      category = '',
      status = '',
      comments = '',
      page = 1,
      limit = 20
    } = req.query;

    // Build the filter object
    let filter = {};

    // Search filter - search in Assignment and Step fields
    if (search) {
      filter.$or = [
        { Assignment: { $regex: search, $options: 'i' } },
        { Step: { $regex: search, $options: 'i' } }
      ];
    }

    // Category filter - search in Type array
    if (category) {
      filter.Type = { $in: [category] };
    }

    // Status filter
    if (status) {
      filter.Status = status;
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get assignments with basic filtering
    let assignmentsQuery = Assignments.find(filter)
      .sort({ Step: 1, Assignment: 1 })
      .skip(skip)
      .limit(limitNum);

    const assignments = await assignmentsQuery.exec();

    // Get comment counts for each assignment
    const assignmentsWithComments = await Promise.all(
      assignments.map(async (assignment) => {
        const commentCount = await Comments.countDocuments({
          assignmentId: assignment._id
        });
        
        return {
          ...assignment.toObject(),
          commentCount
        };
      })
    );

    // Apply comments filter after getting comment counts
    let filteredAssignments = assignmentsWithComments;
    if (comments) {
      switch (comments) {
        case 'has-comments':
          filteredAssignments = assignmentsWithComments.filter(a => a.commentCount > 0);
          break;
        case 'no-comments':
          filteredAssignments = assignmentsWithComments.filter(a => a.commentCount === 0);
          break;
        case 'many-comments':
          filteredAssignments = assignmentsWithComments.filter(a => a.commentCount >= 5);
          break;
      }
    }

    // Get total count for pagination (without comment filtering for now)
    const totalCount = await Assignments.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      assignments: filteredAssignments,
      currentPage: pageNum,
      totalPages,
      totalCount: filteredAssignments.length,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    });

  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({
      message: 'Error fetching assignments',
      error: error.message
    });
  }
});

// GET /api/assignments/types - Get all unique types for filtering
router.get('/types', async (req, res) => {
  try {
    const types = await Assignments.distinct('Type');
    res.json(types.filter(type => type)); // Remove null/undefined values
  } catch (error) {
    console.error('Error fetching assignment types:', error);
    res.status(500).json({
      message: 'Error fetching assignment types',
      error: error.message
    });
  }
});

// GET /api/assignments/stats - Get assignment statistics
router.get('/stats', async (req, res) => {
  try {
    const totalAssignments = await Assignments.countDocuments();
    const ongoingAssignments = await Assignments.countDocuments({ IsOngoing: true });
    const dayOfAssignments = await Assignments.countDocuments({ IsDayOf: true });
    
    const statusStats = await Assignments.aggregate([
      {
        $group: {
          _id: '$Status',
          count: { $sum: 1 }
        }
      }
    ]);

    const typeStats = await Assignments.aggregate([
      { $unwind: '$Type' },
      {
        $group: {
          _id: '$Type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      total: totalAssignments,
      ongoing: ongoingAssignments,
      dayOf: dayOfAssignments,
      statusBreakdown: statusStats,
      typeBreakdown: typeStats
    });

  } catch (error) {
    console.error('Error fetching assignment stats:', error);
    res.status(500).json({
      message: 'Error fetching assignment statistics',
      error: error.message
    });
  }
});

// GET /api/assignments/:id - Get single assignment with comments
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid assignment ID' });
    }

    const assignment = await Assignments.findById(id);
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get comments for this assignment
    const comments = await Comments.find({ assignmentId: id })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      assignment: assignment.toObject(),
      comments,
      commentCount: comments.length
    });

  } catch (error) {
    console.error('Error fetching assignment:', error);
    res.status(500).json({
      message: 'Error fetching assignment',
      error: error.message
    });
  }
});

// POST /api/assignments - Create new assignment (protected route)
router.post('/', auth, async (req, res) => {
  try {
    const {
      Step,
      Assignment,
      EstimatedTime,
      RecommendedStartOffset,
      IsOngoing = false,
      IsDayOf = false,
      Type = [],
      Status = 'pending'
    } = req.body;

    // Validation
    if (!Step || !Assignment) {
      return res.status(400).json({
        message: 'Step and Assignment are required fields'
      });
    }

    const newAssignment = new Assignments({
      Step,
      Assignment,
      EstimatedTime,
      RecommendedStartOffset,
      IsOngoing,
      IsDayOf,
      Type,
      Status
    });

    const savedAssignment = await newAssignment.save();
    res.status(201).json(savedAssignment);

  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({
      message: 'Error creating assignment',
      error: error.message
    });
  }
});

// PUT /api/assignments/:id - Update assignment (protected route)
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid assignment ID' });
    }

    const updatedAssignment = await Assignments.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedAssignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json(updatedAssignment);

  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({
      message: 'Error updating assignment',
      error: error.message
    });
  }
});


// Advanced search endpoint with more complex filtering
router.post('/search', async (req, res) => {
  try {
    const {
      searchTerm,
      filters = {},
      sortBy = 'Step',
      sortOrder = 'asc',
      page = 1,
      limit = 20
    } = req.body;

    let query = {};

    // Advanced text search
    if (searchTerm) {
      query.$or = [
        { Assignment: { $regex: searchTerm, $options: 'i' } },
        { Step: { $regex: searchTerm, $options: 'i' } },
        { Type: { $in: [new RegExp(searchTerm, 'i')] } }
      ];
    }

    // Apply additional filters
    if (filters.status && filters.status.length > 0) {
      query.Status = { $in: filters.status };
    }

    if (filters.types && filters.types.length > 0) {
      query.Type = { $in: filters.types };
    }

    if (filters.isOngoing !== undefined) {
      query.IsOngoing = filters.isOngoing;
    }

    if (filters.isDayOf !== undefined) {
      query.IsDayOf = filters.isDayOf;
    }

    if (filters.estimatedTimeRange) {
      const { min, max } = filters.estimatedTimeRange;
      query.EstimatedTime = {};
      if (min !== undefined) query.EstimatedTime.$gte = min;
      if (max !== undefined) query.EstimatedTime.$lte = max;
    }

    // Sorting
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const assignments = await Assignments.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum);

    const totalCount = await Assignments.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      assignments,
      currentPage: pageNum,
      totalPages,
      totalCount,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    });

  } catch (error) {
    console.error('Error in advanced search:', error);
    res.status(500).json({
      message: 'Error performing search',
      error: error.message
    });
  }
});

module.exports = router;