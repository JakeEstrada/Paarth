require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Customer = require('../models/Customer');
const Job = require('../models/Job');

async function testActivityLogging() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check recent activities
    console.log('\n📊 Recent Activities (last 10):');
    const recentActivities = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('customerId', 'name')
      .populate('taskId', 'title isProject')
      .populate('jobId', 'title');
    
    if (recentActivities.length === 0) {
      console.log('   ⚠️  No activities found!');
    } else {
      recentActivities.forEach((activity, idx) => {
        console.log(`   ${idx + 1}. [${activity.type}] ${activity.note || 'No note'}`);
        console.log(`      Customer: ${activity.customerId?.name || 'N/A'}`);
        console.log(`      Task: ${activity.taskId?.title || 'N/A'}`);
        console.log(`      Job: ${activity.jobId?.title || 'N/A'}`);
        console.log(`      Created: ${activity.createdAt}`);
        console.log('');
      });
    }

    // Check recent tasks
    console.log('\n📋 Recent Tasks (last 10):');
    const recentTasks = await Task.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('customerId', 'name')
      .populate('jobId', 'title');
    
    if (recentTasks.length === 0) {
      console.log('   ⚠️  No tasks found!');
    } else {
      recentTasks.forEach((task, idx) => {
        console.log(`   ${idx + 1}. [${task.isProject ? 'PROJECT' : 'TASK'}] ${task.title}`);
        console.log(`      Customer: ${task.customerId?.name || 'N/A'}`);
        console.log(`      Job: ${task.jobId?.title || 'N/A'}`);
        console.log(`      Created: ${task.createdAt}`);
        
        // Check if there's an activity for this task
        const taskActivities = recentActivities.filter(a => 
          a.taskId && a.taskId._id.toString() === task._id.toString()
        );
        if (taskActivities.length === 0) {
          console.log(`      ⚠️  NO ACTIVITY LOGGED for this ${task.isProject ? 'project' : 'task'}!`);
        } else {
          console.log(`      ✅ ${taskActivities.length} activity(ies) logged`);
        }
        console.log('');
      });
    }

    // Check customers
    console.log('\n👥 Customers:');
    const customers = await Customer.find().limit(5);
    if (customers.length === 0) {
      console.log('   ⚠️  No customers found! This might be why activities aren\'t logging.');
    } else {
      customers.forEach((customer, idx) => {
        console.log(`   ${idx + 1}. ${customer.name} (ID: ${customer._id})`);
      });
      console.log(`\n   Using first customer as default: ${customers[0].name}`);
    }

    // Test activity creation
    console.log('\n🧪 Testing Activity Creation:');
    if (customers.length > 0) {
      try {
        const testActivity = await Activity.create({
          type: 'task_created',
          customerId: customers[0]._id,
          note: 'TEST: Activity logging is working!',
          createdBy: customers[0]._id // Using customer ID as placeholder
        });
        console.log(`   ✅ Test activity created: ${testActivity._id}`);
        
        // Clean up test activity
        await Activity.findByIdAndDelete(testActivity._id);
        console.log('   ✅ Test activity cleaned up');
      } catch (error) {
        console.error('   ❌ Error creating test activity:', error.message);
      }
    } else {
      console.log('   ⚠️  Cannot test - no customers available');
    }

    await mongoose.disconnect();
    console.log('\n✅ Test complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testActivityLogging();

