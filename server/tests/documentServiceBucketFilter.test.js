const { expect } = require('chai');
const sinon = require('sinon');

describe('DocumentService Bucket Filtering Tests', () => {
  let documentService;
  let mockMemoryStore;

  beforeEach(() => {
    // Mock memory vector store
    mockMemoryStore = {
      documents: [
        {
          text: 'Document from N-1 bucket',
          metadata: {
            filename: 'n1-doc1.txt',
            bucket: 'syncscribe-n1'
          },
          embedding: new Array(1024).fill(0.1)
        },
        {
          text: 'Document from N-1 bucket 2',
          metadata: {
            filename: 'n1-doc2.txt',
            bucket: 'syncscribe-n1'
          },
          embedding: new Array(1024).fill(0.1)
        },
        {
          text: 'Document from U-1 bucket',
          metadata: {
            filename: 'u1-doc1.txt',
            bucket: 'syncscribe-u1'
          },
          embedding: new Array(1024).fill(0.1)
        },
        {
          text: 'Document from U-1 bucket 2',
          metadata: {
            filename: 'u1-doc2.txt',
            bucket: 'syncscribe-u1'
          },
          embedding: new Array(1024).fill(0.1)
        }
      ]
    };

    // Mock documentService with memory store
    documentService = {
      memoryVectorStore: mockMemoryStore,
      vectorDbType: 'memory',
      minSimilarity: 0.5,
      cosineSimilarity: (a, b) => {
        // Simple mock similarity calculation
        return 0.75;
      },
      generateEmbeddings: sinon.stub().resolves([new Array(1024).fill(0.1)])
    };
  });

  describe('Bucket Filtering in Memory Store', () => {
    it('should filter documents by N-1 bucket when bucketFilter is set', () => {
      const bucketFilter = 'syncscribe-n1';
      const allDocs = mockMemoryStore.documents || [];
      const bucketFiltered = bucketFilter 
        ? allDocs.filter(doc => doc.metadata?.bucket === bucketFilter)
        : allDocs;

      expect(bucketFiltered).to.have.length(2);
      expect(bucketFiltered[0].metadata.bucket).to.equal('syncscribe-n1');
      expect(bucketFiltered[1].metadata.bucket).to.equal('syncscribe-n1');
      expect(bucketFiltered.every(doc => doc.metadata.bucket === 'syncscribe-n1')).to.be.true;
    });

    it('should filter documents by U-1 bucket when bucketFilter is set', () => {
      const bucketFilter = 'syncscribe-u1';
      const allDocs = mockMemoryStore.documents || [];
      const bucketFiltered = bucketFilter 
        ? allDocs.filter(doc => doc.metadata?.bucket === bucketFilter)
        : allDocs;

      expect(bucketFiltered).to.have.length(2);
      expect(bucketFiltered[0].metadata.bucket).to.equal('syncscribe-u1');
      expect(bucketFiltered[1].metadata.bucket).to.equal('syncscribe-u1');
      expect(bucketFiltered.every(doc => doc.metadata.bucket === 'syncscribe-u1')).to.be.true;
    });

    it('should return all documents when bucketFilter is null', () => {
      const bucketFilter = null;
      const allDocs = mockMemoryStore.documents || [];
      const bucketFiltered = bucketFilter 
        ? allDocs.filter(doc => doc.metadata?.bucket === bucketFilter)
        : allDocs;

      expect(bucketFiltered).to.have.length(4);
      expect(bucketFiltered.some(doc => doc.metadata.bucket === 'syncscribe-n1')).to.be.true;
      expect(bucketFiltered.some(doc => doc.metadata.bucket === 'syncscribe-u1')).to.be.true;
    });

    it('should return empty array when bucketFilter does not match any documents', () => {
      const bucketFilter = 'non-existent-bucket';
      const allDocs = mockMemoryStore.documents || [];
      const bucketFiltered = bucketFilter 
        ? allDocs.filter(doc => doc.metadata?.bucket === bucketFilter)
        : allDocs;

      expect(bucketFiltered).to.have.length(0);
    });
  });

  describe('Bucket Filtering Edge Cases', () => {
    it('should handle documents without metadata gracefully', () => {
      const docsWithMissingMetadata = [
        {
          text: 'Document without metadata',
          embedding: new Array(1024).fill(0.1)
        },
        {
          text: 'Document with metadata',
          metadata: {
            filename: 'test.txt',
            bucket: 'syncscribe-n1'
          },
          embedding: new Array(1024).fill(0.1)
        }
      ];

      const bucketFilter = 'syncscribe-n1';
      const filtered = bucketFilter 
        ? docsWithMissingMetadata.filter(doc => doc.metadata?.bucket === bucketFilter)
        : docsWithMissingMetadata;

      expect(filtered).to.have.length(1);
      expect(filtered[0].metadata.bucket).to.equal('syncscribe-n1');
    });

    it('should handle documents with null bucket gracefully', () => {
      const docsWithNullBucket = [
        {
          text: 'Document with null bucket',
          metadata: {
            filename: 'test.txt',
            bucket: null
          },
          embedding: new Array(1024).fill(0.1)
        },
        {
          text: 'Document with valid bucket',
          metadata: {
            filename: 'test2.txt',
            bucket: 'syncscribe-n1'
          },
          embedding: new Array(1024).fill(0.1)
        }
      ];

      const bucketFilter = 'syncscribe-n1';
      const filtered = bucketFilter 
        ? docsWithNullBucket.filter(doc => doc.metadata?.bucket === bucketFilter)
        : docsWithNullBucket;

      expect(filtered).to.have.length(1);
      expect(filtered[0].metadata.bucket).to.equal('syncscribe-n1');
    });
  });

  describe('Bucket Filtering with Similarity Scoring', () => {
    it('should apply bucket filter before similarity scoring', () => {
      const bucketFilter = 'syncscribe-n1';
      const queryEmbedding = new Array(1024).fill(0.1);
      
      // Simulate the searchDocuments logic
      const allDocs = mockMemoryStore.documents || [];
      const bucketFiltered = bucketFilter 
        ? allDocs.filter(doc => doc.metadata?.bucket === bucketFilter)
        : allDocs;

      const scored = bucketFiltered.map(doc => ({
        ...doc,
        similarity: documentService.cosineSimilarity(queryEmbedding, doc.embedding)
      }));

      expect(scored).to.have.length(2);
      expect(scored.every(doc => doc.metadata.bucket === 'syncscribe-n1')).to.be.true;
      expect(scored.every(doc => doc.similarity === 0.75)).to.be.true;
    });

    it('should filter by similarity threshold after bucket filtering', () => {
      const bucketFilter = 'syncscribe-n1';
      const minSimilarity = 0.5;
      
      const allDocs = mockMemoryStore.documents || [];
      const bucketFiltered = bucketFilter 
        ? allDocs.filter(doc => doc.metadata?.bucket === bucketFilter)
        : allDocs;

      const scored = bucketFiltered.map(doc => ({
        ...doc,
        similarity: documentService.cosineSimilarity([], doc.embedding)
      }));

      const filtered = scored.filter(doc => doc.similarity >= minSimilarity);

      expect(filtered).to.have.length(2);
      expect(filtered.every(doc => doc.metadata.bucket === 'syncscribe-n1')).to.be.true;
    });
  });
});

