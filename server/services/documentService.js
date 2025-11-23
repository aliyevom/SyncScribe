// Document RAG Service - Integrates GCS, Qwen3 Embeddings, and Vector DB
require('dotenv').config();
const { Storage } = require('@google-cloud/storage');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');

class DocumentService {
  constructor() {
    // GCS Configuration
    this.projectId = process.env.GCS_PROJECT_ID;
    this.bucketN1 = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
    this.bucketU1 = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
    
    // Initialize GCS client
    try {
      const gcsConfig = {
        projectId: this.projectId
      };

      // Prefer environment variables for credentials if available
      if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
        gcsConfig.credentials = {
          client_email: process.env.GCS_CLIENT_EMAIL,
          private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n') // Handle escaped newlines
        };
      } else {
        // Fallback to key file
        gcsConfig.keyFilename = path.join(__dirname, '../key.json');
      }

      this.storage = new Storage(gcsConfig);
      console.log('[OK] GCS Storage initialized');
    } catch (error) {
      console.warn('[X] GCS initialization failed, using fallback:', error.message);
      this.storage = null;
    }

    // OpenRouter Configuration for Embeddings
    this.openRouterKey = process.env.OPENROUTER_API_KEY;
    // Using OpenAI embeddings via OpenRouter (Qwen embeddings not available)
    // Options: text-embedding-ada-002 (1536 dims), text-embedding-3-small (1536 dims), text-embedding-3-large (3072 dims)
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'openai/text-embedding-ada-002';
    this.embeddingDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536');
    this.embeddingBatchSize = parseInt(process.env.EMBEDDING_BATCH_SIZE || '10');

    // Document Processing Configuration
    this.chunkSize = parseInt(process.env.DOCUMENT_CHUNK_SIZE || '1000');
    this.chunkOverlap = parseInt(process.env.DOCUMENT_CHUNK_OVERLAP || '200');
    this.minSimilarity = parseFloat(process.env.DOCUMENT_MIN_SIMILARITY || '0.7');

    // Vector Database Configuration
    this.vectorDbType = process.env.VECTOR_DB_TYPE || 'memory';
    this.vectorDbUrl = process.env.VECTOR_DB_URL;
    this.collectionName = process.env.VECTOR_DB_COLLECTION || 'syncscribe_documents';

    // In-memory vector store as fallback
    this.memoryVectorStore = {
      documents: [],
      embeddings: []
    };

    // Initialize Vector DB
    this.initializeVectorDB();

    // Document processing state
    this.processingState = {
      lastProcessed: null,
      totalDocuments: 0,
      totalChunks: 0,
      recentDocuments: [],
      errors: []
    };

    // Setup auto-processing schedule if enabled
    if (process.env.ENABLE_AUTO_DOCUMENT_PROCESSING === 'true') {
      this.setupAutoProcessing();
    }
  }

  // Initialize Vector Database (Qdrant or fallback to memory)
  async initializeVectorDB() {
    if (this.vectorDbType === 'qdrant' && this.vectorDbUrl) {
      try {
        const { QdrantClient } = require('@qdrant/js-client-rest');
        this.qdrantClient = new QdrantClient({ url: this.vectorDbUrl });
        
        // Check if collection exists, create if not
        const collections = await this.qdrantClient.getCollections();
        const collectionExists = collections.collections.some(c => c.name === this.collectionName);
        
        if (!collectionExists) {
          await this.qdrantClient.createCollection(this.collectionName, {
            vectors: {
              size: this.embeddingDimensions,
              distance: 'Cosine'
            }
          });
          console.log(`[OK] Created Qdrant collection: ${this.collectionName}`);
        } else {
          console.log(`[OK] Qdrant collection exists: ${this.collectionName}`);
        }
      } catch (error) {
        console.warn('[X] Qdrant initialization failed, using memory store:', error.message);
        this.vectorDbType = 'memory';
      }
    } else {
      console.log('[OK] Using in-memory vector store');
      this.vectorDbType = 'memory';
    }
  }

  // Setup automatic document processing schedule
  setupAutoProcessing() {
    const schedule = process.env.DOCUMENT_PROCESSING_SCHEDULE || '0 2 * * *';
    console.log(`[OK] Scheduled document processing: ${schedule}`);
    
    cron.schedule(schedule, async () => {
      console.log('[OK] Starting scheduled document processing...');
      await this.processAllDocuments();
    });
  }

  // Generate embeddings using Qwen3 via OpenRouter
  async generateEmbeddings(texts) {
    if (!this.openRouterKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    try {
      // Process in batches
      const allEmbeddings = [];
      
      for (let i = 0; i < texts.length; i += this.embeddingBatchSize) {
        const batch = texts.slice(i, i + this.embeddingBatchSize);
        
        // OpenRouter embeddings API - try multiple model formats
        const requestBody = {
          model: this.embeddingModel,
          input: batch.length === 1 ? batch[0] : batch // Single string or array
        };

        const response = await axios.post(
          'https://openrouter.ai/api/v1/embeddings',
          requestBody,
          {
            headers: {
              'Authorization': `Bearer ${this.openRouterKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://syncscribe.app',
              'X-Title': 'SyncScribe Document RAG'
            }
          }
        );

        // Handle response format
        if (response.data && response.data.data) {
          const embeddings = response.data.data.map(item => item.embedding);
          allEmbeddings.push(...embeddings);
        } else if (response.data && Array.isArray(response.data)) {
          // Some APIs return array directly
          allEmbeddings.push(...response.data);
        } else {
          console.error('Unexpected response format:', JSON.stringify(response.data).substring(0, 200));
          throw new Error('Unexpected embedding response format');
        }
      }

      return allEmbeddings;
    } catch (error) {
      if (error.response) {
        console.error('OpenRouter API Error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          model: this.embeddingModel,
          batchSize: texts.length
        });
        throw new Error(`OpenRouter API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else {
        console.error('Error generating embeddings:', error.message);
        throw error;
      }
    }
  }

  // Chunk text into overlapping segments
  chunkText(text, metadata = {}) {
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= this.chunkSize) {
        currentChunk += sentence;
      } else {
        if (currentChunk) {
          chunks.push({
            text: currentChunk.trim(),
            metadata: { ...metadata, chunkIndex: chunks.length }
          });
        }
        currentChunk = sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push({
        text: currentChunk.trim(),
        metadata: { ...metadata, chunkIndex: chunks.length }
      });
    }

    return chunks;
  }

  // Process PDF file
  async processPDF(buffer, filename) {
    try {
      const data = await pdfParse(buffer);
      return {
        text: data.text,
        pages: data.numpages,
        info: data.info
      };
    } catch (error) {
      console.error(`Error processing PDF ${filename}:`, error.message);
      throw error;
    }
  }

  // Process text/markdown file
  async processTextFile(buffer, filename) {
    return {
      text: buffer.toString('utf-8'),
      pages: 1,
      info: { title: filename }
    };
  }

  // Download and process document from GCS
  async processDocument(bucketName, filename) {
    if (!this.storage) {
      throw new Error('GCS Storage not initialized');
    }

    try {
      console.log(`[OK] Processing document: ${bucketName}/${filename}`);
      
      // Download file from GCS
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(filename);
      const [buffer] = await file.download();

      // Determine file type and process accordingly
      const ext = path.extname(filename).toLowerCase();
      let processedData;

      if (ext === '.pdf') {
        processedData = await this.processPDF(buffer, filename);
      } else if (['.txt', '.md', '.markdown'].includes(ext)) {
        processedData = await this.processTextFile(buffer, filename);
      } else {
        console.warn(`Unsupported file type: ${ext}`);
        return null;
      }

      // Chunk the text
      const metadata = {
        filename,
        bucket: bucketName,
        pages: processedData.pages,
        fileType: ext,
        processedAt: new Date().toISOString()
      };

      const chunks = this.chunkText(processedData.text, metadata);
      console.log(`  ↳ Created ${chunks.length} chunks`);

      // Generate embeddings
      const texts = chunks.map(c => c.text);
      const embeddings = await this.generateEmbeddings(texts);
      console.log(`  ↳ Generated ${embeddings.length} embeddings`);

      // Store in vector database
      await this.storeEmbeddings(chunks, embeddings);

      // Update processing state
      this.processingState.recentDocuments.unshift({
        filename,
        bucket: bucketName,
        chunks: chunks.length,
        processedAt: metadata.processedAt
      });

      // Keep only last 20 recent documents
      if (this.processingState.recentDocuments.length > 20) {
        this.processingState.recentDocuments = this.processingState.recentDocuments.slice(0, 20);
      }

      this.processingState.totalDocuments++;
      this.processingState.totalChunks += chunks.length;

      return {
        filename,
        chunks: chunks.length,
        embeddings: embeddings.length,
        metadata
      };
    } catch (error) {
      console.error(`Error processing document ${filename}:`, error.message);
      this.processingState.errors.push({
        filename,
        bucket: bucketName,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  // Store embeddings in vector database
  async storeEmbeddings(chunks, embeddings) {
    if (this.vectorDbType === 'qdrant' && this.qdrantClient) {
      // Store in Qdrant
      const points = chunks.map((chunk, idx) => ({
        id: Date.now() + idx,
        vector: embeddings[idx],
        payload: {
          text: chunk.text,
          metadata: chunk.metadata
        }
      }));

      await this.qdrantClient.upsert(this.collectionName, {
        wait: true,
        points
      });
    } else {
      // Store in memory
      chunks.forEach((chunk, idx) => {
        this.memoryVectorStore.documents.push({
          text: chunk.text,
          metadata: chunk.metadata,
          embedding: embeddings[idx]
        });
      });
    }
  }

  // Calculate cosine similarity
  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // Search for relevant documents
  async searchDocuments(query, topK = 5, bucketFilter = null) {
    try {
      // Generate embedding for query
      const [queryEmbedding] = await this.generateEmbeddings([query]);

      if (bucketFilter) {
        console.log(`Filtering by bucket: ${bucketFilter}`);
      } else {
        console.log(`No bucket filter (searching all buckets)`);
      }

      if (this.vectorDbType === 'qdrant' && this.qdrantClient) {
        // Search in Qdrant with optional bucket filter
        const searchParams = {
          vector: queryEmbedding,
          limit: topK * 2, // Get more results to filter
          score_threshold: this.minSimilarity
        };

        // Add bucket filter if specified
        if (bucketFilter) {
          searchParams.filter = {
            must: [{
              key: 'metadata.bucket',
              match: { value: bucketFilter }
            }]
          };
        }

        const results = await this.qdrantClient.search(this.collectionName, searchParams);

        const filtered = results
          .filter(result => {
            // Double-check bucket filter match
            if (bucketFilter && result.payload.metadata?.bucket !== bucketFilter) {
              return false;
            }
            return true;
          })
          .slice(0, topK)
          .map(result => ({
            text: result.payload.text,
            metadata: result.payload.metadata,
            similarity: result.score
          }));

        if (bucketFilter && filtered.length > 0) {
          console.log(`[OK] Found ${filtered.length} documents in bucket ${bucketFilter}`);
          filtered.forEach(doc => {
            console.log(`      - ${doc.metadata.filename} (${(doc.similarity * 100).toFixed(1)}%)`);
          });
        }

        return filtered;
      } else {
        // Search in memory with optional bucket filter
        const allDocs = this.memoryVectorStore.documents || [];
        
        // Log all document buckets for debugging
        if (bucketFilter) {
          const bucketsInStore = [...new Set(allDocs.map(doc => doc.metadata?.bucket).filter(Boolean))];
          console.log(`Documents in store: ${allDocs.length} total`);
          console.log(`Unique buckets in store: ${bucketsInStore.join(', ')}`);
          console.log(`Filtering for bucket: ${bucketFilter}`);
        }
        
        const bucketFiltered = bucketFilter 
          ? allDocs.filter(doc => {
              const matches = doc.metadata?.bucket === bucketFilter;
              if (!matches && bucketFilter) {
                console.log(`[X] Document ${doc.metadata?.filename} has bucket "${doc.metadata?.bucket}" but filter is "${bucketFilter}"`);
              }
              return matches;
            })
          : allDocs;
        
        console.log(`Total docs: ${allDocs.length}, After bucket filter: ${bucketFiltered.length}`);

        const scored = bucketFiltered
          .map(doc => ({
            ...doc,
            similarity: this.cosineSimilarity(queryEmbedding, doc.embedding)
          }));

        const filtered = scored
          .filter(doc => doc.similarity >= this.minSimilarity)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, topK)
          .map(({ text, metadata, similarity }) => ({ text, metadata, similarity }));

        if (bucketFilter) {
          if (filtered.length > 0) {
            console.log(`[OK] Found ${filtered.length} documents in bucket ${bucketFilter}`);
            filtered.forEach(doc => {
              console.log(`      - ${doc.metadata.filename} from bucket ${doc.metadata.bucket} (${(doc.similarity * 100).toFixed(1)}%)`);
            });
          } else {
            console.log(`[X] No documents found in bucket ${bucketFilter} (searched ${bucketFiltered.length} docs from that bucket)`);
            // Verify bucket exists in store
            const bucketsInStore = [...new Set(allDocs.map(doc => doc.metadata?.bucket).filter(Boolean))];
            console.log(`Available buckets in store: ${bucketsInStore.join(', ')}`);
          }
        }

        return filtered;
      }
    } catch (error) {
      console.error('Error searching documents:', error.message);
      return [];
    }
  }

  // Process all documents from both buckets
  async processAllDocuments() {
    if (!this.storage) {
      console.warn('[X] GCS Storage not initialized, skipping document processing');
      return { success: false, error: 'GCS not initialized' };
    }

    console.log('[OK] Starting document processing...');
    const startTime = Date.now();
    const results = {
      processed: [],
      failed: [],
      totalDocuments: 0,
      totalChunks: 0
    };

    try {
      // Process N-1 bucket
      await this.processBucket(this.bucketN1, results);
      
      // Process U-1 bucket
      await this.processBucket(this.bucketU1, results);

      this.processingState.lastProcessed = new Date().toISOString();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[OK] Document processing complete in ${duration}s`);
      console.log(`  ↳ Processed: ${results.totalDocuments} documents, ${results.totalChunks} chunks`);
      
      return {
        success: true,
        ...results,
        duration,
        timestamp: this.processingState.lastProcessed
      };
    } catch (error) {
      console.error('Error processing documents:', error.message);
      return {
        success: false,
        error: error.message,
        ...results
      };
    }
  }

  // Process all documents in a bucket
  async processBucket(bucketName, results) {
    try {
      const bucket = this.storage.bucket(bucketName);
      const [files] = await bucket.getFiles();

      console.log(`[OK] Processing ${files.length} files from ${bucketName}`);

      for (const file of files) {
        const ext = path.extname(file.name).toLowerCase();
        if (['.pdf', '.txt', '.md', '.markdown'].includes(ext)) {
          try {
            const result = await this.processDocument(bucketName, file.name);
            if (result) {
              results.processed.push(result);
              results.totalDocuments++;
              results.totalChunks += result.chunks;
            }
          } catch (error) {
            results.failed.push({
              filename: file.name,
              bucket: bucketName,
              error: error.message
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error processing bucket ${bucketName}:`, error.message);
      throw error;
    }
  }

  // Get service health status
  getHealthStatus() {
    return {
      gcs: {
        enabled: !!this.storage,
        projectId: this.projectId,
        buckets: {
          n1: this.bucketN1,
          u1: this.bucketU1
        }
      },
      embeddings: {
        provider: 'OpenRouter',
        model: this.embeddingModel,
        dimensions: this.embeddingDimensions,
        configured: !!this.openRouterKey
      },
      vectorDb: {
        type: this.vectorDbType,
        url: this.vectorDbUrl,
        collection: this.collectionName,
        documentsCount: this.vectorDbType === 'memory' ? 
          this.memoryVectorStore.documents.length : 'N/A'
      },
      processing: {
        ...this.processingState,
        autoProcessing: process.env.ENABLE_AUTO_DOCUMENT_PROCESSING === 'true',
        schedule: process.env.DOCUMENT_PROCESSING_SCHEDULE || '0 2 * * *'
      }
    };
  }
}

module.exports = new DocumentService();

