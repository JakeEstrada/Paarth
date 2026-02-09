const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Import models
const Customer = require('./src/models/Customer');
const Job = require('./src/models/Job');
const User = require('./src/models/User');

// Parse CSV
function parseCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, '')); // Remove BOM
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === ',,,,,,,,,,,,') continue; // Skip empty lines
    
    const values = parseCSVLine(line);
    if (values.length < headers.length) continue;
    
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ? values[index].trim() : '';
    });
    
    // Skip if no customer name
    if (!row.customerName) continue;
    
    data.push(row);
  }
  
  return data;
}

// Parse CSV line handling commas inside quotes
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

// Clean value - remove commas from numbers
function cleanNumber(value) {
  if (!value) return 0;
  return parseFloat(value.replace(/,/g, ''));
}

async function importData() {
  try {
    // Get the user who will be the creator
    const user = await User.findOne({ email: 'test@example.com' });
    if (!user) {
      console.error('❌ User not found. Please create a user first.');
      process.exit(1);
    }
    
    console.log(`✅ Found user: ${user.name} (${user.email})`);
    
    // Read CSV
    const csvPath = './Customeres.csv';
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const data = parseCSV(csvContent);
    
    console.log(`\n📊 Found ${data.length} records to import\n`);
    
    let customersCreated = 0;
    let jobsCreated = 0;
    
    for (const row of data) {
      console.log(`Processing: ${row.customerName} - ${row.jobTitle}`);
      
      // Check if customer already exists
      let customer = await Customer.findOne({ 
        name: row.customerName,
        primaryPhone: row.phone 
      });
      
      if (!customer) {
        // Create new customer
        customer = await Customer.create({
          name: row.customerName,
          primaryPhone: row.phone || '',
          primaryEmail: row.email || '',
          address: {
            street: row.street || '',
            city: row.city || '',
            state: row.state || '',
            zip: row.zip || ''
          },
          source: 'referral', // Default source
          createdBy: user._id
        });
        customersCreated++;
        console.log(`  ✅ Created customer: ${customer.name}`);
      } else {
        console.log(`  ℹ️  Customer already exists: ${customer.name}`);
      }
      
      // Create job
      const jobData = {
        customerId: customer._id,
        title: row.jobTitle || 'Staircase Project',
        stage: row.stage || 'ESTIMATE_SENT',
        valueEstimated: cleanNumber(row.valueEstimated),
        source: 'referral',
        createdBy: user._id
      };
      
      // Add appointment date if exists
      if (row.appointmentDate) {
        jobData.appointment = {
          dateTime: new Date(row.appointmentDate),
          notes: row.notes || ''
        };
      }
      
      // Add estimate data if exists
      if (row.estimateSentDate) {
        jobData.estimate = {
          sentAt: new Date(row.estimateSentDate),
          amount: cleanNumber(row.valueEstimated)
        };
      }
      
      // Add notes
      if (row.notes) {
        jobData.notes = [{
          content: row.notes,
          createdBy: user._id,
          createdAt: new Date()
        }];
      }
      
      const job = await Job.create(jobData);
      jobsCreated++;
      console.log(`  ✅ Created job: ${job.title} (${job.stage}) - $${job.valueEstimated.toLocaleString()}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Import Complete!');
    console.log('='.repeat(60));
    console.log(`✅ Customers created: ${customersCreated}`);
    console.log(`✅ Jobs created: ${jobsCreated}`);
    console.log('='.repeat(60) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Import error:', error);
    process.exit(1);
  }
}

// Run import
importData();
