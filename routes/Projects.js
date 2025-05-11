const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Project = mongoose.model('Projects');
const User = mongoose.model('Users');
const { auth } = require('../middleware/auth');

/**
 * Create new project with simplified required parameters
 * POST /api/projects
 */
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      date,
      type,
      budget = 0
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'שם הפרויקט הוא שדה חובה' });
    }
    
    if (!date) {
      return res.status(400).json({ error: 'תאריך הפרויקט הוא שדה חובה' });
    }
    
    if (!type || (Array.isArray(type) && type.length === 0)) {
      return res.status(400).json({ error: 'סוג הפרויקט הוא שדה חובה' });
    }

    // Create new project with simplified parameters
    const project = new Project({
      name,
      date: new Date(date),
      Creator: req.user._id,
      Type: Array.isArray(type) ? type : [type],
      Budget: budget,
      Editors: [], // Start with no editors
      Assignments: [] // Start with no assignments
    });

    await project.save();
    res.status(201).json(project);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'אירעה שגיאה ביצירת הפרויקט' });
  }
});

/**
 * Get all projects for current user
 * GET /api/projects
 */
router.get('/', auth, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { Creator: req.user._id },
        { Editors: req.user._id }
      ]
    }).populate('Creator', 'Email');
    
    res.json(projects);
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
    const project = await Project.findById(req.params.id)
      .populate('Creator', 'Email')
      .populate('Editors', 'Email')
      .populate('Assignments');
    
    if (!project) {
      return res.status(404).json({ error: 'הפרויקט לא נמצא' });
    }
    
    // Check if user has access to this project
    if (!project.Creator.equals(req.user._id) && !project.Editors.some(editor => editor._id.equals(req.user._id))) {
      return res.status(403).json({ error: 'אין הרשאה לגשת לפרויקט זה' });
    }
    
    res.json(project);
  } catch (err) {
    console.error('Error fetching project:', err);
    res.status(500).json({ error: 'אירעה שגיאה בטעינת הפרויקט' });
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

    // Add editor to project
    project.Editors.push(editorId);
    await project.save();

    res.json(project);
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
    res.json(project);
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
    );

    res.json(updatedProject);
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'אירעה שגיאה בעדכון הפרויקט' });
  }
});

/**
 * Delete project
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

    // Delete the project
    await Project.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'הפרויקט נמחק בהצלחה' });
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'אירעה שגיאה במחיקת הפרויקט' });
  }
});

module.exports = router;