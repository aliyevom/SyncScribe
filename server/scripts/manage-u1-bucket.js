#!/usr/bin/env node
// Script to manage U-1 bucket: upload SAFE guide and delete other files
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs').promises;

async function manageU1Bucket() {
  console.log('[OK] Managing U-1 Bucket\n');

  // Initialize GCS
  const projectId = process.env.GCS_PROJECT_ID;
  const bucketU1 = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
  
  try {
    const gcsConfig = {
      projectId: projectId
    };

    // Prefer environment variables for credentials if available
    if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
      gcsConfig.credentials = {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n')
      };
    } else {
      // Fallback to key file
      gcsConfig.keyFilename = path.join(__dirname, '../key.json');
    }

    const storage = new Storage(gcsConfig);
    const bucket = storage.bucket(bucketU1);

    console.log(`[OK] Connected to GCS bucket: ${bucketU1}\n`);

    // Step 1: List current files
    console.log('[OK] Listing current files in U-1 bucket...');
    const [files] = await bucket.getFiles();
    
    if (files.length === 0) {
      console.log('   - No files found in bucket\n');
    } else {
      console.log(`   - Found ${files.length} file(s):`);
      files.forEach(file => {
        console.log(`     • ${file.name}`);
      });
      console.log();
    }

    // Step 2: Delete all existing files
    if (files.length > 0) {
      console.log('[OK] Deleting existing files from U-1 bucket...');
      for (const file of files) {
        await file.delete();
        console.log(`   ✓ Deleted: ${file.name}`);
      }
      console.log();
    }

    // Step 3: Upload SAFE guide
    const safeGuideFilePath = path.join(__dirname, '../../YC_SAFE_USER_GUIDE.md');
    const destinationFileName = 'YC_SAFE_USER_GUIDE.md';

    console.log('[OK] Uploading SAFE User Guide to U-1 bucket...');
    
    // Check if file exists
    try {
      await fs.access(safeGuideFilePath);
    } catch (error) {
      console.error(`[X] File not found: ${safeGuideFilePath}`);
      console.error('    Please ensure YC_SAFE_USER_GUIDE.md exists in the project root.');
      process.exit(1);
    }

    // Upload file
    await bucket.upload(safeGuideFilePath, {
      destination: destinationFileName,
      metadata: {
        contentType: 'text/markdown',
        metadata: {
          uploadedAt: new Date().toISOString(),
          description: 'Y Combinator Post-Money SAFE User Guide'
        }
      }
    });

    console.log(`   ✓ Uploaded: ${destinationFileName}\n`);

    // Step 4: Verify upload
    console.log('[OK] Verifying upload...');
    const [updatedFiles] = await bucket.getFiles();
    
    console.log(`   - Files in U-1 bucket: ${updatedFiles.length}`);
    updatedFiles.forEach(file => {
      console.log(`     • ${file.name} (${file.metadata.size} bytes)`);
    });
    console.log();

    // Step 5: Get file URL
    const file = bucket.file(destinationFileName);
    const publicUrl = `https://storage.googleapis.com/${bucketU1}/${destinationFileName}`;
    
    console.log('[OK] Upload complete!');
    console.log(`   Public URL: ${publicUrl}`);
    console.log(`   Bucket: ${bucketU1}`);
    console.log(`   File: ${destinationFileName}\n`);

    console.log('[OK] Next steps:');
    console.log('   1. Run document processing to index the new file:');
    console.log('      cd server && node tests/check-gcs-buckets.js');
    console.log('   2. Or trigger via API:');
    console.log('      curl -X POST http://localhost:5001/api/documents/process\n');

  } catch (error) {
    console.error('[X] Error managing U-1 bucket:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    if (error.errors) {
      error.errors.forEach(err => {
        console.error(`   - ${err.message}`);
      });
    }
    process.exit(1);
  }
}

// Run the script
manageU1Bucket();


