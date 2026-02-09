const mongoose = require('mongoose');
require('dotenv').config();
const Customer = require('./src/models/Customer');
const Activity = require('./src/models/Activity');
const User = require('./src/models/User');
const fs = require('fs');
const path = require('path');

// Parse address string into components
function parseAddress(addressStr) {
  if (!addressStr || addressStr.trim() === '') {
    return { street: '', city: '', state: '', zip: '' };
  }
  
  // Remove quotes and trim
  addressStr = addressStr.replace(/^"|"$/g, '').trim();
  
  // Try to parse common formats:
  // "Street, City, State, ZIP"
  // "City, State, ZIP"
  // "Street, City, State ZIP"
  const parts = addressStr.split(',').map(p => p.trim());
  
  let street = '';
  let city = '';
  let state = '';
  let zip = '';
  
  if (parts.length >= 3) {
    // Format: "Street, City, State, ZIP" or "City, State, ZIP"
    street = parts[0];
    city = parts[1] || '';
    
    // Last part might be "State ZIP" or just "State"
    const lastPart = parts[parts.length - 1] || '';
    const stateZipMatch = lastPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2] || '';
    } else {
      state = lastPart;
    }
    
    // If there's a 4th part, it's likely the ZIP
    if (parts.length >= 4) {
      zip = parts[parts.length - 1] || '';
      state = parts[parts.length - 2] || '';
    }
  } else if (parts.length === 2) {
    // Format: "City, State ZIP" or "Street, City"
    street = parts[0];
    const secondPart = parts[1];
    const stateZipMatch = secondPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2] || '';
    } else {
      city = secondPart;
    }
  } else {
    // Single part - could be street or city
    street = addressStr;
  }
  
  return { street, city, state, zip };
}

async function importCSV() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get default user for createdBy
    let createdBy = await User.findOne({ isActive: true });
    if (!createdBy) {
      // Try to get any user
      createdBy = await User.findOne();
      if (!createdBy) {
        console.error('No user found in database. Please create a user first.');
        process.exit(1);
      }
    }
    console.log(`Using user: ${createdBy.name || createdBy.email}`);

    // Read CSV file
    const filePath = path.join(__dirname, 'Contact_list_processed.CSV');
    
    if (!fs.existsSync(filePath)) {
      console.error(`CSV file not found at: ${filePath}`);
      process.exit(1);
    }
    
    console.log('Reading CSV file...');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) {
      console.error('CSV file is empty or has no data rows');
      process.exit(1);
    }
    
    // Parse header
    const header = lines[0].split(',').map(h => h.trim());
    const nameIndex = header.findIndex(h => h.toLowerCase() === 'name');
    const phoneIndex = header.findIndex(h => h.toLowerCase() === 'phone');
    const emailIndex = header.findIndex(h => h.toLowerCase() === 'email');
    const addressIndex = header.findIndex(h => h.toLowerCase().includes('address'));
    
    if (nameIndex === -1) {
      console.error('CSV must have a "Name" column');
      process.exit(1);
    }
    
    console.log(`Found ${lines.length - 1} rows to process`);
    
    const customers = [];
    const errors = [];
    let updated = 0;
    let created = 0;
    
    // Parse each row (skip header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      // Parse CSV line (handle quoted fields)
      const row = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      row.push(current.trim()); // Add last field
      
      const name = row[nameIndex] || '';
      const phone = row[phoneIndex] || '';
      const email = row[emailIndex] || '';
      const addressStr = row[addressIndex] || '';
      
      // Skip rows with no name or starting with #
      if (!name || name.trim() === '' || name.startsWith('#')) {
        continue;
      }
      
      // Parse multiple addresses (separated by semicolons)
      const addressStrings = addressStr.split(';').map(addr => addr.trim()).filter(addr => addr);
      const addresses = [];
      let primaryAddress = null;
      
      for (const addrStr of addressStrings) {
        const parsedAddr = parseAddress(addrStr);
        if (parsedAddr.street || parsedAddr.city) {
          const addressObj = {
            ...parsedAddr,
            fullAddress: addrStr.trim()
          };
          addresses.push(addressObj);
          // First valid address becomes primary
          if (!primaryAddress) {
            primaryAddress = parsedAddr;
          }
        }
      }
      
      // If no addresses parsed, try parsing the whole string
      if (addresses.length === 0 && addressStr.trim()) {
        const parsedAddr = parseAddress(addressStr);
        if (parsedAddr.street || parsedAddr.city) {
          addresses.push({
            ...parsedAddr,
            fullAddress: addressStr.trim()
          });
          primaryAddress = parsedAddr;
        }
      }
      
      // Check if customer already exists (by email or phone)
      let existingCustomer = null;
      if (email) {
        existingCustomer = await Customer.findOne({ primaryEmail: email.toLowerCase() });
      }
      if (!existingCustomer && phone) {
        existingCustomer = await Customer.findOne({ primaryPhone: phone });
      }
      
      if (existingCustomer) {
        // Update existing customer
        let updatedFields = false;
        if (name && existingCustomer.name !== name) {
          existingCustomer.name = name;
          updatedFields = true;
        }
        if (phone && existingCustomer.primaryPhone !== phone) {
          existingCustomer.primaryPhone = phone;
          updatedFields = true;
        }
        if (email && existingCustomer.primaryEmail !== email.toLowerCase()) {
          existingCustomer.primaryEmail = email.toLowerCase();
          updatedFields = true;
        }
        if (primaryAddress && (primaryAddress.street || primaryAddress.city)) {
          if (!existingCustomer.address || 
              existingCustomer.address.street !== primaryAddress.street ||
              existingCustomer.address.city !== primaryAddress.city) {
            existingCustomer.address = primaryAddress;
            updatedFields = true;
          }
        }
        // Add new addresses to existing addresses array
        if (addresses.length > 0) {
          const existingAddresses = existingCustomer.addresses || [];
          const existingFullAddresses = new Set(existingAddresses.map(a => a.fullAddress || `${a.street || ''} ${a.city || ''}`.trim()));
          let addressesAdded = false;
          addresses.forEach(addr => {
            const addrKey = addr.fullAddress || `${addr.street || ''} ${addr.city || ''}`.trim();
            if (!existingFullAddresses.has(addrKey)) {
              existingAddresses.push(addr);
              addressesAdded = true;
            }
          });
          if (addressesAdded) {
            existingCustomer.addresses = existingAddresses;
            updatedFields = true;
          }
        }
        
        if (updatedFields) {
          await existingCustomer.save();
          updated++;
        }
        customers.push(existingCustomer);
      } else {
        // Create new customer
        try {
          const customer = new Customer({
            name: name.trim(),
            primaryPhone: phone || undefined,
            primaryEmail: email ? email.toLowerCase() : undefined,
            address: primaryAddress || undefined,
            addresses: addresses.length > 0 ? addresses : undefined,
            source: 'other',
            createdBy: createdBy._id
          });
          
          await customer.save();
          customers.push(customer);
          created++;
          
          // Log activity
          await Activity.create({
            type: 'customer_created',
            customerId: customer._id,
            note: `Customer "${customer.name}" created from CSV import`,
            createdBy: createdBy._id
          });
        } catch (error) {
          errors.push({ row: i + 1, name, error: error.message });
        }
      }
      
      // Progress indicator
      if (i % 100 === 0) {
        console.log(`Processed ${i}/${lines.length - 1} rows...`);
      }
    }
    
    console.log('\n=== Import Summary ===');
    console.log(`Total processed: ${customers.length}`);
    console.log(`Created: ${created}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(err => {
        console.log(`  Row ${err.row} (${err.name}): ${err.error}`);
      });
    }
    
    await mongoose.disconnect();
    console.log('\nImport completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error importing CSV:', error);
    process.exit(1);
  }
}

// Run the import
importCSV();

