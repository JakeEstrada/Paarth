/**
 * Test script to verify task activity logging and backfill missing activities
 * Run with: node backend/src/scripts/testTaskActivityLogging.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Job = require('../models/Job');

// MongoDB connection string - use from environment or default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/paarth';

async function testTaskActivityLogging() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all tasks that have a jobId (created in pipeline)
    const tasksWithJobId = await Task.find({ jobId: { $exists: true, $ne: null } })
      .populate('jobId', 'title customerId')
      .populate('customerId', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    console.log(`\nFound ${tasksWithJobId.length} tasks with jobId (pipeline tasks)`);

    let missingActivities = [];
    let activitiesWithTaskId = 0;
    let activitiesWithoutTaskId = 0;

    // Check each task for corresponding activity
    for (const task of tasksWithJobId) {
      // Find activities for this task
      const activities = await Activity.find({
        $or: [
          { taskId: task._id },
          { jobId: task.jobId?._id, type: { $in: ['task_created', 'project_created'] } }
        ]
      }).sort({ createdAt: -1 });

      if (activities.length === 0) {
        missingActivities.push({
          task: task,
          reason: 'No activity found'
        });
      } else {
        // Check if activity has taskId
        const activityWithTaskId = activities.find(a => a.taskId && a.taskId.toString() === task._id.toString());
        if (activityWithTaskId) {
          activitiesWithTaskId++;
        } else {
          activitiesWithoutTaskId++;
          missingActivities.push({
            task: task,
            reason: 'Activity exists but missing taskId',
            existingActivity: activities[0]
          });
        }
      }
    }

    console.log(`\n=== Activity Status ===`);
    console.log(`Tasks with activities that have taskId: ${activitiesWithTaskId}`);
    console.log(`Tasks with activities missing taskId: ${activitiesWithoutTaskId}`);
    console.log(`Tasks with no activities: ${missingActivities.filter(m => m.reason === 'No activity found').length}`);

    if (missingActivities.length > 0) {
      console.log(`\n=== Missing Activities (${missingActivities.length}) ===`);
      missingActivities.slice(0, 10).forEach((item, idx) => {
        console.log(`\n${idx + 1}. Task: "${item.task.title}"`);
        console.log(`   Created: ${item.task.createdAt}`);
        console.log(`   Job: ${item.task.jobId?.title || 'N/A'}`);
        console.log(`   Customer: ${item.task.customerId?.name || 'N/A'}`);
        console.log(`   Is Project: ${item.task.isProject || false}`);
        console.log(`   Issue: ${item.reason}`);
        if (item.existingActivity) {
          console.log(`   Existing Activity ID: ${item.existingActivity._id}`);
          console.log(`   Existing Activity Type: ${item.existingActivity.type}`);
        }
      });

      if (missingActivities.length > 10) {
        console.log(`\n... and ${missingActivities.length - 10} more`);
      }

      // Ask if user wants to backfill
      console.log(`\n=== Backfill Option ===`);
      console.log('To backfill missing activities, uncomment the backfill section in this script.');
    } else {
      console.log('\n✅ All tasks have proper activities with taskId!');
    }

    // Test: Check recent activities
    console.log(`\n=== Recent Activities (last 10) ===`);
    const recentActivities = await Activity.find({
      type: { $in: ['task_created', 'project_created'] }
    })
      .populate('taskId', 'title isProject')
      .populate('jobId', 'title')
      .populate('customerId', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    recentActivities.forEach((activity, idx) => {
      console.log(`\n${idx + 1}. ${activity.type} - ${activity.note}`);
      console.log(`   Task ID: ${activity.taskId ? activity.taskId._id : 'MISSING'}`);
      console.log(`   Task Title: ${activity.taskId?.title || 'N/A'}`);
      console.log(`   Is Project: ${activity.taskId?.isProject || false}`);
      console.log(`   Job: ${activity.jobId?.title || 'N/A'}`);
      console.log(`   Customer: ${activity.customerId?.name || 'N/A'}`);
      console.log(`   Created: ${activity.createdAt}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Uncomment to enable backfilling
async function backfillMissingActivities() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB for backfill');

    const tasksWithJobId = await Task.find({ jobId: { $exists: true, $ne: null } })
      .populate('jobId', 'title customerId')
      .populate('customerId', 'name')
      .populate('createdBy', 'name');

    let backfilled = 0;
    let skipped = 0;

    for (const task of tasksWithJobId) {
      // Check if activity already exists with taskId
      const existingActivity = await Activity.findOne({
        taskId: task._id
      });

      if (existingActivity) {
        skipped++;
        continue;
      }

      // Check if activity exists without taskId
      const activityWithoutTaskId = await Activity.findOne({
        jobId: task.jobId?._id,
        type: { $in: ['task_created', 'project_created'] },
        taskId: { $exists: false }
      }).sort({ createdAt: -1 });

      if (activityWithoutTaskId) {
        // Update existing activity to include taskId
        activityWithoutTaskId.taskId = task._id;
        activityWithoutTaskId.type = task.isProject ? 'project_created' : 'task_created';
        await activityWithoutTaskId.save();
        console.log(`Updated activity ${activityWithoutTaskId._id} for task "${task.title}"`);
        backfilled++;
      } else {
        // Create new activity with descriptive note for San Clemente Woodworking CRM
        const activityType = task.isProject ? 'project_created' : 'task_created';
        const activityNote = task.description 
          ? `${task.title} - ${task.description}`
          : task.title;
        
        // Add context that this is for San Clemente Woodworking CRM testing
        const activityNoteText = task.isProject 
          ? `Project added to San Clemente Woodworking CRM: ${activityNote}`
          : `Change order/task added to San Clemente Woodworking CRM: ${activityNote}`;

        await Activity.create({
          type: activityType,
          taskId: task._id,
          jobId: task.jobId?._id,
          customerId: task.jobId?.customerId || task.customerId,
          note: activityNoteText,
          createdBy: task.createdBy
        });
        console.log(`Created activity for task "${task.title}"`);
        backfilled++;
      }
    }

    console.log(`\n✅ Backfill complete!`);
    console.log(`   Created/Updated: ${backfilled}`);
    console.log(`   Skipped (already have taskId): ${skipped}`);

  } catch (error) {
    console.error('Error during backfill:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Create test tasks and activities with descriptive names
async function createTestTasks() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB for creating test tasks');

    const User = require('../models/User');
    const Customer = require('../models/Customer');
    const Job = require('../models/Job');

    // Get or create a test user
    let testUser = await User.findOne({ isActive: true });
    if (!testUser) {
      console.log('No active user found. Please create a user first.');
      return;
    }

    // Get or create a test customer
    let testCustomer = await Customer.findOne();
    if (!testCustomer) {
      console.log('No customer found. Please create a customer first.');
      return;
    }

    // Get or create a test job
    let testJob = await Job.findOne({ customerId: testCustomer._id });
    if (!testJob) {
      console.log('No job found. Please create a job first.');
      return;
    }

    console.log(`\nCreating test tasks for San Clemente Woodworking CRM...`);
    console.log(`Using Customer: ${testCustomer.name}`);
    console.log(`Using Job: ${testJob.title}`);
    console.log(`Using User: ${testUser.name || testUser.email}\n`);

    const testTasks = [
      {
        title: 'Testing task creation activity logging for San Clemente Woodworking CRM',
        description: 'This test task verifies that when a task is created in the pipeline area (with jobId), it properly logs an activity with type "task_created" and includes the taskId field for proper linking in the recent activity feed.',
        jobId: testJob._id,
        customerId: testCustomer._id,
        isProject: false,
        expectedActivityType: 'task_created'
      },
      {
        title: 'Testing project creation activity logging for San Clemente Woodworking CRM',
        description: 'This test project verifies that when a project is created in the pipeline area (with jobId), it properly logs an activity with type "project_created" and includes the taskId field for proper linking in the recent activity feed.',
        jobId: testJob._id,
        customerId: testCustomer._id,
        isProject: true,
        expectedActivityType: 'project_created'
      },
      {
        title: 'Testing standalone task creation activity logging for San Clemente Woodworking CRM',
        description: 'This test task verifies that when a standalone task is created (without jobId), it properly logs an activity with type "task_created" and includes the taskId field.',
        jobId: null,
        customerId: testCustomer._id,
        isProject: false,
        expectedActivityType: 'task_created'
      },
      {
        title: 'Testing standalone project creation activity logging for San Clemente Woodworking CRM',
        description: 'This test project verifies that when a standalone project is created (without jobId), it properly logs an activity with type "project_created" and includes the taskId field.',
        jobId: null,
        customerId: testCustomer._id,
        isProject: true,
        expectedActivityType: 'project_created'
      },
      {
        title: 'Testing task activity logging with proper taskId linking for San Clemente Woodworking CRM',
        description: 'This test task verifies that the activity created includes the taskId field so that tasks can be properly linked and displayed in the recent activity feed on the dashboard.',
        jobId: testJob._id,
        customerId: testCustomer._id,
        isProject: false,
        expectedActivityType: 'task_created'
      }
    ];

    let created = 0;
    let errors = 0;

    for (const testTaskData of testTasks) {
      try {
        const taskData = {
          title: testTaskData.title,
          description: testTaskData.description,
          jobId: testTaskData.jobId || undefined,
          customerId: testTaskData.customerId,
          isProject: testTaskData.isProject,
          createdBy: testUser._id,
          assignedTo: testUser._id
        };

        const task = new Task(taskData);
        await task.save();

        // Manually trigger activity creation (simulating the controller logic)
        if (testTaskData.jobId && testTaskData.customerId) {
          const activityType = testTaskData.isProject ? 'project_created' : 'task_created';
          const activityNote = testTaskData.description 
            ? `${testTaskData.title} - ${testTaskData.description}`
            : testTaskData.title;
          const activityNoteText = testTaskData.isProject 
            ? `Project added: ${activityNote}`
            : `Change order/task added: ${activityNote}`;

          await Activity.create({
            type: activityType,
            taskId: task._id,
            jobId: testTaskData.jobId,
            customerId: testTaskData.customerId,
            note: activityNoteText,
            createdBy: testUser._id
          });
        } else if (testTaskData.customerId) {
          const activityType = testTaskData.isProject ? 'project_created' : 'task_created';
          const activityNote = testTaskData.isProject 
            ? `Project created: ${testTaskData.title}`
            : `Task created: ${testTaskData.title}`;

          await Activity.create({
            type: activityType,
            taskId: task._id,
            customerId: testTaskData.customerId,
            note: activityNote,
            createdBy: testUser._id
          });
        }

        console.log(`✅ Created: "${testTaskData.title}"`);
        console.log(`   Type: ${testTaskData.isProject ? 'Project' : 'Task'}`);
        console.log(`   Activity Type: ${testTaskData.expectedActivityType}`);
        console.log(`   Has JobId: ${testTaskData.jobId ? 'Yes' : 'No'}\n`);
        created++;
      } catch (error) {
        console.error(`❌ Error creating test task "${testTaskData.title}":`, error.message);
        errors++;
      }
    }

    console.log(`\n=== Test Task Creation Complete ===`);
    console.log(`✅ Successfully created: ${created}`);
    console.log(`❌ Errors: ${errors}`);

    // Verify the activities were created correctly
    console.log(`\n=== Verifying Test Activities ===`);
    const testActivities = await Activity.find({
      note: { $regex: 'Testing.*San Clemente Woodworking CRM' }
    })
      .populate('taskId', 'title isProject')
      .populate('jobId', 'title')
      .populate('customerId', 'name')
      .sort({ createdAt: -1 });

    console.log(`Found ${testActivities.length} test activities`);
    testActivities.forEach((activity, idx) => {
      console.log(`\n${idx + 1}. ${activity.type}`);
      console.log(`   Note: ${activity.note.substring(0, 80)}...`);
      console.log(`   Task ID: ${activity.taskId ? '✅ Present' : '❌ Missing'}`);
      console.log(`   Task Title: ${activity.taskId?.title || 'N/A'}`);
      console.log(`   Job: ${activity.jobId?.title || 'N/A'}`);
      console.log(`   Customer: ${activity.customerId?.name || 'N/A'}`);
    });

  } catch (error) {
    console.error('Error creating test tasks:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--backfill')) {
    backfillMissingActivities();
  } else if (args.includes('--create-tests')) {
    createTestTasks();
  } else {
    testTaskActivityLogging();
  }
}

module.exports = { testTaskActivityLogging, backfillMissingActivities, createTestTasks };

