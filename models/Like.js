const mongoose = require('mongoose');
const AssignmentComments = require('./AssignmentComment');

const LikeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users',
    required: true
  },
  commentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AssignmentComments',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { collection: 'Likes' });

// Ensure a user can only like a comment once
LikeSchema.index({ userId: 1, commentId: 1 }, { unique: true });

const Likes = mongoose.model('Likes', LikeSchema);

// Helper functions for like operations
const likeHelpers = {
  // Toggle like for a comment
  async toggleLike(userId, commentId) {
    try {
      const existingLike = await Likes.findOne({ userId, commentId });
      
      if (existingLike) {
        // Unlike: remove the like and decrement counter
        await Likes.deleteOne({ userId, commentId });
        await AssignmentComments.findByIdAndUpdate(
          commentId, 
          { $inc: { likesCount: -1 } }
        );
        return { liked: false, message: 'Comment unliked' };
      } else {
        // Like: add the like and increment counter
        await Likes.create({ userId, commentId });
        await AssignmentComments.findByIdAndUpdate(
          commentId, 
          { $inc: { likesCount: 1 } }
        );
        return { liked: true, message: 'Comment liked' };
      }
    } catch (error) {
      throw new Error('Error toggling like: ' + error.message);
    }
  },

  // Check if user has liked a comment
  async hasUserLiked(userId, commentId) {
    try {
      const like = await Likes.findOne({ userId, commentId });
      return !!like;
    } catch (error) {
      throw new Error('Error checking like status: ' + error.message);
    }
  },

  // Get comments with like status for a specific user
  async getCommentsWithLikeStatus(assignmentId, userId) {
    try {
      const comments = await AssignmentComments.find({ 
        assignmentId, 
        status: 'active' 
      }).populate('AuthorId', 'name email');

      // Get all likes for this user on these comments
      const commentIds = comments.map(comment => comment._id);
      const userLikes = await Likes.find({ 
        userId, 
        commentId: { $in: commentIds } 
      });

      const likedCommentIds = new Set(
        userLikes.map(like => like.commentId.toString())
      );

      // Add hasLiked property to each comment
      const commentsWithLikeStatus = comments.map(comment => ({
        ...comment.toObject(),
        hasLiked: likedCommentIds.has(comment._id.toString())
      }));

      return commentsWithLikeStatus;
    } catch (error) {
      throw new Error('Error fetching comments with like status: ' + error.message);
    }
  }
};

module.exports = {
  Likes,
  likeHelpers
};