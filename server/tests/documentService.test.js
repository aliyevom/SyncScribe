const { expect } = require('chai');
const documentService = require('../services/documentService');

describe('DocumentService - RAG Integration', () => {
  // DocumentService is exported as a singleton instance

  describe('Document Search', () => {
    it('should search documents with similarity threshold', async function() {
      this.timeout(10000);
      
      // Mock the searchDocuments method if needed
      // In a real test, you'd want to use actual GCS or mock it
      const query = 'software development best practices';
      
      // This test assumes documents are already processed
      // In real scenario, you'd mock the vector DB or use test data
      try {
        const results = await documentService.searchDocuments(query, 3);
        
        // If documents exist, verify structure
        if (results && results.length > 0) {
          expect(results).to.be.an('array');
          results.forEach(doc => {
            expect(doc).to.have.property('text');
            expect(doc).to.have.property('metadata');
            expect(doc).to.have.property('similarity');
            expect(doc.metadata).to.have.property('filename');
            expect(doc.similarity).to.be.a('number');
            expect(doc.similarity).to.be.at.least(documentService.minSimilarity);
          });
        }
      } catch (error) {
        // If GCS is not configured, skip test
        if (error.message.includes('GCS') || error.message.includes('credentials')) {
          this.skip();
        } else {
          throw error;
        }
      }
    });

    it('should filter by bucket when specified', async function() {
      this.timeout(10000);
      
      const query = 'test query';
      const bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
      
      try {
        const results = await documentService.searchDocuments(query, 3, bucketFilter);
        
        if (results && results.length > 0) {
          results.forEach(doc => {
            expect(doc.metadata.bucket).to.equal(bucketFilter);
          });
        }
      } catch (error) {
        if (error.message.includes('GCS') || error.message.includes('credentials')) {
          this.skip();
        } else {
          throw error;
        }
      }
    });

    it('should respect similarity threshold', () => {
      expect(documentService.minSimilarity).to.be.a('number');
      expect(documentService.minSimilarity).to.be.at.least(0);
      expect(documentService.minSimilarity).to.be.at.most(1);
    });
  });

  describe('Document Processing', () => {
    it('should have chunk size configuration', () => {
      expect(documentService.chunkSize).to.be.a('number');
      expect(documentService.chunkSize).to.be.greaterThan(0);
    });

    it('should have overlap configuration', () => {
      expect(documentService.chunkOverlap).to.be.a('number');
      expect(documentService.chunkOverlap).to.be.at.least(0);
    });
  });

  describe('Embedding Generation', () => {
    it('should have embedding model configured', () => {
      expect(documentService.embeddingModel).to.be.a('string');
      expect(documentService.embeddingModel.length).to.be.greaterThan(0);
    });

    it('should have embedding dimensions configured', () => {
      expect(documentService.embeddingDimensions).to.be.a('number');
      expect(documentService.embeddingDimensions).to.be.greaterThan(0);
    });
  });
});

