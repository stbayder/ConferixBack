const mongoose = require('mongoose');
const Assignments = require('../models/Assignment');
const XLSX = require('xlsx');
const path = require('path');

async function loadAssignmentsIfEmpty() {
  try {
    const count = await Assignments.countDocuments();
    if (count > 0) {
      console.log('Assignments collection already has data.');
      return;
    }

    const workbook = XLSX.readFile(path.join(__dirname, '../data/assignments.xlsx'));
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const formatted = rows.map(row => {
      const typeArray = (row['type'] || '')
        .split(',')
        .map(s => s.trim());

      const audienceArray = (row['target_audience'] || '')
        .split(',')
        .map(s => s.trim());

      // Combine and remove duplicates
      const fullType = Array.from(new Set([...typeArray, ...audienceArray]));

      return {
        Step: row['step'],
        Assignment: row['assignment'],
        EstimatedTime: parseEstimatedTime(row['estimated_time']),
        RecommendedStartDate: row['recommended_start_date'],
        Type: fullType,
        Status: 'Pending' // Default value
      };
    });

    await Assignments.insertMany(formatted);
    console.log('Assignments successfully loaded from Excel.');
  } catch (err) {
    console.error('Error loading assignments from Excel:', err);
  }
}

function parseEstimatedTime(value) {
  // You can customize this function based on how you want to handle ranges, days/hours, etc.
  if (typeof value === 'string') {
    return value; // keep raw value if it's descriptive (e.g., "2–4 ימים")
  }
  return Number(value) || 0;
}

module.exports = loadAssignmentsIfEmpty;
