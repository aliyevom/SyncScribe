/**
 * MongoDB Atlas Storage for Conversation Tracker
 * Stores conversation data for persistence and historical analysis
 * 
 * Setup:
 * 1. Create MongoDB Atlas cluster on GCP
 * 2. Add MONGODB_URI to .env
 * 3. This service will automatically store conversation data
 */

const MongoClient = require('mongodb').MongoClient;

class MongoConversationStore {
  constructor() {
    this.client = null;
    this.db = null;
    this.collections = {
      conversations: null,
      turns: null,
      entities: null,
      analytics: null
    };
    
    this.isConnected = false;
    
    // Auto-connect if MongoDB URI is available
    if (process.env.MONGODB_URI) {
      this.connect().catch(err => {
        console.warn('[MongoDB] Could not connect:', err.message);
      });
    } else {
      console.log('[MongoDB] MONGODB_URI not set, using in-memory only');
    }
  }
  
  /**
   * Connect to MongoDB Atlas
   */
  async connect() {
    if (this.isConnected) return;
    
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI environment variable not set');
    }
    
    try {
      console.log('[MongoDB] Connecting to Atlas...');
      
      this.client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      await this.client.connect();
      
      const dbName = process.env.MONGODB_DB_NAME || 'syncscribe';
      this.db = this.client.db(dbName);
      
      // Initialize collections
      this.collections.conversations = this.db.collection('conversations');
      this.collections.turns = this.db.collection('conversation_turns');
      this.collections.entities = this.db.collection('entities');
      this.collections.analytics = this.db.collection('analytics');
      
      // Create indexes for better performance
      await this._createIndexes();
      
      this.isConnected = true;
      console.log(`[MongoDB] ✅ Connected to Atlas database: ${dbName}`);
      
    } catch (error) {
      console.error('[MongoDB] Connection failed:', error.message);
      this.isConnected = false;
      throw error;
    }
  }
  
  /**
   * Create indexes for performance
   */
  async _createIndexes() {
    try {
      // Conversation indexes
      await this.collections.conversations.createIndex({ roomId: 1, startTime: -1 });
      await this.collections.conversations.createIndex({ 'metadata.sessionId': 1 });
      
      // Turn indexes
      await this.collections.turns.createIndex({ roomId: 1, timestamp: -1 });
      await this.collections.turns.createIndex({ 'entities.technical': 1 });
      await this.collections.turns.createIndex({ speaker: 1 });
      
      // Entity indexes
      await this.collections.entities.createIndex({ roomId: 1, entityId: 1 }, { unique: true });
      await this.collections.entities.createIndex({ type: 1 });
      
      // Analytics indexes
      await this.collections.analytics.createIndex({ roomId: 1, timestamp: -1 });
      
      console.log('[MongoDB] ✅ Indexes created');
    } catch (error) {
      console.warn('[MongoDB] Index creation warning:', error.message);
    }
  }
  
  /**
   * Save conversation session
   */
  async saveConversation(roomId, conversationState) {
    if (!this.isConnected) {
      console.log('[MongoDB] Not connected, skipping save');
      return null;
    }
    
    try {
      const doc = {
        roomId,
        startTime: conversationState.startTime,
        lastUpdateTime: conversationState.lastUpdateTime,
        metadata: conversationState.metadata,
        hiddenContext: {
          activeTopics: Array.from(conversationState.hiddenContext.activeTopics),
          activeSpeakers: Array.from(conversationState.hiddenContext.activeSpeakers),
          activeEntities: Object.fromEntries(conversationState.hiddenContext.activeEntities),
          conversationMode: conversationState.hiddenContext.conversationMode,
          emotionalTone: conversationState.hiddenContext.emotionalTone
        },
        coherence: conversationState.coherence,
        turnCount: conversationState.conversationHistory.length,
        updatedAt: new Date()
      };
      
      const result = await this.collections.conversations.updateOne(
        { roomId },
        { $set: doc },
        { upsert: true }
      );
      
      console.log(`[MongoDB] Conversation saved: ${roomId}`);
      return result;
      
    } catch (error) {
      console.error('[MongoDB] Error saving conversation:', error);
      return null;
    }
  }
  
  /**
   * Save conversation turn
   */
  async saveTurn(roomId, turnData) {
    if (!this.isConnected) return null;
    
    try {
      const doc = {
        roomId,
        ...turnData,
        savedAt: new Date()
      };
      
      const result = await this.collections.turns.insertOne(doc);
      console.log(`[MongoDB] Turn saved for room: ${roomId}`);
      return result;
      
    } catch (error) {
      console.error('[MongoDB] Error saving turn:', error);
      return null;
    }
  }
  
  /**
   * Save entity data
   */
  async saveEntity(roomId, entityId, entityData) {
    if (!this.isConnected) return null;
    
    try {
      const doc = {
        roomId,
        entityId,
        ...entityData,
        updatedAt: new Date()
      };
      
      const result = await this.collections.entities.updateOne(
        { roomId, entityId },
        { $set: doc },
        { upsert: true }
      );
      
      return result;
      
    } catch (error) {
      console.error('[MongoDB] Error saving entity:', error);
      return null;
    }
  }
  
  /**
   * Save analytics snapshot
   */
  async saveAnalytics(roomId, analytics) {
    if (!this.isConnected) return null;
    
    try {
      const doc = {
        roomId,
        timestamp: new Date(),
        ...analytics
      };
      
      const result = await this.collections.analytics.insertOne(doc);
      return result;
      
    } catch (error) {
      console.error('[MongoDB] Error saving analytics:', error);
      return null;
    }
  }
  
  /**
   * Get conversation history
   */
  async getConversationHistory(roomId, limit = 100) {
    if (!this.isConnected) return [];
    
    try {
      const turns = await this.collections.turns
        .find({ roomId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
      
      return turns.reverse(); // Chronological order
      
    } catch (error) {
      console.error('[MongoDB] Error fetching history:', error);
      return [];
    }
  }
  
  /**
   * Get analytics for a room
   */
  async getAnalytics(roomId, timeRange = { hours: 24 }) {
    if (!this.isConnected) return null;
    
    try {
      const since = new Date(Date.now() - (timeRange.hours * 60 * 60 * 1000));
      
      const analytics = await this.collections.analytics
        .find({ 
          roomId,
          timestamp: { $gte: since }
        })
        .sort({ timestamp: -1 })
        .toArray();
      
      return analytics;
      
    } catch (error) {
      console.error('[MongoDB] Error fetching analytics:', error);
      return null;
    }
  }
  
  /**
   * Search conversations by entity
   */
  async searchByEntity(entityId, limit = 50) {
    if (!this.isConnected) return [];
    
    try {
      const turns = await this.collections.turns
        .find({
          $or: [
            { 'entities.people': entityId },
            { 'entities.technical': entityId }
          ]
        })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
      
      return turns;
      
    } catch (error) {
      console.error('[MongoDB] Error searching by entity:', error);
      return [];
    }
  }
  
  /**
   * Get conversation stats
   */
  async getStats(roomId) {
    if (!this.isConnected) return null;
    
    try {
      const conversation = await this.collections.conversations.findOne({ roomId });
      const turnCount = await this.collections.turns.countDocuments({ roomId });
      const entityCount = await this.collections.entities.countDocuments({ roomId });
      
      return {
        roomId,
        turnCount,
        entityCount,
        coherence: conversation?.coherence?.overall || 0,
        lastUpdate: conversation?.updatedAt
      };
      
    } catch (error) {
      console.error('[MongoDB] Error getting stats:', error);
      return null;
    }
  }
  
  /**
   * Clean up old data
   */
  async cleanup(daysOld = 30) {
    if (!this.isConnected) return;
    
    try {
      const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
      
      const result = await this.collections.turns.deleteMany({
        timestamp: { $lt: cutoffDate.getTime() }
      });
      
      console.log(`[MongoDB] Cleaned up ${result.deletedCount} old turns`);
      return result;
      
    } catch (error) {
      console.error('[MongoDB] Error during cleanup:', error);
      return null;
    }
  }
  
  /**
   * Disconnect from MongoDB
   */
  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('[MongoDB] Disconnected');
    }
  }
}

// Create singleton instance
const mongoStore = new MongoConversationStore();

module.exports = {
  MongoConversationStore,
  mongoStore
};

