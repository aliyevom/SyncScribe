/**
 * Advanced Conversation Tracker Service
 * 
 * Based on Deep Learning for NLP concepts:
 * - RNN-inspired conversation memory (hidden states tracking context)
 * - Attention mechanisms for important phrase detection
 * - Semantic similarity tracking for topic coherence
 * - Entity relationship graph building
 * - Sequence-to-sequence conversation flow analysis
 * 
 * References:
 * - Chapter 3: RNN Hidden States for temporal context
 * - Chapter 3: Attention Scoring for focus detection
 * - Chapter 2: Word Embeddings for semantic similarity
 * - Chapter 4: Sequence modeling for conversation flow
 */

// MongoDB integration (optional)
let mongoStore = null;
try {
  const { mongoStore: ms } = require('./mongoConversationStore');
  mongoStore = ms;
  console.log('[Conversation Tracker] MongoDB integration enabled');
} catch (error) {
  console.log('[Conversation Tracker] MongoDB not available, using in-memory only');
}

class ConversationTracker {
  constructor() {
    // ===== CONVERSATION MEMORY (RNN-inspired Hidden State) =====
    // This acts like an RNN's hidden state, accumulating context over time
    this.conversationMemory = new Map(); // roomId -> ConversationState
    
    // ===== ATTENTION WEIGHTS =====
    // Track importance scores of phrases (attention mechanism)
    this.attentionScores = new Map(); // roomId -> Map<phrase, score>
    
    // ===== ENTITY GRAPH =====
    // Build a graph of entities and their relationships
    this.entityGraph = new Map(); // roomId -> Graph
    
    // ===== CONVERSATION FLOW =====
    // Track patterns: question -> answer -> action
    this.conversationFlow = new Map(); // roomId -> FlowSequence[]
    
    // ===== SEMANTIC SIMILARITY CACHE =====
    // Track topic coherence across conversation segments
    this.topicCoherence = new Map(); // roomId -> CoherenceMetrics
    
    // Configuration
    this.config = {
      // Memory window (like LSTM memory span)
      memoryWindow: 10, // Last 10 conversation turns
      
      // Attention threshold (minimum score to be "important")
      attentionThreshold: 0.6,
      
      // Entity extraction patterns (Enhanced for full phrases and sentences)
      entityPatterns: {
        person: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, // John Doe (require full name)
        
        // Multi-word technical concepts (2-5 words)
        technical: /\b(?:maximum (?:area|square)|good land|bad land|naive solution|time complexity|matrix dimensions|square area|rectangle area|brute force|dynamic programming|optimal solution|data structure|algorithm|REST API|GraphQL|microservice|database query|cache layer|response time)\b/gi,
        
        // Action phrases (not just single words)
        action: /(?:need to|want to|going to|have to|should|must|will|can)\s+(?:\w+\s+){0,4}\w+/gi,
        
        // Decision phrases
        decision: /(?:decided to|agreed to|approved|chose to|selected|determined that)\s+(?:\w+\s+){0,4}\w+/gi,
        
        // Full questions (capture the whole question)
        question: /\b(?:what|why|how|when|where|who|could we|should we|can we|is it|do we)(?:\s+\w+){1,10}\?/gi,
        
        // Problem statements
        problem: /(?:issue|problem|challenge|bottleneck|blocker)(?:\s+(?:is|with|in))?\s+(?:\w+\s+){0,5}\w+/gi,
        
        // Solution statements  
        solution: /(?:solution|fix|resolve|implement|use)\s+(?:\w+\s+){0,5}\w+/gi
      },
      
      // Conversation patterns (Seq2Seq-inspired)
      flowPatterns: [
        { name: 'question_answer', sequence: ['question', 'answer'] },
        { name: 'problem_solution', sequence: ['problem', 'solution'] },
        { name: 'proposal_decision', sequence: ['proposal', 'decision'] },
        { name: 'action_commitment', sequence: ['action', 'commitment'] }
      ],
      
      // Coherence scoring
      coherenceWeights: {
        entityContinuity: 0.3,    // Same entities mentioned
        topicSimilarity: 0.4,     // Similar topics discussed
        temporalProximity: 0.2,   // Time between utterances
        syntacticPattern: 0.1      // Grammar/structure similarity
      }
    };
  }
  
  /**
   * Initialize conversation state for a new room/session
   * Similar to initializing RNN hidden state with zeros
   */
  initializeConversation(roomId, metadata = {}) {
    const initialState = {
      // === MEMORY STATE (RNN Hidden State) ===
      conversationHistory: [], // Rolling window of conversation turns
      
      // === HIDDEN CONTEXT (Like LSTM Cell State) ===
      hiddenContext: {
        activeTopics: new Set(),        // Topics being discussed
        activeSpeakers: new Set(),      // Who's speaking
        activeEntities: new Map(),      // Entities and their mentions count
        conversationMode: 'exploration', // exploration, decision, action, wrap-up
        emotionalTone: 'neutral'        // neutral, positive, tense, excited
      },
      
      // === ATTENTION STATE ===
      attentionMap: new Map(), // phrase -> {score, timestamps[], context}
      focusShifts: [],         // Track when conversation focus changes
      
      // === ENTITY RELATIONSHIP GRAPH ===
      entityGraph: {
        nodes: new Map(),      // entity -> {type, attributes, mentions}
        edges: new Map(),      // "entity1->entity2" -> {relationship, strength}
        clusters: []           // Groups of related entities
      },
      
      // === FLOW TRACKING (Seq2Seq pattern) ===
      conversationFlow: [],    // Sequence of conversation units
      patterns: new Map(),     // Detected patterns and their frequency
      predictedNextType: null, // Predict what comes next
      
      // === COHERENCE METRICS ===
      coherence: {
        overall: 1.0,          // Overall conversation coherence (0-1)
        topicDrift: [],        // Track topic changes
        turnCoherence: [],     // Coherence between consecutive turns
        semanticDensity: 0     // Information density
      },
      
      // === TEMPORAL TRACKING ===
      timeline: [],            // Chronological events
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      
      // === METADATA ===
      metadata: {
        meetingType: metadata.meetingType || 'unknown',
        participants: metadata.participants || [],
        roomName: metadata.roomName || roomId,
        sessionId: metadata.sessionId || `session_${Date.now()}`
      }
    };
    
    this.conversationMemory.set(roomId, initialState);
    console.log(`[Conversation Tracker] Initialized for room: ${roomId}`);
    
    return initialState;
  }
  
  /**
   * Process a new conversation turn (like RNN processing a time step)
   * 
   * @param {string} roomId - Room/session identifier
   * @param {object} turn - Conversation turn data
   * @returns {object} Enhanced turn data with tracking metadata
   */
  processConversationTurn(roomId, turn) {
    // Get or create conversation state
    if (!this.conversationMemory.has(roomId)) {
      this.initializeConversation(roomId);
    }
    
    const state = this.conversationMemory.get(roomId);
    const timestamp = Date.now();
    
    // === 1. EXTRACT FEATURES FROM TURN ===
    const features = this._extractTurnFeatures(turn.text, turn.speaker);
    
    // === 2. UPDATE ATTENTION SCORES ===
    const attentionUpdate = this._updateAttentionScores(state, features, timestamp);
    
    // === 3. UPDATE ENTITY GRAPH ===
    this._updateEntityGraph(state, features, timestamp);
    
    // === 4. ANALYZE CONVERSATION FLOW ===
    const flowAnalysis = this._analyzeConversationFlow(state, features, timestamp);
    
    // === 5. CALCULATE COHERENCE ===
    const coherenceMetrics = this._calculateCoherence(state, features, timestamp);
    
    // === 6. UPDATE HIDDEN CONTEXT (like LSTM cell state update) ===
    this._updateHiddenContext(state, features, flowAnalysis);
    
    // === 7. ADD TO CONVERSATION HISTORY (with memory window) ===
    const enhancedTurn = {
      ...turn,
      timestamp,
      features,
      attentionScore: attentionUpdate.turnAttentionScore,
      importantPhrases: attentionUpdate.importantPhrases,
      entities: features.entities,
      flowType: flowAnalysis.turnType,
      coherenceScore: coherenceMetrics.turnCoherence,
      contextLinks: this._findContextLinks(state, features)
    };
    
    state.conversationHistory.push(enhancedTurn);
    
    // Maintain memory window (like RNN sequence length limit)
    if (state.conversationHistory.length > this.config.memoryWindow) {
      const removed = state.conversationHistory.shift();
      // Archive removed turns for long-term memory
      this._archiveTurn(roomId, removed);
    }
    
    state.lastUpdateTime = timestamp;
    
    // === 8. GENERATE INSIGHTS ===
    const insights = this._generateInsights(state, enhancedTurn);
    
    // === 9. SAVE TO MONGODB (if available) ===
    if (mongoStore && mongoStore.isConnected) {
      // Save asynchronously, don't block response
      Promise.all([
        mongoStore.saveTurn(roomId, enhancedTurn),
        mongoStore.saveConversation(roomId, state)
      ]).catch(err => {
        console.warn('[MongoDB] Save error:', err.message);
      });
    }
    
    return {
      turn: enhancedTurn,
      state: this._getPublicState(state),
      insights,
      recommendations: this._generateRecommendations(state, flowAnalysis)
    };
  }
  
  /**
   * Extract features from conversation turn
   * Similar to feature extraction in NLP preprocessing
   */
  _extractTurnFeatures(text, speaker = 'unknown') {
    const words = text.toLowerCase().split(/\s+/);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    
    // === ENHANCED ENTITY EXTRACTION ===
    const entities = {
      people: this._extractPattern(text, this.config.entityPatterns.person),
      technical: this._extractPattern(text, this.config.entityPatterns.technical),
      actions: this._extractAndClean(text, this.config.entityPatterns.action),
      decisions: this._extractAndClean(text, this.config.entityPatterns.decision),
      questions: this._extractPattern(text, this.config.entityPatterns.question),
      problems: this._extractAndClean(text, this.config.entityPatterns.problem),
      solutions: this._extractAndClean(text, this.config.entityPatterns.solution)
    };
    
    // Extract meaningful phrases from sentences (noun phrases, topics)
    const concepts = this._extractMeaningfulPhrases(sentences);
    entities.concepts = concepts;
    
    // === N-GRAM EXTRACTION (for phrase detection) ===
    const bigrams = this._extractNGrams(words, 2);
    const trigrams = this._extractNGrams(words, 3);
    
    // === KEYWORD EXTRACTION (TF-IDF-inspired) ===
    const keywords = this._extractKeywords(text);
    
    // === SENTIMENT SIGNALS ===
    const sentiment = this._detectSentiment(text);
    
    // === TURN TYPE CLASSIFICATION ===
    const turnType = this._classifyTurnType(text, entities);
    
    return {
      text,
      speaker,
      words,
      sentences,
      wordCount: words.length,
      sentenceCount: sentences.length,
      entities,
      bigrams,
      trigrams,
      keywords,
      sentiment,
      turnType,
      // Linguistic features
      hasQuestion: /\?/.test(text),
      hasExclamation: /!/.test(text),
      isImperative: /\b(do|make|create|update|fix|check)\b/i.test(text),
      isAgreement: /\b(yes|agree|sounds good|absolutely|definitely)\b/i.test(text),
      isDisagreement: /\b(no|disagree|not sure|however|but)\b/i.test(text)
    };
  }
  
  /**
   * Update Attention Scores (Attention Mechanism from Ch 3)
   * 
   * Attention helps identify which parts of conversation are most important
   * Similar to how attention in neural networks focuses on relevant inputs
   */
  _updateAttentionScores(state, features, timestamp) {
    const importantPhrases = [];
    let turnAttentionScore = 0;
    
    // === SCORE KEYWORDS ===
    features.keywords.forEach(keyword => {
      let score = 0.5; // Base score
      
      // Boost score if:
      // - Contains action words
      if (this.config.entityPatterns.action.test(keyword)) score += 0.2;
      // - Contains decision words
      if (this.config.entityPatterns.decision.test(keyword)) score += 0.25;
      // - Contains technical terms
      if (this.config.entityPatterns.technical.test(keyword)) score += 0.15;
      // - Is a question
      if (this.config.entityPatterns.question.test(keyword)) score += 0.1;
      
      // Add to attention map
      if (!state.attentionMap.has(keyword)) {
        state.attentionMap.set(keyword, {
          score: 0,
          timestamps: [],
          context: []
        });
      }
      
      const attention = state.attentionMap.get(keyword);
      
      // Exponential Moving Average of attention score
      // (similar to updating RNN hidden state)
      const alpha = 0.3; // Learning rate
      attention.score = alpha * score + (1 - alpha) * attention.score;
      attention.timestamps.push(timestamp);
      attention.context.push(features.text.substring(0, 100));
      
      // Keep only recent context
      if (attention.timestamps.length > 5) {
        attention.timestamps.shift();
        attention.context.shift();
      }
      
      state.attentionMap.set(keyword, attention);
      
      // Track important phrases (above threshold)
      if (attention.score >= this.config.attentionThreshold) {
        importantPhrases.push({
          phrase: keyword,
          score: attention.score,
          frequency: attention.timestamps.length
        });
      }
      
      turnAttentionScore += score;
    });
    
    // Normalize turn attention score
    turnAttentionScore = features.keywords.length > 0 
      ? turnAttentionScore / features.keywords.length 
      : 0;
    
    return {
      turnAttentionScore,
      importantPhrases: importantPhrases.sort((a, b) => b.score - a.score)
    };
  }
  
  /**
   * Update Entity Relationship Graph
   * Build a graph of entities and their connections (like knowledge graph)
   */
  _updateEntityGraph(state, features, timestamp) {
    const graph = state.entityGraph;
    
    // === ADD ENTITIES AS NODES (Prioritize meaningful concepts) ===
    const allEntities = [
      // High priority - actual conversation topics
      ...features.entities.concepts.map(e => ({ id: e.substring(0, 60), type: 'concept', priority: 3 })),
      ...features.entities.technical.map(e => ({ id: e, type: 'technical', priority: 2 })),
      ...features.entities.people.map(e => ({ id: e, type: 'person', priority: 2 })),
      
      // Medium priority - problems and solutions
      ...features.entities.problems.map(e => ({ id: e.substring(0, 60), type: 'problem', priority: 2 })),
      ...features.entities.solutions.map(e => ({ id: e.substring(0, 60), type: 'solution', priority: 2 })),
      ...features.entities.decisions.map(e => ({ id: e.substring(0, 60), type: 'decision', priority: 2 })),
      
      // Low priority - generic actions (filter out if too many)
      ...features.entities.actions
        .filter(a => a.length > 10) // Only keep longer action phrases
        .map(e => ({ id: e.substring(0, 60), type: 'action', priority: 1 }))
    ];
    
    // Limit total entities to prevent overcrowding (keep highest priority)
    const sortedEntities = allEntities
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 20); // Max 20 entities per turn
    
    sortedEntities.forEach(entity => {
      if (!graph.nodes.has(entity.id)) {
        graph.nodes.set(entity.id, {
          id: entity.id,
          type: entity.type,
          priority: entity.priority,
          firstMentioned: timestamp,
          mentions: 0,
          contexts: [],
          connectedTo: new Set()
        });
      }
      
      const node = graph.nodes.get(entity.id);
      node.mentions++;
      node.lastMentioned = timestamp;
      node.contexts.push({
        text: features.text.substring(0, 150),
        timestamp,
        speaker: features.speaker
      });
      
      // Keep only recent contexts
      if (node.contexts.length > 3) {
        node.contexts.shift();
      }
    });
    
    // === CREATE EDGES (relationships between entities) ===
    // If two entities appear in same turn, they're related
    for (let i = 0; i < sortedEntities.length; i++) {
      for (let j = i + 1; j < sortedEntities.length; j++) {
        const entity1 = sortedEntities[i];
        const entity2 = sortedEntities[j];
        
        // Create bidirectional edge
        const edgeKey1 = `${entity1.id}->${entity2.id}`;
        const edgeKey2 = `${entity2.id}->${entity1.id}`;
        
        if (!graph.edges.has(edgeKey1)) {
          graph.edges.set(edgeKey1, {
            from: entity1.id,
            to: entity2.id,
            relationship: this._inferRelationship(entity1, entity2, features),
            strength: 0,
            coOccurrences: []
          });
        }
        
        const edge = graph.edges.get(edgeKey1);
        edge.strength++;
        edge.coOccurrences.push({
          timestamp,
          context: features.text.substring(0, 100)
        });
        
        // Update node connections
        if (graph.nodes.has(entity1.id)) {
          graph.nodes.get(entity1.id).connectedTo.add(entity2.id);
        }
        if (graph.nodes.has(entity2.id)) {
          graph.nodes.get(entity2.id).connectedTo.add(entity1.id);
        }
      }
    }
    
    // === DETECT ENTITY CLUSTERS (community detection) ===
    this._detectEntityClusters(graph);
  }
  
  /**
   * Analyze Conversation Flow (Sequence-to-Sequence pattern)
   * Detect patterns like: question -> answer -> decision -> action
   */
  _analyzeConversationFlow(state, features, timestamp) {
    // === CLASSIFY TURN TYPE ===
    const turnType = features.turnType;
    
    // === ADD TO FLOW SEQUENCE ===
    const flowUnit = {
      type: turnType,
      timestamp,
      features: {
        hasEntities: Object.values(features.entities).some(arr => arr.length > 0),
        hasKeywords: features.keywords.length > 0,
        sentiment: features.sentiment
      }
    };
    
    state.conversationFlow.push(flowUnit);
    
    // Maintain flow window
    if (state.conversationFlow.length > 20) {
      state.conversationFlow.shift();
    }
    
    // === DETECT PATTERNS IN FLOW ===
    const detectedPatterns = this._detectFlowPatterns(state.conversationFlow);
    
    // Update pattern frequency
    detectedPatterns.forEach(pattern => {
      const count = state.patterns.get(pattern.name) || 0;
      state.patterns.set(pattern.name, count + 1);
    });
    
    // === PREDICT NEXT TURN TYPE (like language model prediction) ===
    state.predictedNextType = this._predictNextTurnType(state.conversationFlow);
    
    // === DETECT FOCUS SHIFTS (attention mechanism) ===
    if (state.conversationFlow.length >= 2) {
      const prevTopic = state.conversationFlow[state.conversationFlow.length - 2];
      const currTopic = turnType;
      
      if (this._isSignificantShift(prevTopic.type, currTopic)) {
        state.focusShifts.push({
          from: prevTopic.type,
          to: currTopic,
          timestamp,
          context: features.text.substring(0, 100)
        });
      }
    }
    
    return {
      turnType,
      detectedPatterns,
      predictedNext: state.predictedNextType,
      flowHealth: this._assessFlowHealth(state.conversationFlow)
    };
  }
  
  /**
   * Calculate Coherence Metrics
   * Measures how well conversation segments link together
   */
  _calculateCoherence(state, features, timestamp) {
    if (state.conversationHistory.length === 0) {
      return { turnCoherence: 1.0, explanation: 'First turn' };
    }
    
    const lastTurn = state.conversationHistory[state.conversationHistory.length - 1];
    let coherenceScore = 0;
    const weights = this.config.coherenceWeights;
    
    // === 1. ENTITY CONTINUITY ===
    // Check if current turn mentions entities from previous turn
    const currentEntities = new Set([
      ...features.entities.people,
      ...features.entities.technical
    ]);
    
    const lastEntities = new Set([
      ...lastTurn.features.entities.people,
      ...lastTurn.features.entities.technical
    ]);
    
    const entityOverlap = this._setIntersection(currentEntities, lastEntities);
    const entityContinuity = currentEntities.size > 0 
      ? entityOverlap.size / currentEntities.size 
      : 0;
    
    coherenceScore += entityContinuity * weights.entityContinuity;
    
    // === 2. TOPIC SIMILARITY ===
    // Use keyword overlap as proxy for topic similarity (simplified Word2Vec)
    const topicSimilarity = this._calculateKeywordSimilarity(
      features.keywords,
      lastTurn.features.keywords
    );
    
    coherenceScore += topicSimilarity * weights.topicSimilarity;
    
    // === 3. TEMPORAL PROXIMITY ===
    // More coherent if turns are close in time
    const timeDelta = timestamp - lastTurn.timestamp;
    const temporalScore = Math.max(0, 1 - (timeDelta / 60000)); // Decay over 1 minute
    
    coherenceScore += temporalScore * weights.temporalProximity;
    
    // === 4. SYNTACTIC PATTERN ===
    // Check if turn follows expected pattern (Q->A, Problem->Solution)
    const patternMatch = this._matchesExpectedPattern(
      lastTurn.features.turnType,
      features.turnType
    );
    
    coherenceScore += (patternMatch ? 1 : 0) * weights.syntacticPattern;
    
    // === UPDATE COHERENCE HISTORY ===
    state.coherence.turnCoherence.push({
      timestamp,
      score: coherenceScore,
      components: {
        entityContinuity,
        topicSimilarity,
        temporalScore,
        patternMatch
      }
    });
    
    // Keep only recent coherence scores
    if (state.coherence.turnCoherence.length > 10) {
      state.coherence.turnCoherence.shift();
    }
    
    // === UPDATE OVERALL COHERENCE (exponential moving average) ===
    const alpha = 0.2;
    state.coherence.overall = alpha * coherenceScore + (1 - alpha) * state.coherence.overall;
    
    return {
      turnCoherence: coherenceScore,
      overall: state.coherence.overall,
      components: { entityContinuity, topicSimilarity, temporalScore, patternMatch }
    };
  }
  
  /**
   * Update Hidden Context (LSTM Cell State update)
   * This is the "memory" that persists across conversation
   */
  _updateHiddenContext(state, features, flowAnalysis) {
    const ctx = state.hiddenContext;
    
    // === UPDATE ACTIVE TOPICS ===
    features.keywords.forEach(keyword => ctx.activeTopics.add(keyword));
    
    // Decay old topics (forget mechanism)
    if (ctx.activeTopics.size > 10) {
      const topics = Array.from(ctx.activeTopics);
      ctx.activeTopics = new Set(topics.slice(-10)); // Keep most recent
    }
    
    // === UPDATE ACTIVE SPEAKERS ===
    ctx.activeSpeakers.add(features.speaker);
    
    // === UPDATE ACTIVE ENTITIES ===
    const allEntities = [
      ...features.entities.people,
      ...features.entities.technical,
      ...features.entities.concepts.slice(0, 5) // Top 5 concepts
    ];
    
    allEntities.forEach(entity => {
      const count = ctx.activeEntities.get(entity) || 0;
      ctx.activeEntities.set(entity, count + 1);
    });
    
    // === UPDATE CONVERSATION MODE ===
    ctx.conversationMode = this._inferConversationMode(
      features,
      flowAnalysis,
      state.conversationHistory
    );
    
    // === UPDATE EMOTIONAL TONE ===
    ctx.emotionalTone = features.sentiment.label;
    
    return ctx;
  }
  
  /**
   * Find Context Links - connect current turn to previous relevant turns
   * Similar to attention mechanism that links encoder and decoder states
   * ENHANCED: Uses sentence-level semantic similarity
   */
  _findContextLinks(state, features) {
    const links = [];
    
    // Collect all current entities (including concepts)
    const currentEntities = new Set([
      ...features.entities.people,
      ...features.entities.technical,
      ...features.entities.concepts
    ]);
    
    // Search through recent history for related turns
    state.conversationHistory.forEach((turn, index) => {
      const turnEntities = new Set([
        ...turn.features.entities.people,
        ...turn.features.entities.technical,
        ...(turn.features.entities.concepts || [])
      ]);
      
      const overlap = this._setIntersection(currentEntities, turnEntities);
      
      // Calculate entity-based similarity
      const entitySimilarity = currentEntities.size > 0 && turnEntities.size > 0
        ? overlap.size / Math.max(currentEntities.size, turnEntities.size)
        : 0;
      
      // Calculate sentence-level semantic similarity
      const sentenceSimilarity = this._calculateSentenceSimilarity(
        features.sentences,
        turn.features.sentences
      );
      
      // Combined similarity (weighted average)
      const combinedSimilarity = (entitySimilarity * 0.6) + (sentenceSimilarity * 0.4);
      
      if (combinedSimilarity > 0.2) { // Lower threshold for "related"
        links.push({
          turnIndex: index,
          timestamp: turn.timestamp,
          similarity: combinedSimilarity,
          entitySimilarity,
          sentenceSimilarity,
          sharedEntities: Array.from(overlap),
          context: turn.text.substring(0, 100)
        });
      }
    });
    
    return links.sort((a, b) => b.similarity - a.similarity);
  }
  
  /**
   * Calculate semantic similarity between two sets of sentences
   * Uses keyword overlap as proxy (simplified Word2Vec)
   */
  _calculateSentenceSimilarity(sentences1, sentences2) {
    if (!sentences1 || !sentences2 || sentences1.length === 0 || sentences2.length === 0) {
      return 0;
    }
    
    // Extract keywords from both sentence sets
    const keywords1 = new Set(
      sentences1.join(' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
        .filter(w => !['that', 'this', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should'].includes(w))
    );
    
    const keywords2 = new Set(
      sentences2.join(' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
        .filter(w => !['that', 'this', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should'].includes(w))
    );
    
    if (keywords1.size === 0 || keywords2.size === 0) return 0;
    
    // Jaccard similarity
    const intersection = this._setIntersection(keywords1, keywords2);
    const union = new Set([...keywords1, ...keywords2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Generate Insights from current conversation state
   */
  _generateInsights(state, currentTurn) {
    const insights = {
      // === CONVERSATION HEALTH ===
      health: {
        coherence: state.coherence.overall,
        participationBalance: this._calculateParticipationBalance(state),
        topicFocus: this._calculateTopicFocus(state),
        actionableRatio: this._calculateActionableRatio(state)
      },
      
      // === KEY MOMENTS ===
      keyMoments: this._identifyKeyMoments(state),
      
      // === ENTITY INSIGHTS ===
      topEntities: this._getTopEntities(state.entityGraph, 5),
      entityClusters: state.entityGraph.clusters,
      
      // === PATTERN INSIGHTS ===
      dominantPatterns: this._getDominantPatterns(state.patterns),
      
      // === CONVERSATION ARC ===
      conversationArc: this._describeConversationArc(state),
      
      // === RECOMMENDATIONS ===
      suggestedFocus: this._suggestConversationFocus(state, currentTurn)
    };
    
    return insights;
  }
  
  /**
   * Generate Recommendations based on conversation state
   */
  _generateRecommendations(state, flowAnalysis) {
    const recommendations = [];
    
    // === LOW COHERENCE WARNING ===
    if (state.coherence.overall < 0.5) {
      recommendations.push({
        type: 'warning',
        category: 'coherence',
        message: 'Conversation coherence is low. Consider summarizing or refocusing discussion.',
        priority: 'high'
      });
    }
    
    // === UNRESOLVED QUESTIONS ===
    const recentQuestions = state.conversationHistory
      .filter(turn => turn.features.hasQuestion)
      .slice(-5);
    
    const recentAnswers = state.conversationHistory
      .filter(turn => turn.features.turnType === 'answer')
      .slice(-5);
    
    if (recentQuestions.length > recentAnswers.length + 2) {
      recommendations.push({
        type: 'action',
        category: 'unanswered_questions',
        message: `${recentQuestions.length - recentAnswers.length} questions may be unanswered.`,
        questions: recentQuestions.slice(-(recentQuestions.length - recentAnswers.length)).map(q => q.text),
        priority: 'medium'
      });
    }
    
    // === ACTION ITEMS WITHOUT OWNERS ===
    const recentActions = Array.from(state.entityGraph.nodes.values())
      .filter(node => node.type === 'action');
    
    const peopleNodes = Array.from(state.entityGraph.nodes.values())
      .filter(node => node.type === 'person');
    
    if (recentActions.length > 0 && peopleNodes.length === 0) {
      recommendations.push({
        type: 'warning',
        category: 'unassigned_actions',
        message: 'Action items discussed but no owners identified.',
        actions: recentActions.map(a => a.id),
        priority: 'high'
      });
    }
    
    // === PREDICTED NEXT TYPE ===
    if (flowAnalysis.predictedNext) {
      recommendations.push({
        type: 'info',
        category: 'conversation_flow',
        message: `Based on patterns, expecting ${flowAnalysis.predictedNext} next.`,
        priority: 'low'
      });
    }
    
    // === DOMINANT ENTITIES RECOMMENDATION ===
    const topEntities = this._getTopEntities(state.entityGraph, 3);
    if (topEntities.length > 0) {
      recommendations.push({
        type: 'info',
        category: 'key_focus',
        message: `Main discussion focus: ${topEntities.map(e => e.id).join(', ')}`,
        entities: topEntities,
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  /**
   * Get conversation summary and visualization data
   * For React Flow graph visualization
   */
  getConversationGraph(roomId) {
    if (!this.conversationMemory.has(roomId)) {
      return null;
    }
    
    const state = this.conversationMemory.get(roomId);
    const graph = state.entityGraph;
    
    // === PREPARE NODES FOR REACT FLOW ===
    const nodes = Array.from(graph.nodes.entries()).map(([id, node]) => ({
      id,
      type: node.type,
      data: {
        label: id,
        mentions: node.mentions,
        contexts: node.contexts,
        // Attention-based sizing (more mentions = bigger node)
        size: Math.min(50 + node.mentions * 5, 100)
      },
      position: this._calculateNodePosition(node, graph), // Force-directed layout
      style: {
        background: this._getNodeColor(node.type),
        width: Math.min(50 + node.mentions * 5, 100),
        height: Math.min(50 + node.mentions * 5, 100)
      }
    }));
    
    // === PREPARE EDGES FOR REACT FLOW ===
    const edges = Array.from(graph.edges.entries())
      .filter(([_, edge]) => edge.strength > 0)
      .map(([key, edge]) => ({
        id: key,
        source: edge.from,
        target: edge.to,
        label: edge.relationship,
        data: {
          strength: edge.strength,
          coOccurrences: edge.coOccurrences
        },
        style: {
          strokeWidth: Math.min(1 + edge.strength * 0.5, 5),
          opacity: Math.min(0.3 + edge.strength * 0.1, 1)
        },
        animated: edge.strength > 3 // Animate strong connections
      }));
    
    // === CONVERSATION FLOW SEQUENCE ===
    const flowSequence = state.conversationFlow.map((unit, index) => ({
      step: index + 1,
      type: unit.type,
      timestamp: unit.timestamp,
      features: unit.features
    }));
    
    // === ATTENTION HEATMAP DATA ===
    const attentionHeatmap = Array.from(state.attentionMap.entries())
      .filter(([_, attention]) => attention.score >= this.config.attentionThreshold)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 20) // Top 20 important phrases
      .map(([phrase, attention]) => ({
        phrase,
        score: attention.score,
        frequency: attention.timestamps.length,
        recency: Date.now() - attention.timestamps[attention.timestamps.length - 1]
      }));
    
    return {
      // React Flow graph data
      nodes,
      edges,
      
      // Conversation metadata
      flowSequence,
      attentionHeatmap,
      
      // Statistics
      stats: {
        totalTurns: state.conversationHistory.length,
        totalEntities: graph.nodes.size,
        totalRelationships: graph.edges.size,
        averageCoherence: state.coherence.overall,
        dominantPattern: this._getDominantPattern(state.patterns),
        conversationMode: state.hiddenContext.conversationMode,
        duration: Date.now() - state.startTime
      },
      
      // Current context
      activeContext: {
        topics: Array.from(state.hiddenContext.activeTopics),
        speakers: Array.from(state.hiddenContext.activeSpeakers),
        mode: state.hiddenContext.conversationMode,
        tone: state.hiddenContext.emotionalTone
      }
    };
  }
  
  /**
   * Get conversation analytics and insights
   */
  getAnalytics(roomId) {
    if (!this.conversationMemory.has(roomId)) {
      return null;
    }
    
    const state = this.conversationMemory.get(roomId);
    
    return {
      // === TEMPORAL ANALYSIS ===
      temporal: {
        duration: Date.now() - state.startTime,
        turnsPerMinute: this._calculateTurnsPerMinute(state),
        focusShifts: state.focusShifts.length,
        focusShiftRate: state.focusShifts.length / (state.conversationHistory.length || 1)
      },
      
      // === ENTITY ANALYSIS ===
      entities: {
        totalUnique: state.entityGraph.nodes.size,
        byType: this._countEntitiesByType(state.entityGraph),
        mostMentioned: this._getTopEntities(state.entityGraph, 10),
        clusters: state.entityGraph.clusters.length
      },
      
      // === PATTERN ANALYSIS ===
      patterns: {
        detected: Array.from(state.patterns.entries()).map(([name, count]) => ({
          pattern: name,
          occurrences: count
        })),
        predicted: state.predictedNextType,
        flowHealth: this._assessFlowHealth(state.conversationFlow)
      },
      
      // === COHERENCE ANALYSIS ===
      coherence: {
        overall: state.coherence.overall,
        trend: this._calculateCoherenceTrend(state.coherence.turnCoherence),
        topicDrifts: state.coherence.topicDrift.length
      },
      
      // === PARTICIPANT ANALYSIS ===
      participants: {
        speakers: Array.from(state.hiddenContext.activeSpeakers),
        balance: this._calculateParticipationBalance(state),
        talkingTimeEstimate: this._estimateTalkingTime(state)
      },
      
      // === ACTIONABLE INSIGHTS ===
      actionable: {
        questionsAsked: state.conversationHistory.filter(t => t.features.hasQuestion).length,
        decisionsCount: Array.from(state.entityGraph.nodes.values()).filter(n => n.type === 'decision').length,
        actionsCount: Array.from(state.entityGraph.nodes.values()).filter(n => n.type === 'action').length
      }
    };
  }
  
  // ===== HELPER METHODS =====
  
  _extractPattern(text, pattern) {
    const matches = text.match(pattern) || [];
    return [...new Set(matches)]; // Unique matches
  }
  
  _extractAndClean(text, pattern) {
    const matches = text.match(pattern) || [];
    // Clean up matches - remove extra spaces, lowercase, trim
    return [...new Set(matches.map(m => m.trim().replace(/\s+/g, ' ')))];
  }
  
  _extractMeaningfulPhrases(sentences) {
    /**
     * Extract MEANINGFUL noun phrases and concepts from sentences
     * Focus on capturing the ACTUAL topics being discussed
     */
    const concepts = [];
    
    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      if (trimmed.length < 10) return; // Skip very short sentences
      
      // === METHOD 1: Extract noun phrases (subject + modifiers) ===
      // Pattern: adjective* + noun+ (e.g., "maximum square area", "good land")
      const nounPhrases = trimmed.match(/\b(?:(?:maximum|minimum|optimal|best|worst|good|bad|naive|brute force|dynamic)\s+)?(?:\w+\s+){0,2}(?:solution|algorithm|approach|problem|area|square|matrix|land|complexity|time|space|implementation|design|pattern|method|technique|strategy)\b/gi) || [];
      concepts.push(...nounPhrases);
      
      // === METHOD 2: Extract quoted content (usually key terms) ===
      const quoted = trimmed.match(/"([^"]+)"/g) || [];
      concepts.push(...quoted.map(q => q.replace(/"/g, '')));
      
      // === METHOD 3: Extract capitalized multi-word terms ===
      const capitalized = trimmed.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g) || [];
      concepts.push(...capitalized);
      
      // === METHOD 4: Extract technical numeric patterns ===
      // e.g., "n to the four", "O(n^2)", "99.9% uptime"
      const numericPhrases = trimmed.match(/\b(?:\w+\s+){0,2}(?:to the \w+|O\(\w+\)|percent|milliseconds?|seconds?|dimensions?)\b/gi) || [];
      concepts.push(...numericPhrases);
      
      // === METHOD 5: Extract key 2-4 word phrases (with stopword filtering) ===
      const words = trimmed.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'and', 'or', 'but', 'if', 'then', 'so', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'to', 'with']);
      
      for (let i = 0; i < words.length - 1; i++) {
        if (stopwords.has(words[i])) continue;
        
        // Extract meaningful 2-4 word sequences
        const phrase2 = words.slice(i, i + 2).join(' ');
        const phrase3 = words.slice(i, i + 3).join(' ');
        const phrase4 = words.slice(i, i + 4).join(' ');
        
        // Count non-stopwords in phrase
        const countMeaningful = (phrase) => {
          return phrase.split(' ').filter(w => !stopwords.has(w)).length;
        };
        
        // Keep phrases with at least 2 meaningful words
        if (countMeaningful(phrase2) >= 2 && phrase2.length >= 8) concepts.push(phrase2);
        if (countMeaningful(phrase3) >= 2 && phrase3.length >= 12) concepts.push(phrase3);
        if (countMeaningful(phrase4) >= 3 && phrase4.length >= 15) concepts.push(phrase4);
      }
    });
    
    // Deduplicate and filter
    const unique = [...new Set(concepts)]
      .map(c => c.trim().toLowerCase())
      .filter(c => {
        // Filter out pure action words
        if (['should', 'will', 'must', 'need to', 'have to', 'going to'].includes(c)) return false;
        // Keep meaningful phrases (5-60 chars)
        return c.length >= 5 && c.length <= 60;
      });
    
    // Remove overlapping phrases (keep longest)
    const deduplicated = this._removeOverlappingPhrases(unique);
    
    // Score concepts by relevance and return top ones
    const scored = deduplicated.map(concept => ({
      phrase: concept,
      score: this._scoreConceptRelevance(concept)
    }))
    .filter(s => s.score > 0.4) // Only keep relevant ones
    .sort((a, b) => b.score - a.score)
    .slice(0, 8); // Top 8 most relevant
    
    return scored.map(s => s.phrase);
  }
  
  _removeOverlappingPhrases(phrases) {
    /**
     * Remove overlapping/redundant phrases
     * Keep longer, more specific phrases
     */
    const sorted = phrases.sort((a, b) => b.length - a.length);
    const filtered = [];
    
    for (const phrase of sorted) {
      // Check if this phrase is already covered by a longer phrase
      const isCovered = filtered.some(existing => 
        existing.includes(phrase) || phrase.includes(existing)
      );
      
      if (!isCovered) {
        filtered.push(phrase);
      }
    }
    
    return filtered;
  }
  
  _scoreConceptRelevance(phrase) {
    // Score how relevant/important a concept is
    let score = 0.3; // Base score (lower to filter out noise)
    
    // HIGH VALUE: Domain-specific key terms
    if (/\b(?:maximum|minimum|optimal|naive|brute force|dynamic programming|greedy)\s+(?:solution|algorithm|approach|area|square)\b/i.test(phrase)) {
      score += 0.5; // Very important!
    }
    
    // HIGH VALUE: Technical terms
    if (/\b(?:time complexity|space complexity|algorithm|solution|optimization|matrix|dimensions?)\b/i.test(phrase)) {
      score += 0.4;
    }
    
    // MEDIUM VALUE: Problem-specific terms
    if (/\b(?:good land|bad land|square area|rectangle|diagonal values)\b/i.test(phrase)) {
      score += 0.3;
    }
    
    // MEDIUM VALUE: Technical numeric patterns
    if (/\b(?:n to the \w+|O\(\w+\)|percent|millisecond)\b/i.test(phrase)) {
      score += 0.3;
    }
    
    // BOOST for multi-word specificity
    const wordCount = phrase.split(' ').length;
    if (wordCount >= 3) score += 0.15;
    if (wordCount === 2) score += 0.05; // Prefer 3+ words
    
    // PENALIZE generic phrases
    if (/\b(?:just|really|very|actually|basically|think|know|like|want|need)\b/i.test(phrase)) {
      score -= 0.3;
    }
    
    // PENALIZE if starts/ends with common words
    if (/^(?:the|and|but|for|with|from)\s/i.test(phrase) || /\s(?:and|but|the|with)$/i.test(phrase)) {
      score -= 0.2;
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  _isMeaningfulPhrase(phrase) {
    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
      'it', 'that', 'this', 'these', 'those', 'i', 'you', 'we', 'they'
    ]);
    
    const words = phrase.toLowerCase().split(/\s+/);
    const meaningfulWords = words.filter(w => !stopwords.has(w));
    
    // Phrase is meaningful if at least 50% non-stopwords
    return meaningfulWords.length >= words.length * 0.5;
  }
  
  _extractNGrams(words, n) {
    const ngrams = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  }
  
  _extractKeywords(text) {
    // Simple keyword extraction (frequency-based)
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3); // Filter short words
    
    const stopwords = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should']);
    
    return words.filter(w => !stopwords.has(w));
  }
  
  _detectSentiment(text) {
    // Simple rule-based sentiment (can be enhanced with AI)
    const positive = /\b(good|great|excellent|awesome|happy|success|agree|yes)\b/gi;
    const negative = /\b(bad|poor|problem|issue|concern|disagree|no|unfortunately)\b/gi;
    
    const posCount = (text.match(positive) || []).length;
    const negCount = (text.match(negative) || []).length;
    
    let label = 'neutral';
    let score = 0.5;
    
    if (posCount > negCount) {
      label = 'positive';
      score = Math.min(0.5 + (posCount - negCount) * 0.1, 1.0);
    } else if (negCount > posCount) {
      label = 'negative';
      score = Math.max(0.5 - (negCount - posCount) * 0.1, 0.0);
    }
    
    return { label, score, posCount, negCount };
  }
  
  _classifyTurnType(text, entities) {
    // Classify conversation turn type
    if (entities.questions.length > 0) return 'question';
    if (entities.decisions.length > 0) return 'decision';
    if (entities.actions.length > 0) return 'action';
    if (/\b(because|since|therefore|thus|so)\b/i.test(text)) return 'explanation';
    if (/\b(I think|in my opinion|suggest|propose|recommend)\b/i.test(text)) return 'proposal';
    return 'statement';
  }
  
  _inferRelationship(entity1, entity2, features) {
    // Infer relationship type between entities based on semantic meaning
    const id1 = entity1.id.toLowerCase();
    const id2 = entity2.id.toLowerCase();
    
    // Person relationships
    if (entity1.type === 'person' && entity2.type === 'action') return 'will_do';
    if (entity1.type === 'person' && entity2.type === 'decision') return 'decided';
    if (entity1.type === 'person' && entity2.type === 'concept') return 'discussed';
    
    // Problem-Solution relationships
    if (entity1.type === 'problem' && entity2.type === 'solution') return 'solved_by';
    if (entity1.type === 'solution' && entity2.type === 'problem') return 'solves';
    
    // Technical-Action relationships
    if (entity1.type === 'technical' && entity2.type === 'action') return 'implements';
    if (entity1.type === 'technical' && entity2.type === 'decision') return 'affects';
    if (entity1.type === 'technical' && entity2.type === 'concept') return 'enables';
    
    // Concept relationships (semantic similarity)
    if (entity1.type === 'concept' && entity2.type === 'concept') {
      // Check if concepts are semantically related
      if (id1.includes('solution') && id2.includes('algorithm')) return 'implements';
      if (id1.includes('problem') && id2.includes('solution')) return 'requires';
      if (id1.includes('maximum') && id2.includes('area')) return 'optimizes';
      if (id1.includes('naive') && id2.includes('efficient')) return 'improved_by';
      return 'relates_to';
    }
    
    // Decision-Action chain
    if (entity1.type === 'decision' && entity2.type === 'action') return 'leads_to';
    
    return 'discussed_with';
  }
  
  _detectEntityClusters(graph) {
    // Simple clustering: group highly connected entities
    const visited = new Set();
    const clusters = [];
    
    graph.nodes.forEach((node, nodeId) => {
      if (visited.has(nodeId)) return;
      
      const cluster = new Set([nodeId]);
      const queue = [nodeId];
      visited.add(nodeId);
      
      while (queue.length > 0) {
        const current = queue.shift();
        const currentNode = graph.nodes.get(current);
        
        if (currentNode && currentNode.connectedTo) {
          currentNode.connectedTo.forEach(connectedId => {
            if (!visited.has(connectedId) && cluster.size < 5) { // Max cluster size
              visited.add(connectedId);
              cluster.add(connectedId);
              queue.push(connectedId);
            }
          });
        }
      }
      
      if (cluster.size > 1) {
        clusters.push({
          entities: Array.from(cluster),
          size: cluster.size,
          coherence: this._calculateClusterCoherence(cluster, graph)
        });
      }
    });
    
    graph.clusters = clusters;
  }
  
  _detectFlowPatterns(flow) {
    const detected = [];
    
    // Look for known patterns in recent flow
    this.config.flowPatterns.forEach(pattern => {
      const seqLength = pattern.sequence.length;
      
      for (let i = 0; i <= flow.length - seqLength; i++) {
        const segment = flow.slice(i, i + seqLength);
        const types = segment.map(s => s.type);
        
        if (JSON.stringify(types) === JSON.stringify(pattern.sequence)) {
          detected.push({
            name: pattern.name,
            position: i,
            timestamp: segment[0].timestamp
          });
        }
      }
    });
    
    return detected;
  }
  
  _predictNextTurnType(flow) {
    if (flow.length === 0) return null;
    
    const lastType = flow[flow.length - 1].type;
    
    // Simple state machine prediction
    const transitions = {
      'question': 'answer',
      'answer': 'question',
      'proposal': 'decision',
      'decision': 'action',
      'problem': 'solution',
      'action': 'commitment'
    };
    
    return transitions[lastType] || 'statement';
  }
  
  _isSignificantShift(fromType, toType) {
    // Detect if conversation shifted significantly
    const majorShifts = [
      ['question', 'decision'],
      ['exploration', 'action'],
      ['problem', 'decision']
    ];
    
    return majorShifts.some(([from, to]) => 
      fromType === from && toType === to
    );
  }
  
  _assessFlowHealth(flow) {
    if (flow.length < 3) return { score: 1.0, status: 'healthy' };
    
    // Healthy flow has variety and follows patterns
    const typeSet = new Set(flow.map(f => f.type));
    const variety = typeSet.size / Math.min(flow.length, 6);
    
    // Check if flow follows logical patterns
    const patternMatches = this._detectFlowPatterns(flow);
    const patternScore = Math.min(patternMatches.length / (flow.length / 2), 1.0);
    
    const healthScore = (variety * 0.4) + (patternScore * 0.6);
    
    let status = 'healthy';
    if (healthScore < 0.4) status = 'poor';
    else if (healthScore < 0.6) status = 'fair';
    else if (healthScore < 0.8) status = 'good';
    else status = 'excellent';
    
    return { score: healthScore, status, variety, patternMatches: patternMatches.length };
  }
  
  _setIntersection(setA, setB) {
    return new Set([...setA].filter(x => setB.has(x)));
  }
  
  _calculateKeywordSimilarity(keywords1, keywords2) {
    if (keywords1.length === 0 || keywords2.length === 0) return 0;
    
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    const intersection = this._setIntersection(set1, set2);
    
    // Jaccard similarity
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }
  
  _matchesExpectedPattern(prevType, currType) {
    const expectedTransitions = {
      'question': ['answer', 'explanation'],
      'proposal': ['decision', 'question'],
      'problem': ['solution', 'discussion'],
      'decision': ['action', 'confirmation']
    };
    
    if (expectedTransitions[prevType]) {
      return expectedTransitions[prevType].includes(currType);
    }
    
    return false;
  }
  
  _inferConversationMode(features, flowAnalysis, history) {
    // Infer what phase the conversation is in
    if (features.entities.questions.length > 2) return 'exploration';
    if (features.entities.decisions.length > 0) return 'decision';
    if (features.entities.actions.length > 1) return 'action';
    if (history.length > 8 && flowAnalysis.flowHealth.score < 0.5) return 'wrap-up';
    return 'discussion';
  }
  
  _calculateParticipationBalance(state) {
    const speakerCounts = new Map();
    
    state.conversationHistory.forEach(turn => {
      const count = speakerCounts.get(turn.speaker) || 0;
      speakerCounts.set(turn.speaker, count + 1);
    });
    
    if (speakerCounts.size <= 1) return 1.0;
    
    const counts = Array.from(speakerCounts.values());
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / counts.length;
    
    // Lower variance = better balance
    const balance = Math.max(0, 1 - (variance / (mean * mean)));
    
    return balance;
  }
  
  _calculateTopicFocus(state) {
    // How focused is the conversation on specific topics?
    const topicCounts = new Map();
    
    state.conversationHistory.forEach(turn => {
      turn.features.keywords.forEach(keyword => {
        topicCounts.set(keyword, (topicCounts.get(keyword) || 0) + 1);
      });
    });
    
    if (topicCounts.size === 0) return 0;
    
    // Entropy-based focus measure
    const total = Array.from(topicCounts.values()).reduce((a, b) => a + b, 0);
    const probs = Array.from(topicCounts.values()).map(count => count / total);
    const entropy = -probs.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
    const maxEntropy = Math.log2(topicCounts.size);
    
    // Normalized entropy: 0 = very focused, 1 = very scattered
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
    
    // Return focus score (inverse of entropy)
    return Math.max(0, 1 - normalizedEntropy);
  }
  
  _calculateActionableRatio(state) {
    const actionableTurns = state.conversationHistory.filter(turn =>
      turn.features.turnType === 'action' ||
      turn.features.turnType === 'decision' ||
      turn.features.turnType === 'question'
    ).length;
    
    return state.conversationHistory.length > 0
      ? actionableTurns / state.conversationHistory.length
      : 0;
  }
  
  _identifyKeyMoments(state) {
    // Find moments with high attention scores or significant events
    return state.conversationHistory
      .filter(turn => 
        turn.attentionScore >= this.config.attentionThreshold ||
        turn.features.turnType === 'decision' ||
        turn.importantPhrases.length > 3
      )
      .map(turn => ({
        timestamp: turn.timestamp,
        speaker: turn.speaker,
        type: turn.features.turnType,
        summary: turn.text.substring(0, 100) + '...',
        importance: turn.attentionScore,
        entities: Object.values(turn.features.entities).flat().slice(0, 5)
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10); // Top 10 moments
  }
  
  _getTopEntities(graph, limit = 5) {
    return Array.from(graph.nodes.values())
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, limit)
      .map(node => ({
        id: node.id,
        type: node.type,
        mentions: node.mentions,
        connections: node.connectedTo.size
      }));
  }
  
  _getDominantPatterns(patterns) {
    return Array.from(patterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ pattern: name, count }));
  }
  
  _getDominantPattern(patterns) {
    const sorted = this._getDominantPatterns(patterns);
    return sorted.length > 0 ? sorted[0].pattern : 'none';
  }
  
  _describeConversationArc(state) {
    // Describe the overall narrative arc of conversation
    const modes = state.conversationHistory.map((_, i) => {
      const segment = state.conversationHistory.slice(Math.max(0, i - 2), i + 1);
      const types = segment.map(t => t.features.turnType);
      
      if (types.includes('question')) return 'exploration';
      if (types.includes('decision')) return 'decision';
      if (types.includes('action')) return 'execution';
      return 'discussion';
    });
    
    // Find mode transitions
    const transitions = [];
    for (let i = 1; i < modes.length; i++) {
      if (modes[i] !== modes[i - 1]) {
        transitions.push({
          from: modes[i - 1],
          to: modes[i],
          at: state.conversationHistory[i].timestamp
        });
      }
    }
    
    return {
      currentMode: modes[modes.length - 1] || 'starting',
      transitions,
      arc: modes.slice(-5) // Last 5 modes
    };
  }
  
  _suggestConversationFocus(state, currentTurn) {
    const suggestions = [];
    
    // === UNRESOLVED THREADS ===
    const questionTurns = state.conversationHistory.filter(t => t.features.hasQuestion);
    const answerTurns = state.conversationHistory.filter(t => t.features.turnType === 'answer');
    
    if (questionTurns.length > answerTurns.length) {
      suggestions.push({
        type: 'resolve_questions',
        priority: 'high',
        detail: `${questionTurns.length - answerTurns.length} questions pending answers`
      });
    }
    
    // === TOPIC DRIFT ===
    if (state.coherence.overall < 0.6) {
      suggestions.push({
        type: 'refocus',
        priority: 'medium',
        detail: 'Conversation coherence is low, consider summarizing'
      });
    }
    
    // === ACTIONABLE NEXT STEPS ===
    if (state.conversationFlow.length > 5) {
      const recentTypes = state.conversationFlow.slice(-5).map(f => f.type);
      if (!recentTypes.includes('action') && !recentTypes.includes('decision')) {
        suggestions.push({
          type: 'drive_action',
          priority: 'medium',
          detail: 'Consider moving towards decisions or action items'
        });
      }
    }
    
    return suggestions;
  }
  
  _calculateNodePosition(node, graph) {
    // Simple force-directed layout (can be enhanced)
    const hash = this._hashCode(node.id);
    const angle = (hash % 360) * (Math.PI / 180);
    const radius = 100 + (node.mentions * 20);
    
    return {
      x: 400 + radius * Math.cos(angle),
      y: 300 + radius * Math.sin(angle)
    };
  }
  
  _getNodeColor(type) {
    const colors = {
      person: '#4A90E2',      // Blue
      technical: '#50C878',   // Green
      concept: '#17A2B8',     // Cyan
      action: '#F5A623',      // Orange
      decision: '#BD10E0',    // Purple
      problem: '#E74C3C',     // Red
      solution: '#28A745',    // Bright Green
      default: '#9B9B9B'      // Gray
    };
    
    return colors[type] || colors.default;
  }
  
  _countEntitiesByType(graph) {
    const counts = {};
    
    graph.nodes.forEach(node => {
      counts[node.type] = (counts[node.type] || 0) + 1;
    });
    
    return counts;
  }
  
  _calculateCoherenceTrend(coherenceHistory) {
    if (coherenceHistory.length < 2) return 'stable';
    
    const recent = coherenceHistory.slice(-5).map(c => c.score);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const first = recent[0];
    const last = recent[recent.length - 1];
    
    if (last > first + 0.1) return 'improving';
    if (last < first - 0.1) return 'declining';
    return 'stable';
  }
  
  _calculateTurnsPerMinute(state) {
    const duration = (Date.now() - state.startTime) / 60000; // Minutes
    return duration > 0 ? state.conversationHistory.length / duration : 0;
  }
  
  _estimateTalkingTime(state) {
    const estimates = new Map();
    
    state.conversationHistory.forEach(turn => {
      // Rough estimate: 150 words per minute speaking rate
      const minutes = turn.features.wordCount / 150;
      const current = estimates.get(turn.speaker) || 0;
      estimates.set(turn.speaker, current + minutes);
    });
    
    return Array.from(estimates.entries()).map(([speaker, minutes]) => ({
      speaker,
      estimatedMinutes: minutes.toFixed(1),
      percentage: ((minutes / Array.from(estimates.values()).reduce((a, b) => a + b, 0)) * 100).toFixed(1)
    }));
  }
  
  _calculateClusterCoherence(cluster, graph) {
    // Calculate how tightly connected a cluster is
    let totalConnections = 0;
    let possibleConnections = cluster.size * (cluster.size - 1);
    
    cluster.forEach(entityId => {
      const node = graph.nodes.get(entityId);
      if (node) {
        const connectionsInCluster = Array.from(node.connectedTo)
          .filter(id => cluster.has(id)).length;
        totalConnections += connectionsInCluster;
      }
    });
    
    return possibleConnections > 0 ? totalConnections / possibleConnections : 0;
  }
  
  _getPublicState(state) {
    // Return sanitized state for client consumption
    return {
      activeTopics: Array.from(state.hiddenContext.activeTopics),
      activeSpeakers: Array.from(state.hiddenContext.activeSpeakers),
      conversationMode: state.hiddenContext.conversationMode,
      emotionalTone: state.hiddenContext.emotionalTone,
      coherence: state.coherence.overall,
      turnCount: state.conversationHistory.length,
      entityCount: state.entityGraph.nodes.size,
      relationshipCount: state.entityGraph.edges.size
    };
  }
  
  _archiveTurn(roomId, turn) {
    // Archive old turns for potential long-term memory
    // Can be stored in database for historical analysis
    console.log(`[Archive] Room ${roomId}: Archiving turn from ${new Date(turn.timestamp).toISOString()}`);
  }
  
  _hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
  
  /**
   * Reset conversation tracking for a room
   */
  resetConversation(roomId) {
    this.conversationMemory.delete(roomId);
    this.attentionScores.delete(roomId);
    this.entityGraph.delete(roomId);
    this.conversationFlow.delete(roomId);
    this.topicCoherence.delete(roomId);
    
    console.log(`[Conversation Tracker] Reset for room: ${roomId}`);
  }
  
  /**
   * Get real-time conversation metrics
   * For dashboard/monitoring
   */
  getRealtimeMetrics(roomId) {
    if (!this.conversationMemory.has(roomId)) {
      return null;
    }
    
    const state = this.conversationMemory.get(roomId);
    const analytics = this.getAnalytics(roomId);
    
    return {
      // Live metrics
      live: {
        coherence: state.coherence.overall.toFixed(2),
        mode: state.hiddenContext.conversationMode,
        tone: state.hiddenContext.emotionalTone,
        focus: this._calculateTopicFocus(state).toFixed(2)
      },
      
      // Counts
      counts: {
        turns: state.conversationHistory.length,
        entities: state.entityGraph.nodes.size,
        topics: state.hiddenContext.activeTopics.size,
        speakers: state.hiddenContext.activeSpeakers.size
      },
      
      // Health indicators
      health: {
        flowScore: this._assessFlowHealth(state.conversationFlow).score.toFixed(2),
        participationBalance: this._calculateParticipationBalance(state).toFixed(2),
        actionableRatio: this._calculateActionableRatio(state).toFixed(2)
      },
      
      // Timeline
      duration: analytics.temporal.duration,
      turnsPerMinute: analytics.temporal.turnsPerMinute.toFixed(1)
    };
  }
}

// Create singleton instance
const conversationTracker = new ConversationTracker();

module.exports = {
  ConversationTracker,
  conversationTracker
};

