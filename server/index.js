require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const OpenAI = require('openai');
const { 
  createGoogleStream, 
  processWithOpenAI,
  processWithHybrid,
  openai 
} = require('./services/speechServices');
const { createDeepgramStream, processAudioData } = require('./services/deepgramService');
const { teamKnowledge } = require('./services/teamKnowledge');
const { tagService } = require('./services/tagService');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store active sessions
const activeSessions = new Map();
const aiProcessingSessions = new Map();

// Constants
const ANALYSIS_INTERVAL = 20000; // 20 seconds

// AI analysis context per room
const roomContexts = new Map();

// Specialized AI Agents
const AI_AGENTS = {
  MEETING_ANALYST: {
    name: 'Meeting Analyst',
    systemPrompt: `You are an expert meeting analyst for a technical team. 
    Your role is to analyze conversations and provide actionable insights.
    
    You have access to team knowledge including:
    - Team member profiles and expertise
    - Current projects and their objectives
    - Technical stack and architecture decisions
    - Company glossary and terminology
    
    For each conversation segment, provide:
    1. **Meeting Type & Context**: Identify the type of meeting and its purpose
    2. **Key Discussion Points**: Summarize main topics with relevant team context
    3. **Decisions Made**: Clear decisions with decision makers identified
    4. **Action Items**: Specific tasks with suggested assignees based on expertise
    5. **Technical Insights**: Architecture decisions, technical challenges, solutions proposed
    6. **Follow-up Questions**: Questions that need clarification
    7. **Team Dynamics**: Note any collaboration patterns or concerns
    
    Format your response with clear headers and bullet points.
    Reference specific team members by name when relevant.
    Connect discussions to existing projects and initiatives.`,
    settings: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.3,
      max_tokens: 800,
      frequency_penalty: 0.3,
      presence_penalty: 0.2
    }
  },
  
  ONBOARDING_ASSISTANT: {
    name: 'Onboarding Assistant',
    systemPrompt: `You are an onboarding assistant helping new team members understand:
    - Team structure and member roles
    - Technical architecture and decisions
    - Current projects and priorities
    - Development processes and best practices
    - Company terminology and culture
    
    When analyzing conversations involving new team members:
    1. **Context Explanation**: Explain technical terms and company-specific concepts
    2. **Team Introductions**: Identify who's speaking and their roles
    3. **Learning Opportunities**: Highlight important information for newcomers
    4. **Resources**: Suggest relevant documentation or people to connect with
    5. **Next Steps**: Recommend specific onboarding tasks or areas to explore
    
    Be encouraging and supportive. Make complex topics accessible.`,
    settings: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.5,
      max_tokens: 600,
      frequency_penalty: 0.2,
      presence_penalty: 0.3
    }
  },
  
  TECHNICAL_ARCHITECT: {
    name: 'Technical Architect',
    systemPrompt: `You are a senior technical architect analyzing technical discussions.
    Focus on:
    - Architecture decisions and their implications
    - Technical debt and optimization opportunities
    - Best practices and design patterns
    - Performance and scalability considerations
    - Security implications
    - Integration challenges
    
    Provide analysis that includes:
    1. **Architecture Review**: Current design decisions and alternatives
    2. **Technical Recommendations**: Specific improvements with rationale
    3. **Risk Assessment**: Potential issues and mitigation strategies
    4. **Best Practices**: Relevant patterns and industry standards
    5. **Performance Insights**: Optimization opportunities
    6. **Security Considerations**: Potential vulnerabilities and fixes
    
    Be specific and reference actual technologies being discussed.`,
    settings: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.2,
      max_tokens: 700,
      frequency_penalty: 0.3,
      presence_penalty: 0.2
    }
  },
  
  ACTION_TRACKER: {
    name: 'Action Item Tracker',
    systemPrompt: `You are an action item and decision tracker. Your job is to:
    - Extract clear action items with owners and deadlines
    - Track decisions made and their rationale
    - Identify blockers and dependencies
    - Note commitments and promises made
    
    Format output as:
    1. **Action Items**: 
       - Task | Owner | Deadline | Priority
    2. **Decisions**:
       - Decision | Rationale | Impact | Decision Maker
    3. **Blockers**:
       - Issue | Impact | Owner | Required Action
    4. **Commitments**:
       - Who | What | When | To Whom
    
    Be very specific and avoid ambiguity.`,
    settings: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.1,
      max_tokens: 500,
        frequency_penalty: 0.2,
      presence_penalty: 0.1
    }
  }
};

// Fallback configuration for rate limits
const FALLBACK_CONFIG = {
  model: 'gpt-3.5-turbo-1106',
  temperature: 0.3,
  max_tokens: 400,
  frequency_penalty: 0.2,
  presence_penalty: 0.1
};

// Initialize team knowledge base
const initializeKnowledgeBase = async () => {
  try {
    // Try to load custom team data if available
    await teamKnowledge.loadTeamData('./team-data.json');
    console.log('Team knowledge base initialized');
  } catch (error) {
    console.log('Using default team knowledge base');
  }
};

initializeKnowledgeBase();

// Function to format AI response with rich HTML
const formatAIResponse = (analysis, agentName) => {
    let html = `<div class="ai-analysis">`;
    html += `<div class="agent-header">${agentName}</div>`;
    
    // Split by numbered or bulleted sections
    const sections = analysis.split(/\n(?=\d+\.\s+\*\*|#{1,3}\s+|\*\*)/);
    
    sections.forEach(section => {
        if (!section.trim()) return;
        
        // Handle main headers (## Header or **Header**)
        if (section.match(/^#{1,3}\s+(.+)|^\*\*(.+)\*\*:/)) {
            const headerMatch = section.match(/^#{1,3}\s+(.+)|^\*\*(.+)\*\*:/);
            const headerText = headerMatch[1] || headerMatch[2];
            
            html += `<div class="analysis-section">`;
            html += `<div class="section-header">${headerText.replace(/\*\*/g, '')}</div>`;
            
            // Process the content after the header
            const content = section.substring(headerMatch[0].length).trim();
            html += formatContent(content);
            html += `</div>`;
        }
        // Handle numbered sections (1. **Header**)
        else if (section.match(/^\d+\.\s+\*\*(.+)\*\*/)) {
            const match = section.match(/^(\d+)\.\s+\*\*(.+)\*\*:?\s*([\s\S]*)/);
            if (match) {
                html += `<div class="analysis-section">`;
                html += `<div class="section-header">${match[1]}. ${match[2]}</div>`;
                html += formatContent(match[3]);
                html += `</div>`;
            }
        } else {
            html += formatContent(section);
        }
    });
    
    html += `</div>`;
    return html;
};

// Helper function to format content
const formatContent = (content) => {
    if (!content) return '';
    
    let formatted = content;
    
    // Format bullet points with better structure
    formatted = formatted.replace(/^\s*[-•]\s+(.+)$/gm, (match, text) => {
        // Check if it's a key-value format
        if (text.includes(':') || text.includes('|')) {
            const separator = text.includes('|') ? '|' : ':';
            const parts = text.split(separator).map(p => p.trim());
            
            if (parts.length >= 2) {
                const label = parts[0];
                const value = parts.slice(1).join(separator);
                
                return `<div class="bullet-item">
<span class="bullet">•</span>
<span class="bullet-label">${label}:</span>
    <span class="bullet-value">${value}</span>
</div>`;
            }
        }
        
        return `<div class="bullet-item">
<span class="bullet">•</span>
    <span class="bullet-text">${text}</span>
</div>`;
    });

    // Format inline bold text
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Format inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Format line breaks
    formatted = formatted.replace(/\n\n/g, '</p><p>');
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Wrap in paragraph if not already wrapped
    if (!formatted.includes('<div') && !formatted.includes('<p>')) {
        formatted = `<p>${formatted}</p>`;
    }
    
    return formatted;
};

// Enhanced AI analysis with team context
const analyzeWithAgent = async (text, roomId, agent = AI_AGENTS.MEETING_ANALYST) => {
    try {
        // Get or create room context
        if (!roomContexts.has(roomId)) {
            roomContexts.set(roomId, {
                meetingType: null,
                participants: new Set(),
                topics: new Set(),
                projectsMentioned: new Set(),
                decisions: [],
                actionItems: [],
                tags: new Set()
            });
        }
        
        const roomContext = roomContexts.get(roomId);
        
        // Extract tags from transcript
        const detectedTags = tagService.getAllTags(text);
        detectedTags.forEach(tag => roomContext.tags.add(tag));
        
        // Build tag context for AI
        const tagContext = tagService.buildTagContext(detectedTags);
        
        // Build context from team knowledge
        const contextAnalysis = teamKnowledge.buildContextPrompt(text);
        roomContext.meetingType = contextAnalysis.meetingType;
        
        // Update room context with entities
        contextAnalysis.entities.people.forEach(p => roomContext.participants.add(p));
        contextAnalysis.entities.projects.forEach(p => roomContext.projectsMentioned.add(p));
        contextAnalysis.entities.technologies.forEach(t => roomContext.topics.add(t));
        
        // Build enhanced prompt with team context and tags
        let enhancedPrompt = agent.systemPrompt + '\n\n';
        enhancedPrompt += 'Team Context:\n' + contextAnalysis.context + '\n\n';
        
        // Add tag context if present
        if (tagContext) {
            enhancedPrompt += 'Tag Context:\n' + tagContext + '\n\n';
            enhancedPrompt += 'Detected Tags: ' + detectedTags.join(', ') + '\n\n';
        }
        
        enhancedPrompt += 'Meeting Context:\n';
        enhancedPrompt += `- Meeting Type: ${roomContext.meetingType}\n`;
        enhancedPrompt += `- Participants: ${Array.from(roomContext.participants).join(', ')}\n`;
        enhancedPrompt += `- Projects Mentioned: ${Array.from(roomContext.projectsMentioned).join(', ')}\n`;
        enhancedPrompt += `- Technologies Discussed: ${Array.from(roomContext.topics).join(', ')}\n`;
        enhancedPrompt += `- Active Tags: ${Array.from(roomContext.tags).join(', ')}\n\n`;
        
        // For onboarding meetings, add specific context
        if (contextAnalysis.isOnboarding) {
            const onboardingContext = teamKnowledge.getOnboardingContext();
            enhancedPrompt += `\nOnboarding Context:\n`;
            enhancedPrompt += `- Current Week Tasks: ${onboardingContext.tasks.join(', ')}\n`;
            enhancedPrompt += `- Available Buddies: ${onboardingContext.buddies.join(', ')}\n`;
            enhancedPrompt += `- Key Resources: ${onboardingContext.resources.join(', ')}\n\n`;
        }
        
        // Call OpenAI with enhanced context
        const completion = await openai.chat.completions.create({
            ...agent.settings,
            messages: [
                {
                    role: "system",
                    content: enhancedPrompt
                },
                {
                    role: "user",
                    content: `Analyze this conversation segment:\n\n${text}`
                }
            ]
        });
        
        const analysis = completion.choices[0].message.content;
        
        // Extract and store action items and decisions
        const actionItemMatches = analysis.matchAll(/(?:action item|todo|task):\s*([^.]+)/gi);
        for (const match of actionItemMatches) {
            roomContext.actionItems.push({
                text: match[1].trim(),
                timestamp: new Date().toISOString(),
                segment: text.substring(0, 50) + '...',
                tags: detectedTags
            });
        }
        
        return {
            analysis: formatAIResponse(analysis, agent.name),
            agent: agent.name,
            context: contextAnalysis,
            tags: detectedTags,
            tagMetadata: detectedTags.map(tag => tagService.getTagMetadata(tag)),
            roomContext: {
                meetingType: roomContext.meetingType,
                participants: Array.from(roomContext.participants),
                topics: Array.from(roomContext.topics),
                actionItems: roomContext.actionItems.slice(-5), // Last 5 action items
                tags: Array.from(roomContext.tags)
            }
        };
        
    } catch (error) {
        console.error('Error with AI agent:', error);
        
        // Try fallback model
        try {
            const fallbackCompletion = await openai.chat.completions.create({
                ...FALLBACK_CONFIG,
                messages: [
                    {
                        role: "system",
                        content: agent.systemPrompt
                    },
                    {
                        role: "user",
                        content: text
                    }
                ]
            });
            
            return {
                analysis: formatAIResponse(fallbackCompletion.choices[0].message.content, agent.name),
                agent: agent.name,
                isFallback: true
            };
        } catch (fallbackError) {
            throw fallbackError;
        }
    }
};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let recognizeStream = null;
  let currentService = null;
  let audioBuffer = Buffer.alloc(0);
  let lastProcessTime = Date.now();
  const minProcessInterval = 2000; // Minimum 2 seconds between processing

  socket.on('start_transcription', async ({ roomId, service }) => {
    try {
      // Clean up existing stream if any
      if (recognizeStream) {
        recognizeStream.destroy();
        activeSessions.delete(roomId);
      }

      currentService = service;
      console.log(`Starting transcription with service: ${service}`);

      if (service === 'google') {
        recognizeStream = createGoogleStream(socket, roomId);
        activeSessions.set(roomId, recognizeStream);
      } else if (service === 'deepgram') {
        recognizeStream = createDeepgramStream(socket, roomId);
        activeSessions.set(roomId, recognizeStream);
      }

      socket.join(roomId);
      socket.emit('transcription_started');
      
      // Initialize room context
      if (!roomContexts.has(roomId)) {
        roomContexts.set(roomId, {
          meetingType: null,
          participants: new Set(),
          topics: new Set(),
          projectsMentioned: new Set(),
          decisions: [],
          actionItems: [],
          tags: new Set()
        });
      }
    } catch (error) {
      console.error('Error starting transcription:', error);
      socket.emit('transcription_error', { 
        message: 'Failed to start transcription',
        details: error.message 
      });
    }
  });

  socket.on('audio_data', async (data) => {
    try {
      const { roomId, audio, service } = data;
      const now = Date.now();
      
      if (service === 'google') {
        const stream = activeSessions.get(roomId);
        if (stream && !stream.destroyed) {
          const audioBuffer = Buffer.from(audio);
          stream.write(audioBuffer);
        }
      } else if (service === 'deepgram') {
        const stream = activeSessions.get(roomId);
        if (stream) {
          // Send raw 16-bit PCM bytes directly to Deepgram in reasonable chunks
          try {
            const buf = Buffer.from(audio);
            const MAX_CHUNK = 3200; // 100ms at 16kHz, 16-bit mono (2 bytes/sample)
            if (buf.length <= MAX_CHUNK) {
              stream.send(buf);
            } else {
              for (let offset = 0; offset < buf.length; offset += MAX_CHUNK) {
                const chunk = buf.subarray(offset, Math.min(offset + MAX_CHUNK, buf.length));
                stream.send(chunk);
              }
            }
          } catch (err) {
            console.error('Error forwarding audio to Deepgram:', err);
          }
        }
      } else if (service === 'openai') {
        try {
          // Accumulate audio data
          audioBuffer = Buffer.concat([audioBuffer, Buffer.from(audio)]);
          
          // Process when we have enough data and enough time has passed
          if (audioBuffer.length >= 32000 && (now - lastProcessTime) >= minProcessInterval) {
            // Get current room context for better transcription
            const roomContext = roomContexts.get(roomId) || {};
            const contextHint = Array.from(roomContext.topics || []).join(' ');
            
            // Process with enhanced Whisper
            const result = await processWithHybrid(audioBuffer, 'openai');
            if (result && result.text) {
              socket.emit('transcription', {
                text: result.text,
                isFinal: true,
                timestamp: new Date().toISOString(),
                service: 'openai',
                confidence: result.confidence || 0.9,
                speakerTag: 0
              });
            }
            
            // Reset buffer and update time
            audioBuffer = Buffer.alloc(0);
            lastProcessTime = now;
          }
        } catch (error) {
          console.error('OpenAI processing error:', error);
          socket.emit('transcription_error', {
            message: 'OpenAI processing error',
            details: error.message,
            service: 'openai'
          });
        }
      }
    } catch (error) {
      console.error('Error processing audio data:', error);
      socket.emit('transcription_error', { 
        message: 'Error processing audio',
        details: error.message 
      });
    }
  });

  socket.on('stop_transcription', (roomId) => {
    try {
      const stream = activeSessions.get(roomId);
      if (stream) {
        try {
          if (typeof stream.finish === 'function') {
            stream.finish();
          } else if (typeof stream.destroy === 'function') {
            stream.destroy();
          }
        } catch (_) {}
        activeSessions.delete(roomId);
      }
      socket.leave(roomId);
      socket.emit('transcription_stopped');
    } catch (error) {
      console.error('Error stopping transcription:', error);
    }
  });

  socket.on('stop_ai_processing', (roomId) => {
    try {
      // Clear any pending AI analysis timers
      const processingSession = aiProcessingSessions.get(roomId);
      if (processingSession) {
        if (processingSession.timer) {
          clearTimeout(processingSession.timer);
        }
        aiProcessingSessions.delete(roomId);
      }

      // Clear room context
      roomContexts.delete(roomId);

      console.log(`Stopped AI processing for room: ${roomId}`);
    } catch (error) {
      console.error('Error stopping AI processing:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (recognizeStream) {
      try {
        if (typeof recognizeStream.finish === 'function') {
          recognizeStream.finish();
        } else if (typeof recognizeStream.destroy === 'function') {
          recognizeStream.destroy();
        }
      } catch (_) {}
    }
    
    // Clean up AI processing on disconnect
    for (const [roomId, session] of aiProcessingSessions.entries()) {
      if (session.socketId === socket.id) {
        if (session.timer) {
          clearTimeout(session.timer);
        }
        aiProcessingSessions.delete(roomId);
        roomContexts.delete(roomId);
      }
    }
  });

  socket.on('process_with_ai', async (data) => {
    const { text, roomId, agentType = 'MEETING_ANALYST' } = data;
    
    try {
        const agent = AI_AGENTS[agentType] || AI_AGENTS.MEETING_ANALYST;
        const result = await analyzeWithAgent(text, roomId, agent);
        
            socket.emit('ai_response', { 
            text: result.analysis,
            context: text,
                timestamp: new Date().toISOString(),
            analysisType: 'enhanced',
            agent: result.agent,
            roomContext: result.roomContext,
            tags: result.tags,
            tagMetadata: result.tagMetadata,
            isFormatted: true,
            isFallback: result.isFallback
        });
        } catch (error) {
        console.error('Error with AI processing:', error);
        
        // Send error response
        socket.emit('ai_response', { 
            text: formatAIResponse(
                `Analysis temporarily unavailable. Key points from conversation:
                • ${text.split('.').slice(0, 2).join('.')}
                • Processing will resume shortly.`,
                'System'
            ),
            isError: true,
            isFormatted: true
        });
    }
  });

  // Add endpoint to get current room context
  socket.on('get_room_context', (roomId) => {
    const context = roomContexts.get(roomId);
    if (context) {
      socket.emit('room_context', {
        roomId,
        meetingType: context.meetingType,
        participants: Array.from(context.participants),
        topics: Array.from(context.topics),
        projectsMentioned: Array.from(context.projectsMentioned),
        actionItems: context.actionItems,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Add endpoint to switch AI agents
  socket.on('switch_agent', (data) => {
    const { roomId, agentType } = data;
    console.log(`Switching to ${agentType} agent for room ${roomId}`);
    socket.emit('agent_switched', { agentType });
  });

  // Add endpoint to manage tags
  socket.on('add_custom_tag', async (data) => {
    const { category, name, metadata } = data;
    try {
      await tagService.addCustomTag(category, name, metadata);
      socket.emit('tag_added', { success: true, tag: `${category}:${name}` });
    } catch (error) {
      socket.emit('tag_error', { error: error.message });
    }
  });

  socket.on('get_tag_analytics', async (roomId) => {
    const context = roomContexts.get(roomId);
    if (context && context.tags) {
      const analytics = {
        currentTags: Array.from(context.tags),
        tagMetadata: Array.from(context.tags).map(tag => tagService.getTagMetadata(tag)),
        frequency: {}
      };
      
      // Count tag frequency in current session
      context.tags.forEach(tag => {
        analytics.frequency[tag] = (analytics.frequency[tag] || 0) + 1;
      });
      
      socket.emit('tag_analytics', analytics);
    }
  });
});

const startServer = (port) => {
  server.listen(port)
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is busy, trying ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error('Server error:', err);
      }
    })
    .on('listening', () => {
      console.log(`Server running on port ${port}`);
      console.log('Available AI Agents:', Object.keys(AI_AGENTS).join(', '));
    });
};

// Start the server
const PORT = process.env.PORT || 5002;
startServer(PORT);

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Cleaning up...');
  for (const [_, stream] of activeSessions.entries()) {
    if (stream) {
      try {
        if (typeof stream.finish === 'function') {
          stream.finish();
        } else if (typeof stream.destroy === 'function') {
          stream.destroy();
        }
      } catch (_) {}
    }
  }
  server.close(() => {
    process.exit(0);
  });
});