const mongoose = require('mongoose');
require('dotenv').config();
const Customer = require('./src/models/Customer');

async function removeDuplicates() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all customers
    const customers = await Customer.find({});
    console.log(`Total customers: ${customers.length}`);

    // Group by potential duplicate keys
    const duplicatesByName = new Map();
    const duplicatesByEmail = new Map();
    const duplicatesByPhone = new Map();
    const duplicatesByNameAndPhone = new Map();

    customers.forEach(customer => {
      const name = customer.name?.toLowerCase().trim();
      const email = customer.primaryEmail?.toLowerCase().trim();
      const phone = customer.primaryPhone?.trim();

      // Group by name
      if (name) {
        if (!duplicatesByName.has(name)) {
          duplicatesByName.set(name, []);
        }
        duplicatesByName.get(name).push(customer);
      }

      // Group by email
      if (email) {
        if (!duplicatesByEmail.has(email)) {
          duplicatesByEmail.set(email, []);
        }
        duplicatesByEmail.get(email).push(customer);
      }

      // Group by phone
      if (phone) {
        if (!duplicatesByPhone.has(phone)) {
          duplicatesByPhone.set(phone, []);
        }
        duplicatesByPhone.get(phone).push(customer);
      }

      // Group by name + phone (most reliable)
      if (name && phone) {
        const key = `${name}|${phone}`;
        if (!duplicatesByNameAndPhone.has(key)) {
          duplicatesByNameAndPhone.set(key, []);
        }
        duplicatesByNameAndPhone.get(key).push(customer);
      }
    });

    // Find duplicates (groups with more than 1 customer)
    const duplicateGroups = [];
    
    // Check name + phone duplicates first (most reliable)
    duplicatesByNameAndPhone.forEach((group, key) => {
      if (group.length > 1) {
        duplicateGroups.push({
          type: 'name+phone',
          key,
          customers: group
        });
      }
    });

    // Check email duplicates
    duplicatesByEmail.forEach((group, email) => {
      if (group.length > 1) {
        // Skip if already in name+phone group
        const alreadyGrouped = duplicateGroups.some(g => 
          g.customers.some(c => c._id.toString() === group[0]._id.toString())
        );
        if (!alreadyGrouped) {
          duplicateGroups.push({
            type: 'email',
            key: email,
            customers: group
          });
        }
      }
    });

    // Check phone duplicates
    duplicatesByPhone.forEach((group, phone) => {
      if (group.length > 1) {
        // Skip if already grouped
        const alreadyGrouped = duplicateGroups.some(g => 
          g.customers.some(c => c._id.toString() === group[0]._id.toString())
        );
        if (!alreadyGrouped) {
          duplicateGroups.push({
            type: 'phone',
            key: phone,
            customers: group
          });
        }
      }
    });

    // Check name duplicates (less reliable, but useful)
    duplicatesByName.forEach((group, name) => {
      if (group.length > 1) {
        // Skip if already grouped
        const alreadyGrouped = duplicateGroups.some(g => 
          g.customers.some(c => c._id.toString() === group[0]._id.toString())
        );
        if (!alreadyGrouped) {
          duplicateGroups.push({
            type: 'name',
            key: name,
            customers: group
          });
        }
      }
    });

    console.log(`\nFound ${duplicateGroups.length} duplicate groups`);

    let totalDeleted = 0;
    const deletedCustomers = [];

    // Process each duplicate group
    for (const group of duplicateGroups) {
      // Sort by creation date (keep the oldest one)
      group.customers.sort((a, b) => {
        const dateA = a.createdAt || new Date(0);
        const dateB = b.createdAt || new Date(0);
        return dateA - dateB;
      });

      // Keep the first one (oldest), delete the rest
      const toKeep = group.customers[0];
      const toDelete = group.customers.slice(1);

      console.log(`\n${group.type}: "${group.key}"`);
      console.log(`  Keeping: ${toKeep.name} (${toKeep._id})`);
      
      // Merge data from duplicates into the kept customer
      for (const duplicate of toDelete) {
        // Merge addresses
        if (duplicate.addresses && duplicate.addresses.length > 0) {
          const existingAddresses = toKeep.addresses || [];
          const existingFullAddresses = new Set(existingAddresses.map(a => a.fullAddress || `${a.street || ''} ${a.city || ''}`.trim()));
          duplicate.addresses.forEach(addr => {
            const addrKey = addr.fullAddress || `${addr.street || ''} ${addr.city || ''}`.trim();
            if (!existingFullAddresses.has(addrKey)) {
              existingAddresses.push(addr);
            }
          });
          toKeep.addresses = existingAddresses;
        }

        // Merge phones
        if (duplicate.phones && duplicate.phones.length > 0) {
          const existingPhones = toKeep.phones || [];
          const existingPhonesSet = new Set(existingPhones);
          duplicate.phones.forEach(phone => {
            if (!existingPhonesSet.has(phone)) {
              existingPhones.push(phone);
            }
          });
          toKeep.phones = existingPhones;
        }

        // Merge emails
        if (duplicate.emails && duplicate.emails.length > 0) {
          const existingEmails = toKeep.emails || [];
          const existingEmailsSet = new Set(existingEmails.map(e => e.toLowerCase()));
          duplicate.emails.forEach(email => {
            const emailLower = email.toLowerCase();
            if (!existingEmailsSet.has(emailLower)) {
              existingEmails.push(emailLower);
            }
          });
          toKeep.emails = existingEmails;
        }

        // Use primary phone/email if kept customer doesn't have one
        if (!toKeep.primaryPhone && duplicate.primaryPhone) {
          toKeep.primaryPhone = duplicate.primaryPhone;
        }
        if (!toKeep.primaryEmail && duplicate.primaryEmail) {
          toKeep.primaryEmail = duplicate.primaryEmail;
        }

        // Use address if kept customer doesn't have one
        if (!toKeep.address && duplicate.address) {
          toKeep.address = duplicate.address;
        }

        // Merge notes
        if (duplicate.notes && !toKeep.notes) {
          toKeep.notes = duplicate.notes;
        } else if (duplicate.notes && toKeep.notes && duplicate.notes !== toKeep.notes) {
          toKeep.notes = `${toKeep.notes}\n\n${duplicate.notes}`;
        }

        // Merge tags
        if (duplicate.tags && duplicate.tags.length > 0) {
          const existingTags = toKeep.tags || [];
          const existingTagsSet = new Set(existingTags);
          duplicate.tags.forEach(tag => {
            if (!existingTagsSet.has(tag)) {
              existingTags.push(tag);
            }
          });
          toKeep.tags = existingTags;
        }

        // Delete the duplicate
        await Customer.findByIdAndDelete(duplicate._id);
        deletedCustomers.push(duplicate);
        totalDeleted++;
        console.log(`  Deleting: ${duplicate.name} (${duplicate._id})`);
      }

      // Save the updated customer
      await toKeep.save();
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total duplicate groups: ${duplicateGroups.length}`);
    console.log(`Total customers deleted: ${totalDeleted}`);
    console.log(`Customers remaining: ${customers.length - totalDeleted}`);

    await mongoose.disconnect();
    console.log('\nDuplicate removal completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error removing duplicates:', error);
    process.exit(1);
  }
}

// Run the duplicate removal
removeDuplicates();

