/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
require('../models/Customer');
const Job = require('../models/Job');
const { formatJobLocation, shouldRetryGeo, syncJobGeo } = require('../services/geocodeService');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is missing');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const jobs = await Job.find({})
    .select('title jobAddress geo customerId')
    .populate({ path: 'customerId', select: 'name address addresses', strictPopulate: false });

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of jobs) {
    const address = formatJobLocation(job);
    if (!address) {
      skipped += 1;
      continue;
    }
    if (!shouldRetryGeo(job, address)) {
      skipped += 1;
      continue;
    }
    const result = await syncJobGeo(job);
    if (result.skipped) skipped += 1;
    else if (result.ok) ok += 1;
    else failed += 1;
    await sleep(200);
  }

  console.log(`Geocoded jobs: ${ok} saved, ${failed} failed, ${skipped} skipped (already stored or no street).`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
