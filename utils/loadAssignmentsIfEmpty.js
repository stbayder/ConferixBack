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

      const fullType = Array.from(new Set([...typeArray, ...audienceArray]));

      const isOngoing = (row['is_ongoing'] || '').toUpperCase() === 'Y';
      const isDayOf = (row['is_day_of'] || '').toUpperCase() === 'Y';

      return {
        Step: row['step'],
        Assignment: row['assignment'],
        EstimatedTime: isOngoing ? 0 : Number(row['estimated_time']) || 0,
        RecommendedStartOffset: Number(row['recommended_start_offset']) || 0,
        IsOngoing: isOngoing,
        IsDayOf: isDayOf,
        Type: fullType,
        Status: 'Pending'
      };
    });

    await Assignments.insertMany(formatted);
    console.log('Assignments successfully loaded from Excel.');
  } catch (err) {
    console.error('Error loading assignments from Excel:', err);
  }
}

module.exports = loadAssignmentsIfEmpty;
