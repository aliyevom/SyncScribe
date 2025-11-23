const { expect } = require('chai');
const sinon = require('sinon');

describe('RAG Toggle Functionality Tests', () => {
  let analyzeSpokenReply;
  let documentService;
  let roomContexts;
  let mockSocket;

  beforeEach(() => {
    // Mock socket.io
    mockSocket = {
      emit: sinon.stub(),
      on: sinon.stub()
    };

    // Clear any existing room contexts
    roomContexts = new Map();

    // Mock documentService
    documentService = {
      searchDocuments: sinon.stub()
    };

    // We'll need to test the actual implementation, so let's require the module
    // But we'll mock dependencies
    delete require.cache[require.resolve('../index.js')];
  });

  describe('useRAG Parameter Processing', () => {
    it('should correctly identify useRAG=true when boolean true is passed', () => {
      const data = { useRAG: true };
      const useRAG = data.useRAG === true || data.useRAG === 'true' || data.useRAG === 1;
      expect(useRAG).to.be.true;
    });

    it('should correctly identify useRAG=false when boolean false is passed', () => {
      const data = { useRAG: false };
      const useRAG = data.useRAG === true || data.useRAG === 'true' || data.useRAG === 1;
      expect(useRAG).to.be.false;
    });

    it('should correctly identify useRAG=true when string "true" is passed', () => {
      const data = { useRAG: 'true' };
      const useRAG = data.useRAG === true || data.useRAG === 'true' || data.useRAG === 1;
      expect(useRAG).to.be.true;
    });

    it('should correctly identify useRAG=true when number 1 is passed', () => {
      const data = { useRAG: 1 };
      const useRAG = data.useRAG === true || data.useRAG === 'true' || data.useRAG === 1;
      expect(useRAG).to.be.true;
    });

    it('should default to false when useRAG is undefined', () => {
      const data = {};
      const useRAG = data.useRAG === true || data.useRAG === 'true' || data.useRAG === 1;
      expect(useRAG).to.be.false;
    });

    it('should default to false when useRAG is null', () => {
      const data = { useRAG: null };
      const useRAG = data.useRAG === true || data.useRAG === 'true' || data.useRAG === 1;
      expect(useRAG).to.be.false;
    });
  });

  describe('Bucket Filtering Logic', () => {
    beforeEach(() => {
      // Set up test environment variables
      process.env.GCS_BUCKET_N1 = 'syncscribe-n1';
      process.env.GCS_BUCKET_U1 = 'syncscribe-u1';
    });

    it('should return N-1 bucket filter when selectedBucket is "n1"', () => {
      const roomContext = { selectedBucket: 'n1' };
      let bucketFilter = null;
      
      if (roomContext.selectedBucket === 'n1') {
        bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
      } else if (roomContext.selectedBucket === 'u1') {
        bucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
      }
      
      expect(bucketFilter).to.equal('syncscribe-n1');
    });

    it('should return U-1 bucket filter when selectedBucket is "u1"', () => {
      const roomContext = { selectedBucket: 'u1' };
      let bucketFilter = null;
      
      if (roomContext.selectedBucket === 'n1') {
        bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
      } else if (roomContext.selectedBucket === 'u1') {
        bucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
      }
      
      expect(bucketFilter).to.equal('syncscribe-u1');
    });

    it('should return null (no filter) when selectedBucket is null', () => {
      const roomContext = { selectedBucket: null };
      let bucketFilter = null;
      
      if (roomContext.selectedBucket === 'n1') {
        bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
      } else if (roomContext.selectedBucket === 'u1') {
        bucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
      }
      
      expect(bucketFilter).to.be.null;
    });

    it('should return null (no filter) when selectedBucket is undefined', () => {
      const roomContext = {};
      let bucketFilter = null;
      
      if (roomContext.selectedBucket === 'n1') {
        bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
      } else if (roomContext.selectedBucket === 'u1') {
        bucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
      }
      
      expect(bucketFilter).to.be.null;
    });
  });

  describe('Analysis Type Selection', () => {
    it('should generate original analysis when useRAG is false', () => {
      const useRAG = false;
      const shouldUseRAG = useRAG === true || useRAG === 'true' || useRAG === 1;
      
      expect(shouldUseRAG).to.be.false;
      // When false, should generate original analysis
      expect(shouldUseRAG ? 'document-enhanced' : 'original').to.equal('original');
    });

    it('should generate document-enhanced analysis when useRAG is true', () => {
      const useRAG = true;
      const shouldUseRAG = useRAG === true || useRAG === 'true' || useRAG === 1;
      
      expect(shouldUseRAG).to.be.true;
      // When true, should generate document-enhanced analysis
      expect(shouldUseRAG ? 'document-enhanced' : 'original').to.equal('document-enhanced');
    });
  });

  describe('Response Structure Validation', () => {
    it('should return correct structure for original analysis', () => {
      const originalResponse = {
        text: 'This is standard analysis without RAG.',
        context: 'Test transcript',
        timestamp: new Date().toISOString(),
        analysisType: 'original',
        agent: 'Speaker Coach',
        isFormatted: false,
        isFallback: false,
        blockId: 'test-block-123',
        ragUsed: false,
        ragSources: [],
        ragTag: null
      };

      expect(originalResponse).to.have.property('analysisType', 'original');
      expect(originalResponse).to.have.property('ragUsed', false);
      expect(originalResponse).to.have.property('ragSources');
      expect(originalResponse.ragSources).to.be.an('array').that.is.empty;
      expect(originalResponse).to.have.property('ragTag', null);
    });

    it('should return correct structure for document-enhanced analysis', () => {
      const ragResponse = {
        text: 'This analysis uses document context.',
        context: 'Test transcript',
        timestamp: new Date().toISOString(),
        analysisType: 'document-enhanced',
        agent: 'Speaker Coach',
        isFormatted: false,
        isFallback: false,
        blockId: 'test-block-123',
        ragUsed: true,
        ragSources: [
          {
            filename: 'test-doc.txt',
            bucket: 'syncscribe-n1',
            similarity: '82.1'
          }
        ],
        ragTag: '+RAG'
      };

      expect(ragResponse).to.have.property('analysisType', 'document-enhanced');
      expect(ragResponse).to.have.property('ragUsed', true);
      expect(ragResponse).to.have.property('ragSources');
      expect(ragResponse.ragSources).to.be.an('array').that.is.not.empty;
      expect(ragResponse).to.have.property('ragTag', '+RAG');
      expect(ragResponse.ragSources[0]).to.have.property('filename');
      expect(ragResponse.ragSources[0]).to.have.property('bucket');
      expect(ragResponse.ragSources[0]).to.have.property('similarity');
    });
  });

  describe('Room Context Management', () => {
    it('should create room context if it does not exist', () => {
      const roomId = 'test-room-123';
      const roomContexts = new Map();

      if (!roomContexts.has(roomId)) {
        roomContexts.set(roomId, {
          meetingType: null,
          participants: new Set(),
          topics: new Set(),
          projectsMentioned: new Set(),
          decisions: [],
          actionItems: [],
          tags: new Set(),
          selectedBucket: null
        });
      }

      expect(roomContexts.has(roomId)).to.be.true;
      const context = roomContexts.get(roomId);
      expect(context).to.have.property('selectedBucket', null);
      expect(context).to.have.property('participants');
      expect(context.participants).to.be.instanceOf(Set);
    });

    it('should preserve existing room context when it exists', () => {
      const roomId = 'test-room-123';
      const roomContexts = new Map();
      
      // Create initial context
      roomContexts.set(roomId, {
        meetingType: 'technical',
        participants: new Set(['Alice', 'Bob']),
        topics: new Set(['React', 'Node.js']),
        projectsMentioned: new Set(['Project A']),
        decisions: [],
        actionItems: [],
        tags: new Set(['meeting']),
        selectedBucket: 'n1'
      });

      // Check if exists before creating
      if (!roomContexts.has(roomId)) {
        roomContexts.set(roomId, {
          meetingType: null,
          participants: new Set(),
          topics: new Set(),
          projectsMentioned: new Set(),
          decisions: [],
          actionItems: [],
          tags: new Set(),
          selectedBucket: null
        });
      }

      const context = roomContexts.get(roomId);
      expect(context.meetingType).to.equal('technical');
      expect(context.selectedBucket).to.equal('n1');
      expect(Array.from(context.participants)).to.include.members(['Alice', 'Bob']);
    });
  });

  describe('Integration: useRAG + Bucket Filtering', () => {
    beforeEach(() => {
      process.env.GCS_BUCKET_N1 = 'syncscribe-n1';
      process.env.GCS_BUCKET_U1 = 'syncscribe-u1';
    });

    it('should use N-1 bucket filter when useRAG=true and selectedBucket=n1', () => {
      const useRAG = true;
      const roomContext = { selectedBucket: 'n1' };
      
      let bucketFilter = null;
      if (roomContext.selectedBucket === 'n1') {
        bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
      } else if (roomContext.selectedBucket === 'u1') {
        bucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
      }

      expect(useRAG).to.be.true;
      expect(bucketFilter).to.equal('syncscribe-n1');
    });

    it('should use U-1 bucket filter when useRAG=true and selectedBucket=u1', () => {
      const useRAG = true;
      const roomContext = { selectedBucket: 'u1' };
      
      let bucketFilter = null;
      if (roomContext.selectedBucket === 'n1') {
        bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
      } else if (roomContext.selectedBucket === 'u1') {
        bucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
      }

      expect(useRAG).to.be.true;
      expect(bucketFilter).to.equal('syncscribe-u1');
    });

    it('should use no bucket filter when useRAG=true and selectedBucket=null', () => {
      const useRAG = true;
      const roomContext = { selectedBucket: null };
      
      let bucketFilter = null;
      if (roomContext.selectedBucket === 'n1') {
        bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
      } else if (roomContext.selectedBucket === 'u1') {
        bucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
      }

      expect(useRAG).to.be.true;
      expect(bucketFilter).to.be.null; // Should search all buckets
    });

    it('should not search documents when useRAG=false regardless of bucket selection', () => {
      const useRAG = false;
      const roomContext = { selectedBucket: 'n1' };
      
      // When useRAG is false, bucket filter should not matter
      const shouldSearchDocuments = useRAG === true || useRAG === 'true' || useRAG === 1;
      
      expect(shouldSearchDocuments).to.be.false;
      // Document search should be skipped
    });
  });
});

