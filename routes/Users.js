const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { auth } = require('../utils/auth');

// Get User model
const User = mongoose.model('Users');


router.post('/signup', async (req, res) => {
  try {
    const { Email, Password, Role = 'user' } = req.body;
    
    // Basic validation
    if (!Email || !Password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Check if email already exists
    const existingUser = await User.findOne({ Email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(Password, salt);
    
    // Create new user
    const newUser = new User({
      Email,
      Password: hashedPassword,
      Role,
      Projects: []
    });
    
    await newUser.save();
    
    // Generate token
    const token = jwt.sign(
      { userId: newUser._id }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: newUser._id,
        Email: newUser.Email,
        Role: newUser.Role
      }
    });
  } catch (error) {
    console.error('Error in signup:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { Email, Password } = req.body;
    
    // Basic validation
    if (!Email || !Password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user by email
    const user = await User.findOne({ Email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Compare password
    const isMatch = await bcrypt.compare(Password, user.Password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign(
      { userId: user._id }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        Email: user.Email,
        Role: user.Role
      }
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// router.get('/', auth, async (req, res) => {
//   try {
//     // Check if user is admin
//     if (req.user.Role !== 'admin') {
//       return res.status(403).json({ error: 'Access denied' });
//     }
    
//     const users = await User.find().select('-Password');
//     res.json(users);
//   } catch (error) {
//     console.error('Error fetching users:', error);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

router.get('/me/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-Password')
      .populate('Projects');
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/verify-token', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-Password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ valid: true, user });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-Password')
      .populate('Projects');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if requesting user is admin or the user themselves
    if (req.user.Role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    
    // Handle invalid ObjectId
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
});




module.exports = router;