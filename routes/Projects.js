const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Project = mongoose.model('Projects');
const User = mongoose.model('Users');
const Assignment = require('../models/Assignment');
const ProjectAssignment = require('../models/ProjectAssignment');
const Comments = require('../models/Comment'); // Add Comments model
const { auth } = require('../utils/auth');

/**
 * Create new project with simplified required parameters
 * POST /api/projects
 */
router.post('/', auth, async (req, res) => {
  try {
    const { name, date, type, budget = 0 } = req.body;

    // Validate required fields
    if (!name) return res.status(400).json({ error: 'שם הפרויקט הוא שדה חובה' });
    if (!date) return res.status(400).json({ error: 'תאריך הפרויקט הוא שדה חובה' });
    if (!type || (Array.isArray(type) && type.length === 0))
      return res.status(400).json({ error: 'סוג הפרויקט הוא שדה חובה' });

    const projectTypeArray = Array.isArray(type) ? type : [type];
    const projectDate = new Date(date);

    // Create the project
    const project = new Project({
      name,
      date: projectDate,
      Creator: req.user._id,
      Type: projectTypeArray,
      Budget: budget,
      Editors: [],
      Assignments: []
    });

    await project.save();

    // Find matching assignments where all project types exist in the assignment Type array
    const assignments = await Assignment.find({
      Type: { $all: projectTypeArray }
    });

  const projectAssignments = assignments.map(assignment => {
    let startDate;
    let dueDate = null;
    let estimatedTime = null;

    if (assignment.IsDayOf) {
      // For day-of assignments, start date is the project date
      startDate = new Date(projectDate);
      dueDate = new Date(projectDate);
      estimatedTime = assignment.EstimatedTime ? new Date(startDate.getTime() + assignment.EstimatedTime * 60 * 60 * 1000) : null;
    } else if (assignment.IsOngoing) {
      // For ongoing assignments, start date is the project date, no specific due date
      startDate = new Date(projectDate);
      dueDate = null;
      estimatedTime = null;
    } else {
      // For regular assignments, calculate start date using RecommendedStartOffset (X days before project date)
      const offsetDays = assignment.RecommendedStartOffset || 0;
      startDate = new Date(projectDate);
      startDate.setDate(startDate.getDate() - offsetDays);

      if (assignment.EstimatedTime) {
        // Calculate due date based on start date + estimated time
        dueDate = new Date(startDate.getTime() + assignment.EstimatedTime * 60 * 60 * 1000);
        estimatedTime = new Date(startDate.getTime() + assignment.EstimatedTime * 60 * 60 * 1000);
      } else {
        // No estimated time provided, set due date to start date
        dueDate = new Date(startDate);
        estimatedTime = null;
      }
    }

    return {
      Assignment: assignment._id,
      Project: project._id,
      Assignee: null, // not assigned yet
      EstimatedTime: estimatedTime,
      RecommendedStartDate: startDate,
      DueDate: dueDate,
      Comments: [], // Initialize empty comments array (will contain Comment ObjectIds)
      Important: assignment.IsDayOf || false,
      Status: 'Pending'
    };
  });
    const insertedAssignments = await ProjectAssignment.insertMany(projectAssignments);

    // Update the project with linked assignment IDs
    project.Assignments = insertedAssignments.map(pa => pa._id);
    await project.save();
        res.status(201).json(project);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'אירעה שגיאה ביצירת הפרויקט' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { includeComments = false } = req.query;

    let populateOptions = {
      path: 'Assignments',
      model: 'ProjectAssignments',
      populate: [
        {
          path: 'Assignment',
          model: 'Assignments'
        },
        {
          path: 'Assignee',
          model: 'Users',
          select: 'Email Role'
        }
      ]
    };

    // Add comment population if requested
    if (includeComments === 'true') {
      populateOptions.populate.push({
        path: 'Comments',
        model: 'Comments',
        match: { IsDeleted: false },
        populate: {
          path: 'Author',
          model: 'Users',
          select: 'Email Role'
        },
        options: { sort: { CreatedAt: -1 } }
      });
    }

    // Step 1: Find all ProjectAssignments where user is the assignee
    const userAssignments = await ProjectAssignment.find({ 
      Assignee: req.user._id 
    }).select('_id');
    
    const userAssignmentIds = userAssignments.map(assignment => assignment._id);

    // Step 2: Find projects where user is Creator, Editor, OR has assignments
    const projects = await Project.find({
      $or: [
        { Creator: req.user._id },
        { Editors: req.user._id },
        { Assignments: { $in: userAssignmentIds } }
      ]
    })
    .populate('Creator', 'Email')
    .populate('Editors', 'Email')
    .populate(populateOptions);

    // Step 3: Filter assignments based on user permissions
    const filteredProjects = projects.map(project => {
      const projectObj = project.toObject();
      
      // Check if user is creator
      const isCreator = project.Creator._id.toString() === req.user._id.toString();
      
      if (isCreator) {
        // Creators see all assignments
        return projectObj;
      } else {
        // Editors and assignees only see their own assignments
        projectObj.Assignments = project.Assignments.filter(assignment => 
          assignment.Assignee && assignment.Assignee._id.toString() === req.user._id.toString()
        );
        return projectObj;
      }
    });

    // Step 4: Remove projects with no assignments for non-creator users
    const finalProjects = filteredProjects.filter(project => {
      const isCreator = project.Creator._id.toString() === req.user._id.toString();
      
      // Always include if user is creator
      if (isCreator) {
        return true;
      }
      
      // Only include if user has assignments in this project (for editors and assignees)
      return project.Assignments && project.Assignments.length > 0;
    });
    
    res.json(finalProjects);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'אירעה שגיאה בטעינת הפרויקטים' });
  }
});

/**
 * Get a specific project
 * GET /api/projects/:id
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { includeComments = true } = req.query; // Default to true for single project view

    let populateOptions = {
      path: 'Assignments',
      model: 'ProjectAssignments',
      populate: [
        {
          path: 'Assignment',
          model: 'Assignments'
        },
        {
          path: 'Assignee',
          model: 'Users',
          select: 'Email Role'
        }
      ]
    };

    // Add comment population if requested
    if (includeComments === 'true' || includeComments === true) {
      populateOptions.populate.push({
        path: 'Comments',
        model: 'Comments',
        match: { IsDeleted: false },
        populate: {
          path: 'Author',
          model: 'Users',
          select: 'Email Role'
        },
        options: { sort: { CreatedAt: -1 } }
      });
    }

    // Step 1: Find user assignments for this project
    const userAssignments = await ProjectAssignment.find({ 
      Assignee: req.user._id 
    }).select('_id');
    
    const userAssignmentIds = userAssignments.map(assignment => assignment._id);

    // Step 2: Find the project with access check
    const project = await Project.findOne({
      _id: req.params.id,
      $or: [
        { Creator: req.user._id },
        { Editors: req.user._id },
        { Assignments: { $in: userAssignmentIds } }
      ]
    })
    .populate('Creator', 'Email')
    .populate('Editors', 'Email')
    .populate(populateOptions);
    
    if (!project) {
      return res.status(404).json({ error: 'הפרויקט לא נמצא או שאין הרשאה לגשת אליו' });
    }
    
    // Step 3: Filter assignments based on user permissions
    const projectObj = project.toObject();
    
    // Check if user is creator
    const isCreator = project.Creator._id.toString() === req.user._id.toString();
    
    if (isCreator) {
      // Creators see all assignments
      // projectObj already has all assignments, no filtering needed
    } else {
      // Editors and assignees only see their own assignments
      projectObj.Assignments = project.Assignments.filter(assignment => 
        assignment.Assignee && assignment.Assignee._id.toString() === req.user._id.toString()
      );
    }
    
    res.json(projectObj);
  } catch (err) {
    console.error('Error fetching project:', err);
    res.status(500).json({ error: 'אירעה שגיאה בטעינת הפרויקט' });
  }
});

/**
 * Get project statistics including comment counts
 * GET /api/projects/:id/stats
 */
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({ error: 'הפרויקט לא נמצא' });
    }
    
    // Check if user has access to this project
    if (!project.Creator.equals(req.user._id) && !project.Editors.some(editor => editor._id.equals(req.user._id))) {
      return res.status(403).json({ error: 'אין הרשאה לגשת לפרויקט זה' });
    }

    // Get project assignments
    const projectAssignments = await ProjectAssignment.find({
      Project: req.params.id
    });

    const assignmentIds = projectAssignments.map(pa => pa._id);

    // Get comment statistics
    const commentStats = await Comments.aggregate([
      {
        $match: {
          ProjectAssignment: { $in: assignmentIds },
          IsDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalComments: { $sum: 1 },
          commentsThisWeek: {
            $sum: {
              $cond: [
                {
                  $gte: ['$CreatedAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Assignment status statistics
    const assignmentStats = projectAssignments.reduce((acc, assignment) => {
      acc[assignment.Status] = (acc[assignment.Status] || 0) + 1;
      return acc;
    }, {});

    const stats = {
      totalAssignments: projectAssignments.length,
      assignmentsByStatus: assignmentStats,
      totalComments: commentStats[0]?.totalComments || 0,
      commentsThisWeek: commentStats[0]?.commentsThisWeek || 0,
      importantAssignments: projectAssignments.filter(a => a.Important).length
    };

    res.json(stats);
  } catch (err) {
    console.error('Error fetching project stats:', err);
    res.status(500).json({ error: 'אירעה שגיאה בטעינת סטטיסטיקות הפרויקט' });
  }
});

/**
 * Get recent comments for a project
 * GET /api/projects/:id/recent-comments
 */
router.get('/:id/recent-comments', auth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({ error: 'הפרויקט לא נמצא' });
    }
    
    // Check if user has access to this project
    if (!project.Creator.equals(req.user._id) && !project.Editors.some(editor => editor._id.equals(req.user._id))) {
      return res.status(403).json({ error: 'אין הרשאה לגשת לפרויקט זה' });
    }

    // Get project assignments
    const projectAssignments = await ProjectAssignment.find({
      Project: req.params.id
    });

    const assignmentIds = projectAssignments.map(pa => pa._id);

    // Get recent comments
    const recentComments = await Comments.find({
      ProjectAssignment: { $in: assignmentIds },
      IsDeleted: false
    })
    .populate('Author', 'Email Role')
    .populate({
      path: 'ProjectAssignment',
      populate: {
        path: 'Assignment',
        select: 'Assignment Step'
      }
    })
    .sort({ CreatedAt: -1 })
    .limit(parseInt(limit));

    res.json(recentComments);
  } catch (err) {
    console.error('Error fetching recent comments:', err);
    res.status(500).json({ error: 'אירעה שגיאה בטעינת תגובות אחרונות' });
  }
});

/**
 * Add editor to project
 * POST /api/projects/:id/editors
 */
router.post('/:id/editors', auth, async (req, res) => {
  try {
    const { editorId } = req.body;
    
    if (!editorId) {
      return res.status(400).json({ error: 'נדרש מזהה עורך' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'הפרויקט לא נמצא' });
    }

    // Check if user is the creator of the project
    if (!project.Creator.equals(req.user._id)) {
      return res.status(403).json({ error: 'רק יוצר הפרויקט יכול להוסיף עורכים' });
    }

    // Check if editor is already added
    if (project.Editors.includes(editorId)) {
      return res.status(400).json({ error: 'המשתמש כבר מוגדר כעורך בפרויקט זה' });
    }

    // Verify that the editor user exists
    const editorUser = await User.findById(editorId);
    if (!editorUser) {
      return res.status(400).json({ error: 'המשתמש לא נמצא' });
    }

    // Add editor to project
    project.Editors.push(editorId);
    await project.save();

    // Return updated project with populated editors
    const updatedProject = await Project.findById(req.params.id)
      .populate('Creator', 'Email')
      .populate('Editors', 'Email');

    res.json(updatedProject);
  } catch (err) {
    console.error('Error adding editor to project:', err);
    res.status(500).json({ error: 'אירעה שגיאה בהוספת עורך לפרויקט' });
  }
});

/**
 * Remove editor from project
 * DELETE /api/projects/:id/editors/:editorId
 */
router.delete('/:id/editors/:editorId', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'הפרויקט לא נמצא' });
    }

    // Check if user is the creator of the project
    if (!project.Creator.equals(req.user._id)) {
      return res.status(403).json({ error: 'רק יוצר הפרויקט יכול להסיר עורכים' });
    }

    // Remove editor from project
    project.Editors = project.Editors.filter(
      editor => editor.toString() !== req.params.editorId
    );
    
    await project.save();
    
    // Return updated project with populated editors
    const updatedProject = await Project.findById(req.params.id)
      .populate('Creator', 'Email')
      .populate('Editors', 'Email');
    
    res.json(updatedProject);
  } catch (err) {
    console.error('Error removing editor from project:', err);
    res.status(500).json({ error: 'אירעה שגיאה בהסרת עורך מהפרויקט' });
  }
});

/**
 * Update project parameters
 * PATCH /api/projects/:id
 */
router.patch('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'הפרויקט לא נמצא' });
    }

    // Check if user has permission to edit this project
    if (!project.Creator.equals(req.user._id) && !project.Editors.some(
      editor => editor.toString() === req.user._id.toString()
    )) {
      return res.status(403).json({ error: 'אין הרשאה לערוך פרויקט זה' });
    }

    const updateFields = {};
    const allowedFields = ['name', 'date', 'Type', 'Budget', 'Area', 'Venue', 'AmountOfPeople'];
    
    // Only update fields that are provided
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'date') {
          updateFields[field] = new Date(req.body[field]);
        } else if (field === 'Type' && !Array.isArray(req.body[field])) {
          updateFields[field] = req.body[field] ? [req.body[field]] : [];
        } else {
          updateFields[field] = req.body[field];
        }
      }
    });

    // Update the project
    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    )
    .populate('Creator', 'Email')
    .populate('Editors', 'Email');

    res.json(updatedProject);
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'אירעה שגיאה בעדכון הפרויקט' });
  }
});

/**
 * Delete project and all associated data
 * DELETE /api/projects/:id
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'הפרויקט לא נמצא' });
    }

    // Check if user is the creator of the project
    if (!project.Creator.equals(req.user._id)) {
      return res.status(403).json({ error: 'רק יוצר הפרויקט יכול למחוק אותו' });
    }

    // Get all project assignments for this project
    const projectAssignments = await ProjectAssignment.find({ Project: req.params.id });
    const assignmentIds = projectAssignments.map(pa => pa._id);

    // Delete all comments associated with project assignments
    if (assignmentIds.length > 0) {
      await Comments.deleteMany({
        ProjectAssignment: { $in: assignmentIds }
      });
    }

    // Delete all project assignments
    await ProjectAssignment.deleteMany({ Project: req.params.id });

    // Delete the project
    await Project.findByIdAndDelete(req.params.id);
    
    res.json({ 
      message: 'הפרויקט נמחק בהצלחה',
      deletedComments: assignmentIds.length > 0 ? await Comments.countDocuments({
        ProjectAssignment: { $in: assignmentIds }
      }) : 0,
      deletedAssignments: projectAssignments.length
    });
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'אירעה שגיאה במחיקת הפרויקט' });
  }
});

module.exports = router;