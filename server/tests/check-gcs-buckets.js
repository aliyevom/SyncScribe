// Check what's actually in the GCS buckets
require('dotenv').config();
const { Storage } = require('@google-cloud/storage');
const path = require('path');

async function checkGCSBuckets() {
  console.log('[OK] Checking GCS Bucket Contents\n');
  
  const projectId = process.env.GCS_PROJECT_ID;
  const bucketN1 = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
  const bucketU1 = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
  
  console.log(`Project ID: ${projectId}`);
  console.log(`N-1 Bucket: ${bucketN1}`);
  console.log(`U-1 Bucket: ${bucketU1}\n`);
  
  try {
    const gcsConfig = {
      projectId: projectId
    };

    if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
      gcsConfig.credentials = {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n')
      };
    } else {
      gcsConfig.keyFilename = path.join(__dirname, '../key.json');
    }

    const storage = new Storage(gcsConfig);
    
    // Check N-1 bucket
    console.log(`[OK] Checking N-1 bucket (${bucketN1})...`);
    try {
      const [n1Files] = await storage.bucket(bucketN1).getFiles();
      console.log(`   Found ${n1Files.length} files:`);
      n1Files.forEach(file => {
        console.log(`      - ${file.name} (${(file.metadata.size / 1024).toFixed(2)} KB)`);
      });
    } catch (error) {
      console.log(`   [X] Error accessing bucket: ${error.message}`);
    }
    
    console.log(`\n[OK] Checking U-1 bucket (${bucketU1})...`);
    try {
      const [u1Files] = await storage.bucket(bucketU1).getFiles();
      console.log(`   Found ${u1Files.length} files:`);
      u1Files.forEach(file => {
        console.log(`      - ${file.name} (${(file.metadata.size / 1024).toFixed(2)} KB)`);
      });
      
      if (u1Files.length === 0) {
        console.log('\n   [X] U-1 bucket is EMPTY');
        console.log('   This confirms why "No relevant documents found" appears when U-1 is selected.');
      }
    } catch (error) {
      console.log(`   [X] Error accessing bucket: ${error.message}`);
    }
    
    console.log('\n[OK] Bucket check complete');
    
  } catch (error) {
    console.error('[X] Error:', error.message);
    process.exit(1);
  }
  
  setTimeout(() => process.exit(0), 1000);
}

checkGCSBuckets();

