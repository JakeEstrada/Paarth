const mongoose = require('mongoose');
require('dotenv').config();
const Customer = require('./src/models/Customer');
const Job = require('./src/models/Job');

async function removeCustomersNotInJobs() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all jobs and extract unique customer IDs
    const jobs = await Job.find({});
    console.log(`Total jobs: ${jobs.length}`);

    // Get all unique customer IDs from jobs
    const customerIdsInJobs = new Set();
    jobs.forEach(job => {
      if (job.customerId) {
        customerIdsInJobs.add(job.customerId.toString());
      }
    });

    console.log(`Customers referenced in jobs: ${customerIdsInJobs.size}`);

    // Get all customers
    const allCustomers = await Customer.find({});
    console.log(`Total customers: ${allCustomers.length}`);

    // Find customers NOT in jobs
    const customersToDelete = [];
    const customersToKeep = [];

    allCustomers.forEach(customer => {
      const customerIdStr = customer._id.toString();
      if (customerIdsInJobs.has(customerIdStr)) {
        customersToKeep.push(customer);
      } else {
        customersToDelete.push(customer);
      }
    });

    console.log(`\nCustomers to keep (in jobs): ${customersToKeep.length}`);
    console.log(`Customers to delete (not in jobs): ${customersToDelete.length}`);

    // Ask for confirmation
    if (customersToDelete.length === 0) {
      console.log('\nNo customers to delete. All customers are referenced in jobs.');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('\n=== Preview of customers to be deleted (first 10) ===');
    customersToDelete.slice(0, 10).forEach((customer, idx) => {
      console.log(`${idx + 1}. ${customer.name} (${customer._id})`);
    });
    if (customersToDelete.length > 10) {
      console.log(`... and ${customersToDelete.length - 10} more`);
    }

    console.log('\n=== Preview of customers to be kept (first 10) ===');
    customersToKeep.slice(0, 10).forEach((customer, idx) => {
      console.log(`${idx + 1}. ${customer.name} (${customer._id})`);
    });
    if (customersToKeep.length > 10) {
      console.log(`... and ${customersToKeep.length - 10} more`);
    }

    // Delete customers not in jobs
    console.log('\nDeleting customers not referenced in jobs...');
    let deletedCount = 0;
    
    for (const customer of customersToDelete) {
      await Customer.findByIdAndDelete(customer._id);
      deletedCount++;
      if (deletedCount % 100 === 0) {
        console.log(`Deleted ${deletedCount}/${customersToDelete.length} customers...`);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total customers before: ${allCustomers.length}`);
    console.log(`Customers deleted: ${deletedCount}`);
    console.log(`Customers kept (in jobs): ${customersToKeep.length}`);
    console.log(`Total customers after: ${customersToKeep.length}`);

    await mongoose.disconnect();
    console.log('\nCustomer cleanup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error removing customers:', error);
    process.exit(1);
  }
}

// Run the cleanup
removeCustomersNotInJobs();

