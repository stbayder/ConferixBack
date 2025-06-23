const express = require('express');
const router = express.Router();
const Assignments = require('../models/Assignment');
const AssignmentComments = require("../models/AssignmentComment"); // Changed from Comments to AssignmentComments
const User = require('../models/User');
const { Likes, likeHelpers } = require('../models/Like');
const { auth } = require('../utils/auth');
const mongoose = require('mongoose');

// GET /api/assignments - Get all assignments with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      search = '',
      step = '', // Changed from category to step
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

    // Step filter - filter by Step field
    if (step) {
      filter.Step = { $regex: step, $options: 'i' };
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
        const commentCount = await AssignmentComments.countDocuments({
          assignmentId: assignment._id,
          status: 'active'
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

// GET /api/assignments/steps - Get all unique steps for filtering
router.get('/steps', async (req, res) => {
  try {
    const steps = await Assignments.distinct('Step');
    res.json(steps.filter(step => step)); // Remove null/undefined values
  } catch (error) {
    console.error('Error fetching assignment steps:', error);
    res.status(500).json({
      message: 'Error fetching assignment steps',
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

    const stepStats = await Assignments.aggregate([
      {
        $group: {
          _id: '$Step',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
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
      stepBreakdown: stepStats,
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
    const { userId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid assignment ID' });
    }

    // Validate userId if provided
    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const assignment = await Assignments.findById(id);
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get top-level comments for this assignment (only active ones)
    const topLevelComments = await AssignmentComments.find({ 
      assignmentId: id,
      status: 'active',
      parentCommentId: null
    })
    .populate('AuthorId', 'Email')
    .populate('likesCount')
    .sort({ createdAt: -1 });

    // Get replies for each top-level comment
    const commentsWithReplies = await Promise.all(
      topLevelComments.map(async (comment) => {
        const replies = await AssignmentComments.find({
          parentCommentId: comment._id,
          status: 'active'
        })
        .populate('AuthorId', 'Email')
        .sort({ createdAt: 1 });

        return {
          ...comment.toObject(),
          replies
        };
      })
    );

    // If userId is provided, add like status to comments and replies
    let finalComments = commentsWithReplies;
    if (userId) {
      // Collect all comment IDs (top-level + replies)
      const allCommentIds = [];
      commentsWithReplies.forEach(comment => {
        allCommentIds.push(comment._id);
        comment.replies.forEach(reply => {
          allCommentIds.push(reply._id);
        });
      });

      // Get all likes for this user on these comments in one query
      const userLikes = await Likes.find({ 
        userId, 
        commentId: { $in: allCommentIds } 
      });

      const likedCommentIds = new Set(
        userLikes.map(like => like.commentId.toString())
      );

      // Add hasLiked property to each comment and reply
      finalComments = commentsWithReplies.map(comment => ({
        ...comment,
        hasLiked: likedCommentIds.has(comment._id.toString()),
        replies: comment.replies.map(reply => ({
          ...reply.toObject(),
          hasLiked: likedCommentIds.has(reply._id.toString())
        }))
      }));
    }

    const totalCommentCount = await AssignmentComments.countDocuments({
      assignmentId: id,
      status: 'active'
    });

    res.json({
      assignment: assignment.toObject(),
      comments: finalComments,
      commentCount: totalCommentCount
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

    if (filters.steps && filters.steps.length > 0) {
      query.Step = { $in: filters.steps };
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

// COMMENTS CRUD OPERATIONS

// GET /api/assignments/:id/comments - Get comments for a specific assignment
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, type = '', userId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid assignment ID' });
    }
    console.log(userId)
    // Validate userId if provided
    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Build base filter for top-level comments only
    let filter = { 
      assignmentId: id,
      status: 'active',
      parentCommentId: null, // Only get top-level comments
    };

    if (type) {
      filter.type = type;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get top-level comments with pagination and populate author
    const topLevelComments = await AssignmentComments.find(filter)
      .populate('AuthorId', 'Email')
      .populate('likesCount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get replies for each top-level comment
    const commentsWithReplies = await Promise.all(
      topLevelComments.map(async (comment) => {
        const replies = await AssignmentComments.find({
          parentCommentId: comment._id,
          status: 'active'
        })
        .populate('AuthorId', 'Email')
        .sort({ createdAt: 1 });

        return {
          ...comment.toObject(),
          replies
        };
      })
    );

    // If userId is provided, add like status to comments and replies
    let finalComments = commentsWithReplies;
    if (userId) {
      console.log(userId)
      // Collect all comment IDs (top-level + replies)
      const allCommentIds = [];
      commentsWithReplies.forEach(comment => {
        allCommentIds.push(comment._id);
        comment.replies.forEach(reply => {
          allCommentIds.push(reply._id);
        });
      });

      // Get all likes for this user on these comments in one query
      const userLikes = await Likes.find({ 
        userId, 
        commentId: { $in: allCommentIds } 
      });

      const likedCommentIds = new Set(
        userLikes.map(like => like.commentId.toString())
      );

      // Add hasLiked property to each comment and reply
      finalComments = commentsWithReplies.map(comment => ({
        ...comment,
        hasLiked: likedCommentIds.has(comment._id.toString()),
        replies: comment.replies.map(reply => ({
          ...reply.toObject(),
          hasLiked: likedCommentIds.has(reply._id.toString())
        }))
      }));
    }

    // Count only top-level comments for pagination
    const totalCount = await AssignmentComments.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      comments: finalComments,
      currentPage: pageNum,
      totalPages,
      totalCount,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    });

  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({
      message: 'Error fetching comments',
      error: error.message
    });
  }
});

// POST /api/assignments/:id/comments - Create a new comment
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, text, type = 'comment', authorId, parentCommentId = null } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid assignment ID' });
    }

    const assignment = await Assignments.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    const author = await User.findById(authorId);
    if (authorId && !author) {
      return res.status(404).json({ message: 'Author not found' });
    }

    if (parentCommentId) {
      if (!mongoose.Types.ObjectId.isValid(parentCommentId)) {
        return res.status(400).json({ message: 'Invalid parent comment ID' });
      }

      const parentComment = await AssignmentComments.findById(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({ message: 'Parent comment not found' });
      }
    }

    if (!text) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const newComment = new AssignmentComments({
      assignmentId: id,
      AuthorId: authorId,
      title,
      text,
      type,
      parentCommentId,
      status: 'active'
      // Remove likesCount: 0 - this is handled by the virtual field
    });

    const savedComment = await newComment.save();

    // Populate both the author and the likesCount virtual field
    const populatedComment = await AssignmentComments.findById(savedComment._id)
      .populate('AuthorId', 'Email')
      .populate('likesCount');

    // If this is a top-level comment, add empty replies array
    // If this is a reply, just return the comment
    const responseComment = {
      ...populatedComment.toObject(),
      replies: parentCommentId ? undefined : []
    };

    res.status(201).json(responseComment);

  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({
      message: 'Error creating comment',
      error: error.message
    });
  }
});

// PUT /api/assignments/:assignmentId/comments/:commentId - Update a comment
router.put('/:assignmentId/comments/:commentId', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { title, text, type } = req.body;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: 'Invalid comment ID' });
    }

    const updatedComment = await AssignmentComments.findByIdAndUpdate(
      commentId,
      { title, text, type },
      { new: true, runValidators: true }
    ).populate('AuthorId', 'Email').populate('likesCount');

    if (!updatedComment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // If this is a top-level comment, include replies
    if (!updatedComment.parentCommentId) {
      const replies = await AssignmentComments.find({
        parentCommentId: commentId,
        status: 'active'
      })
      .populate('AuthorId', 'Email')
      .sort({ createdAt: 1 });

      const commentWithReplies = {
        ...updatedComment.toObject(),
        replies
      };

      res.json(commentWithReplies);
    } else {
      res.json(updatedComment);
    }

  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({
      message: 'Error updating comment',
      error: error.message
    });
  }
});

// DELETE /api/assignments/:assignmentId/comments/:commentId - Soft delete a comment
router.delete('/:assignmentId/comments/:commentId', auth, async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: 'Invalid comment ID' });
    }

    const deletedComment = await AssignmentComments.findByIdAndUpdate(
      commentId,
      { status: 'deleted' },
      { new: true }
    );

    if (!deletedComment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    res.json({ message: 'Comment deleted successfully' });

  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({
      message: 'Error deleting comment',
      error: error.message
    });
  }
});

// PUT /api/assignments/:assignmentId/comments/:commentId/like - Toggle like on a comment
router.put('/:assignmentId/comments/:commentId/like', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id; // Get userId from auth middleware

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: 'Invalid comment ID' });
    }

    const comment = await AssignmentComments.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Use the likeHelpers to toggle the like
    const result = await likeHelpers.toggleLike(userId, commentId);

    // Get the updated comment with current like count
    const updatedComment = await AssignmentComments.findById(commentId)
      .populate('AuthorId', 'Email').populate('likesCount');

    // Add hasLiked status to the response
    const commentResponse = {
      ...updatedComment.toObject(),
      hasLiked: result.liked
    };

    // If this is a top-level comment, include replies with their like status
    if (!updatedComment.parentCommentId) {
      const replies = await AssignmentComments.find({
        parentCommentId: commentId,
        status: 'active'
      })
      .populate('AuthorId', 'Email')
      .sort({ createdAt: 1 });

      // Add like status to each reply
      const repliesWithLikeStatus = await Promise.all(
        replies.map(async (reply) => {
          const hasLiked = await likeHelpers.hasUserLiked(userId, reply._id);
          return {
            ...reply.toObject(),
            hasLiked
          };
        })
      );

      commentResponse.replies = repliesWithLikeStatus;
    }

    res.json({
      comment: commentResponse,
      message: result.message,
      liked: result.liked
    });

  } catch (error) {
    console.error('Error toggling comment like:', error);
    res.status(500).json({
      message: 'Error toggling comment like',
      error: error.message
    });
  }
});
// GET /api/assignments/:assignmentId/comments/:commentId/replies - Get replies for a specific comment
router.get('/:assignmentId/comments/:commentId/replies', async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: 'Invalid comment ID' });
    }

    const replies = await AssignmentComments.find({
      parentCommentId: commentId,
      status: 'active'
    })
    .populate('AuthorId', 'Email')
    .populate('likesCount')
    .sort({ createdAt: 1 });

    res.json(replies);

  } catch (error) {
    console.error('Error fetching replies:', error);
    res.status(500).json({
      message: 'Error fetching replies',
      error: error.message
    });
  }
});

// GET /api/assignments/:assignmentId/comments/:commentId - Get a single comment with replies
router.get('/:assignmentId/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: 'Invalid comment ID' });
    }

    const comment = await AssignmentComments.findById(commentId)
      .populate('AuthorId', 'Email')
      .populate('likesCount');

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Get replies if this is a top-level comment
    if (!comment.parentCommentId) {
      const replies = await AssignmentComments.find({
        parentCommentId: commentId,
        status: 'active'
      })
      .populate('AuthorId', 'Email')
      .populate('likesCount')
      .sort({ createdAt: 1 });

      const commentWithReplies = {
        ...comment.toObject(),
        replies
      };

      res.json(commentWithReplies);
    } else {
      res.json(comment);
    }

  } catch (error) {
    console.error('Error fetching comment:', error);
    res.status(500).json({
      message: 'Error fetching comment',
      error: error.message
    });
  }
});

module.exports = router;