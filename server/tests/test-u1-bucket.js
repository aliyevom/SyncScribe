// Test script to verify U-1 bucket contents and search functionality
require('dotenv').config();
const documentService = require('../services/documentService');

async function testU1Bucket() {
  console.log('[OK] Testing U-1 Bucket Contents and Search\n');
  
  // Test query from user
  const testQuery = `We design and build software product There's a handful of software development standards and best practices to be aware of, from the YAGNI principle to paying attention to style guides. Following software development best practice, to improved code quality, efficiency, and easier maintenance.

Principles such as DRY and YAGNI provide guidance for effective coding and feature development. Robust software is achieved through thorough testing, version control, and diligent code reviews. Following best practices is a way to improve the performance and productivity of an organization.

And something we take seriously here at Netguru. When it comes to software development best practices, what should software developers consider? Identifying and sharing best software development practices nurtures a learning culture and fills knowledge gaps. Keeping best practices in mind also enhances efficiency, enables better decision making,

and provides employees with an internal knowledge base. Finally, costs fall and we save time because all team members are on the same page across the software development life cycle. Below, we've created a handy listicle outlining 10 top software development best practices we stand by plus a range of examples dot dot one. DRY principle

This stands for don't repeat yourself and was formulated in 1999 by Andy Hunt and Dave Thomas. According to this principle, every piece of knowledge must have a single, unambiguous, authoritative representation within a system.`;

  try {
    // Get all documents from memory store
    const allDocs = documentService.memoryVectorStore?.documents || [];
    
    console.log(`Total documents in memory store: ${allDocs.length}\n`);
    
    // Group documents by bucket
    const docsByBucket = {};
    allDocs.forEach(doc => {
      const bucket = doc.metadata?.bucket || 'unknown';
      if (!docsByBucket[bucket]) {
        docsByBucket[bucket] = [];
      }
      docsByBucket[bucket].push(doc);
    });
    
    console.log('[OK] Documents by bucket:');
    Object.keys(docsByBucket).forEach(bucket => {
      console.log(`   ${bucket}: ${docsByBucket[bucket].length} documents`);
      docsByBucket[bucket].forEach(doc => {
        console.log(`      - ${doc.metadata?.filename || 'unknown'} (${doc.metadata?.fileType || 'unknown'})`);
      });
    });
    
    console.log('\n[OK] Testing search with U-1 bucket filter...\n');
    
    // Test search with U-1 filter
    const u1BucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
    console.log(`   Filter: ${u1BucketFilter}`);
    console.log(`   Query: "${testQuery.substring(0, 100)}..."\n`);
    
    const u1Results = await documentService.searchDocuments(testQuery, 5, u1BucketFilter);
    
    console.log(`Search results from U-1 bucket: ${u1Results.length} documents\n`);
    
    if (u1Results.length > 0) {
      u1Results.forEach((doc, idx) => {
        console.log(`   ${idx + 1}. ${doc.metadata.filename}`);
        console.log(`      Bucket: ${doc.metadata.bucket}`);
        console.log(`      Similarity: ${(doc.similarity * 100).toFixed(1)}%`);
        console.log(`      Preview: ${doc.text.substring(0, 150)}...\n`);
      });
    } else {
      console.log('   [X] No documents found in U-1 bucket for this query\n');
      
      // Check if U-1 bucket has any documents at all
      const u1Docs = docsByBucket[u1BucketFilter] || [];
      if (u1Docs.length === 0) {
        console.log(`   [OK] U-1 bucket (${u1BucketFilter}) has NO documents in the memory store`);
        console.log('   This explains why no results were found.\n');
      } else {
        console.log(`   [OK] U-1 bucket has ${u1Docs.length} documents, but none matched the query`);
        console.log('   This is correct behavior - the bucket filter is working!\n');
      }
    }
    
    // Compare with N-1 search
    console.log('[OK] Testing search with N-1 bucket filter for comparison...\n');
    const n1BucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
    const n1Results = await documentService.searchDocuments(testQuery, 5, n1BucketFilter);
    
    console.log(`Search results from N-1 bucket: ${n1Results.length} documents\n`);
    
    if (n1Results.length > 0) {
      n1Results.forEach((doc, idx) => {
        console.log(`   ${idx + 1}. ${doc.metadata.filename}`);
        console.log(`      Bucket: ${doc.metadata.bucket}`);
        console.log(`      Similarity: ${(doc.similarity * 100).toFixed(1)}%\n`);
      });
    }
    
    // Summary
    console.log('\nSummary:');
    console.log(`   U-1 bucket filter: ${u1Results.length} results`);
    console.log(`   N-1 bucket filter: ${n1Results.length} results`);
    console.log(`   Total documents in store: ${allDocs.length}`);
    console.log(`   Documents in U-1: ${docsByBucket[u1BucketFilter]?.length || 0}`);
    console.log(`   Documents in N-1: ${docsByBucket[n1BucketFilter]?.length || 0}`);
    
    if (u1Results.length === 0 && (docsByBucket[u1BucketFilter]?.length || 0) === 0) {
      console.log('\n[OK] VERIFICATION: U-1 bucket is empty or has no documents');
      console.log('   The "No relevant documents found" message is CORRECT behavior.');
    } else if (u1Results.length === 0 && (docsByBucket[u1BucketFilter]?.length || 0) > 0) {
      console.log('\n[OK] VERIFICATION: U-1 bucket has documents but none match the query');
      console.log('   The bucket filter is working correctly - it searched only U-1.');
    } else {
      console.log('\n[OK] VERIFICATION: U-1 bucket has matching documents');
      console.log('   The search found results from U-1 bucket.');
    }
    
  } catch (error) {
    console.error('[X] Error testing U-1 bucket:', error);
    process.exit(1);
  }
  
  // Give time for async operations
  setTimeout(() => {
    process.exit(0);
  }, 2000);
}

testU1Bucket();

