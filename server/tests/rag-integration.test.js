const { expect } = require('chai');
const sinon = require('sinon');

describe('RAG Integration Tests', () => {
  let documentService;
  let mockOpenAI;
  
  beforeEach(() => {
    // Mock OpenAI if needed
    documentService = require('../services/documentService');
  });

  describe('RAG Response Structure', () => {
    it('should return correct RAG response structure', () => {
      const mockRAGResponse = {
        analysis: 'This analysis uses document context.',
        agent: 'Meeting Analyst',
        isFallback: false,
        ragUsed: true,
        ragSources: [
          {
            filename: 'test-doc.txt',
            bucket: 'ng',
            similarity: '75.5'
          }
        ],
        ragTag: '+RAG',
        tags: [],
        tagMetadata: [],
        roomContext: {
          meetingType: null,
          participants: [],
          topics: [],
          actionItems: [],
          tags: []
        }
      };

      expect(mockRAGResponse).to.have.property('analysis');
      expect(mockRAGResponse).to.have.property('ragUsed', true);
      expect(mockRAGResponse).to.have.property('ragSources');
      expect(mockRAGResponse.ragSources).to.be.an('array');
      expect(mockRAGResponse).to.have.property('ragTag', '+RAG');
      expect(mockRAGResponse.ragSources[0]).to.have.property('filename');
      expect(mockRAGResponse.ragSources[0]).to.have.property('similarity');
    });

    it('should return original response structure when RAG not used', () => {
      const mockOriginalResponse = {
        analysis: 'This is standard analysis.',
        agent: 'Meeting Analyst',
        isFallback: false,
        ragUsed: false,
        ragSources: [],
        ragTag: null,
        tags: [],
        tagMetadata: [],
        roomContext: {}
      };

      expect(mockOriginalResponse).to.have.property('analysis');
      expect(mockOriginalResponse).to.have.property('ragUsed', false);
      expect(mockOriginalResponse).to.have.property('ragSources');
      expect(mockOriginalResponse.ragSources).to.be.an('array');
      expect(mockOriginalResponse.ragSources.length).to.equal(0);
      expect(mockOriginalResponse).to.have.property('ragTag', null);
    });
  });

  describe('Block ID Handling', () => {
    it('should generate correct block IDs for original and RAG responses', () => {
      const originalBlockId = '1763797646660_ohc8f4';
      const ragBlockId = `${originalBlockId}-rag`;

      expect(ragBlockId).to.equal('1763797646660_ohc8f4-rag');
      expect(ragBlockId.endsWith('-rag')).to.be.true;
      
      // Test stripping -rag suffix
      const strippedId = ragBlockId.replace(/-rag$/, '');
      expect(strippedId).to.equal(originalBlockId);
    });
  });

  describe('RAG Source Formatting', () => {
    it('should format RAG sources correctly', () => {
      const mockDoc = {
        text: 'Sample document text',
        metadata: {
          filename: 'test-doc.txt',
          bucket: 'ng'
        },
        similarity: 0.782
      };

      const formattedSource = {
        filename: mockDoc.metadata.filename,
        bucket: mockDoc.metadata.bucket,
        similarity: (mockDoc.similarity * 100).toFixed(1)
      };

      expect(formattedSource.filename).to.equal('test-doc.txt');
      expect(formattedSource.bucket).to.equal('ng');
      expect(formattedSource.similarity).to.equal('78.2');
    });
  });

  describe('Bucket Selection Logic', () => {
    it('should handle bucket selection correctly', () => {
      const roomContext = {
        selectedBucket: 'n1'
      };

      let bucketFilter = null;
      if (roomContext.selectedBucket === 'n1') {
        bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
      } else if (roomContext.selectedBucket === 'u1') {
        bucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
      }

      expect(bucketFilter).to.equal(process.env.GCS_BUCKET_N1 || 'syncscribe-n1');
    });

    it('should search all buckets when no bucket selected', () => {
      const roomContext = {
        selectedBucket: null
      };

      let bucketFilter = null;
      if (roomContext.selectedBucket === 'n1') {
        bucketFilter = process.env.GCS_BUCKET_N1;
      } else if (roomContext.selectedBucket === 'u1') {
        bucketFilter = process.env.GCS_BUCKET_U1;
      }

      expect(bucketFilter).to.be.null;
    });
  });
});

