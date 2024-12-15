require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const speech = require('@google-cloud/speech');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

<<<<<<< HEAD

const speechClient = new speech.SpeechClient(credentialService.getGoogleConfig());
=======
// Initialize the Speech-to-Text client
const speechClient = new speech.SpeechClient({
  keyFilename: './key.json'
});
>>>>>>> origin/main

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: 'org-gIJcbyQkgXhwX3leP6HLMuEd'
});

app.use(cors());
app.use(express.json());

// Add the new routes here
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Speech-to-Text Transcription Server',
    endpoints: {
      health: '/health',
      websocket: 'ws://localhost:5001'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeConnections: io.engine.clientsCount,
    activeSessions: activeSessions.size
  });
});

// Error handling routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested endpoint does not exist'
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: 'Something went wrong on the server'
  });
});

// Store active transcription sessions
const activeSessions = new Map();

// Add this at the top level of your server file
let lastTranscription = '';
let currentSentence = '';
let wordCount = 0;
const MIN_WORDS = 200;

// Add these variables at the top level
let isStreaming = false;
let streamTimeout = null;
const STREAM_TIMEOUT = 60000; // 60 seconds

// Add at the top level
let accumulatedText = '';
let lastTimestamp = null;
const ACCUMULATION_TIMEOUT = 2000; // 2 seconds
let accumulationTimer = null;

const MIN_SENTENCE_COUNT = 4; // Number of sentences to accumulate before sending
const MAX_CHARS = 300; // Maximum characters before forcing a send
let sentenceCount = 0;

// Add these variables at the top level
const TIME_INTERVAL = 10000; // 10 seconds
const MIN_SENTENCES = 4;
const MAX_SENTENCES = 5;
let pendingTranscripts = [];
let lastTranscriptTime = null;
let transcriptStartTime = null;

// Add these variables at the top level
let pendingAIText = [];

// Add near the top of the file
const mockAIResponses = [
  "Based on these statements, I understand the key points you're discussing. Would you like me to elaborate on any particular aspect?",
  "I've analyzed your conversation and noticed several interesting points. Let me know if you'd like me to focus on any specific part.",
  "From what you've shared, there seem to be multiple topics being discussed. I can provide more detailed insights on any of these points.",
  "I've processed your conversation and can help clarify or expand on any of the topics mentioned.",
  "Your discussion covers several important aspects. I can provide more detailed information about any of these points."
];

let mockResponseIndex = 0;

// At the top, import speech services
const {
  createGoogleStream,
  processWithOpenAI
} = require('./services/speechServices');

// At the top level, update or add these variables
const ANALYSIS_INTERVAL = 20000; // 20 seconds
let lastAIResponseTime = null;

// Create temp directory for audio files if it doesn't exist
const tempDir = path.join(os.tmpdir(), 'audio-transcription');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Add this to your environment variables
process.env.TEMP_AUDIO_DIR = tempDir;

// At the top level, add a variable to track AI processing state
const aiProcessingSessions = new Map();

// Add these example conversations near the top of the file
const EXAMPLE_CONVERSATIONS = {
    powerbi: {
        user: "The meeting is discussing implementing a company-wide Power BI solution connected to various Azure data sources. Participants are exploring data modeling strategies, incremental refresh policies, row-level security, and CI/CD pipelines for dataset deployment. How would you design and explain this solution in detail?",
        assistant: `
1. TECHNICAL CONTEXT (50+ words)
   The current analytics infrastructure relies heavily on Azure SQL Database and Azure Synapse Analytics as primary data repositories, supplemented by Azure Data Lake Storage for unstructured data. Business units need interactive reports and scalable dashboards. Core objectives include integrating diverse data sources, ensuring data quality, handling large fact tables with incremental refresh, implementing robust RLS for secure data access, and establishing CI/CD pipelines for rapid, reliable Power BI asset deployment. The overarching goal is to streamline data consumption, improve decision-making, and maintain governance standards across the enterprise.

2. DETAILED SOLUTION (100+ words)
   • Data Integration & ETL/ELT Strategies: Leverage Azure Data Factory or Synapse Pipelines to orchestrate data ingestion from various sources (Azure SQL DB, Synapse, Data Lake) into a clean, consistent format. Apply transformations either in Power Query or via Databricks notebooks for advanced data preparation and feature engineering.
   
   • Azure Data Stack: Use Azure Synapse as a central query engine, tapping into Data Lake Storage for historical and granular data. Data Factory handles scheduled ingestion and transformations. For complex analytics, consider Databricks for scalable, distributed computations.
   
   • Data Modeling: Implement a star schema design within Power BI datasets, ensuring clear fact and dimension tables for efficient querying. This approach simplifies measure creation, DAX calculations, and ensures optimal performance.
   
   • Power BI Dashboard Design & DAX: Create role-specific dashboards focusing on key KPIs. Leverage DAX measures for dynamic calculations, time intelligence, and user-personalized views. Employ visuals that highlight trends, outliers, and predictive insights.
   
   • Incremental Refresh & RLS: Set up incremental refresh on large fact tables, defining appropriate range partitions for efficient query performance. Apply Row-Level Security based on Azure AD groups to filter data by role, department, or region, ensuring compliance and controlled data visibility.
   
   • CI/CD Pipeline Integration: Use Azure DevOps or GitHub Actions to version-control Power BI artifacts (PBIT, JSON, and dataset schemas). Integrate Power BI REST APIs or PowerShell scripts to automate deployments, enabling continuous integration/testing and seamless promotion from development to production environments.

3. CONSIDERATIONS & RISKS (100+ words)
   • Data Quality & Governance: Ensure all datasets pass through standardized validation frameworks. Adopt a data catalog (e.g., Purview) to maintain data lineage and metadata. Consider data profiling tools to continuously assess quality.
   
   • Security & Compliance: Align with corporate governance policies and regulatory frameworks (e.g., GDPR) by implementing Azure AD-based authentication and role-based access controls. Regular security audits ensure proper RLS configurations and prevent data leakage.
   
   • Performance & Scalability: Incremental refresh reduces processing overhead. Optimize DAX measures, partition large tables, and leverage Aggregations for faster queries. Monitor performance with Power BI Premium metrics and Azure Monitor logs.
   
   • Cost Management: Track Azure consumption costs and optimize resource usage. Consider Power BI Premium capacity for large-scale deployments, and carefully size compute resources to balance performance and cost.

4. ACTION ITEMS (50+ words)
   • Implementation Steps: 
     1. Data Ingestion: Configure ADF pipelines to pull data into a standardized landing zone.
     2. Data Transformation: Apply Power Query transformations or Databricks notebooks for complex data shaping.
     3. Modeling & Visualizations: Design a robust semantic model and develop intuitive dashboards.
     4. Security & Governance: Implement RLS, set up Azure Purview, and define user roles.
     5. CI/CD: Establish automated pipelines to deploy and monitor datasets and reports.
   
   • Required Resources: Skilled BI engineers, Azure services (Data Factory, Synapse, Databricks), Power BI Premium capacity, Azure DevOps/GitHub for CI/CD.
   
   • Timeline: ~8-12 weeks, phased approach (Design, POC, Deployment).
   
   • Success Metrics: Improved report adoption rates, reduced data refresh times, enhanced data quality scores, increased user satisfaction (via surveys), and stable performance metrics (reduced query times).

5. FOLLOW-UP QUESTIONS
   • Are there specific compliance standards or certifications we need to meet?
   • What are the peak concurrency requirements for report usage?
   • Do we need advanced custom visuals or embedded analytics for external stakeholders?
   • How will we handle schema evolution and maintain backward compatibility?
`
    }
};

// Update the Meeting preset configuration
const MEETING_PRESET = {
    systemPrompt: `You are a Business Intelligence Analyst working in an Azure-centric environment. Your meeting focuses on implementing enterprise data analytics solutions, optimizing data pipelines, integrating multiple data sources, and designing Power BI dashboards for insightful reporting. Your responses should reflect best practices in data modeling, ETL/ELT, data governance, incremental refresh configurations, row-level security, CI/CD pipelines for deployments, and interactive visualization design in Power BI.

Response Format:
1. TECHNICAL CONTEXT (50+ words)
   • Current Data Architecture
   • Business/Analytical Requirements
   • Key Data Sources & Systems (Azure SQL DB, Azure Synapse, Data Lake, etc.)

2. DETAILED SOLUTION (100+ words)
   • Data Integration & ETL/ELT Strategies
   • Azure Data Stack (Data Factory, Synapse, Databricks)
   • Data Modeling Approaches (Star Schema, Data Vault)
   • Power BI Dashboard Design & DAX Examples
   • Incremental Refresh & Row-Level Security (RLS) considerations
   • CI/CD Pipeline Integration for Power BI assets

3. CONSIDERATIONS & RISKS (100+ words)
   • Data Quality & Governance
   • Security & Compliance (Azure AD, RBAC)
   • Performance & Scalability (Query Optimization, Incremental Refresh)
   • Cost Management (Azure Consumption, Power BI Licensing)

4. ACTION ITEMS (50+ words)
   • Implementation Steps (Ingestion, Transformation, Visualization)
   • Required Resources (Azure Services, Skills, Tools)
   • Timeline Estimates (Phased Approach)
   • Success Metrics (Report Adoption, Query Performance, Data Freshness)

5. FOLLOW-UP QUESTIONS
   • Clarifications on Data Sources
   • Analytical Requirements Details
   • Visualization Customizations

Ensure responses are a minimum of 300 words, technically accurate, and aligned with modern BI best practices.`,
    settings: {
        model: "gpt-3.5-turbo",
        max_tokens: 2000,
        temperature: 0.7,
        frequency_penalty: 0.2,
        presence_penalty: 0.5
    }
};

// Update fallback configuration
const FALLBACK_PRESET = {
    ...MEETING_PRESET,
    settings: {
        ...MEETING_PRESET.settings,
        model: "gpt-3.5-turbo-1106"
    }
};

// Update the formatAIResponse function
const formatAIResponse = (text) => {
    // Pre-process text
    text = text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // Format main headers (like "TECHNICAL CONTEXT:")
    text = text.replace(/^([A-Z][A-Z\s&]+):$/gm, (match, header) => {
        return `<div class="section-header">${header}</div>`;
    });

    // Format colored headers (like "Current Situation:")
    text = text.replace(/^([A-Za-z][A-Za-z\s]+):\s*(.+)$/gm, (match, header, content) => {
        return `<div class="content-row">
<span class="header-text">${header}:</span>
<span class="header-content">${content}</span>
</div>`;
    });

    // Format bullet points
    text = text.replace(/^[•\-]\s*(.+)$/gm, (match, content) => {
        if (content.includes(':')) {
            const [label, value] = content.split(':').map(s => s.trim());
            return `<div class="bullet-row">
<span class="bullet">•</span>
<span class="bullet-label">${label}:</span>
<span class="bullet-content">${value}</span>
</div>`;
        }
        return `<div class="bullet-row">
<span class="bullet">•</span>
<span class="bullet-content">${content}</span>
</div>`;
    });

    // Format numbered lists
    text = text.replace(/^\d+\.\s*(.+)$/gm, (match, content) => {
        return `<div class="number-row">
<span class="number"></span>
<span class="number-content">${content}</span>
</div>`;
    });

    // Clean up and wrap
    text = text
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\s+/gm, '')
        .replace(/\s+$/gm, '')
        .trim();

    return `<div class="ai-content">${text}</div>`;
};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let recognizeStream = null;
  let currentService = null;
  let audioBuffer = Buffer.alloc(0);

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
      }

      socket.join(roomId);
      socket.emit('transcription_started');
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
      
      if (service === 'google') {
        const stream = activeSessions.get(roomId);
        if (stream && !stream.destroyed) {
          const audioBuffer = Buffer.from(audio);
          stream.write(audioBuffer);
        }
      } else if (service === 'openai') {
        try {
          // Accumulate audio data
          audioBuffer = Buffer.concat([audioBuffer, Buffer.from(audio)]);
          
          // Process with OpenAI when we have enough data
          if (audioBuffer.length >= 32000) { // 2 seconds of audio at 16kHz
            // Convert the audio buffer to proper format
            const result = await processWithOpenAI(audioBuffer);
            if (result && result.text) {
              socket.emit('transcription', {
                text: result.text,
                isFinal: true,
                timestamp: new Date().toISOString(),
                service: 'openai'
              });
            }
            // Clear the buffer after processing
            audioBuffer = Buffer.alloc(0);
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
      if (accumulatedText.trim()) {
        const transcription = {
          text: accumulatedText.trim(),
          isFinal: true,
          timestamp: new Date().toISOString(),
          speakerTag: 0,
          socketId: socket.id
        };
        io.to(roomId).emit('transcription', transcription);
        accumulatedText = '';
      }
      
      if (accumulationTimer) {
        clearTimeout(accumulationTimer);
      }
      
      const stream = activeSessions.get(roomId);
      if (stream) {
        stream.destroy();
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

      // Reset accumulated context
      accumulatedContext = [];
      lastAIResponseTime = null;

      console.log(`Stopped AI processing for room: ${roomId}`);
    } catch (error) {
      console.error('Error stopping AI processing:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    lastAIResponseTime = null; // Reset the timer
    accumulatedContext = []; // Clear accumulated context
    if (recognizeStream) {
      recognizeStream.destroy();
    }
    
    // Clean up AI processing on disconnect
    for (const [roomId, session] of aiProcessingSessions.entries()) {
      if (session.socketId === socket.id) {
        if (session.timer) {
          clearTimeout(session.timer);
        }
        aiProcessingSessions.delete(roomId);
      }
    }
  });

  socket.on('transcription', (transcription) => {
    if (transcription.isFinal) {
      const now = Date.now();
      
      // Add to context
      accumulatedContext.push(transcription.text);
      
      // Initialize last response time if not set
      if (!lastAIResponseTime) {
        lastAIResponseTime = now;
      }
      
      // Only process if enough time has passed since last response
      if (now - lastAIResponseTime >= ANALYSIS_INTERVAL) {
        const context = accumulatedContext.join(' ');
        if (context.trim()) {
          analyzeContext(context, socket);
          accumulatedContext = []; // Clear context after processing
          lastAIResponseTime = now; // Update the last response time
        }
      }
    }
  });

  socket.on('process_with_ai', async (data) => {
    const now = Date.now();
    
    if (!lastAIResponseTime || now - lastAIResponseTime >= ANALYSIS_INTERVAL) {
        try {
            const completion = await openai.chat.completions.create({
                model: MEETING_PRESET.settings.model,
                messages: [
                    {
                        role: "system",
                        content: MEETING_PRESET.systemPrompt
                    },
                    {
                        role: "user",
                        content: data.text
                    }
                ],
                max_tokens: MEETING_PRESET.settings.max_tokens,
                temperature: MEETING_PRESET.settings.temperature,
                frequency_penalty: MEETING_PRESET.settings.frequency_penalty,
                presence_penalty: MEETING_PRESET.settings.presence_penalty
            });

            const analysis = completion.choices[0].message.content;
            socket.emit('ai_response', { 
                text: formatAIResponse(analysis),  // Format the response
                context: data.text,
                timestamp: new Date().toISOString(),
                analysisType: 'detailed',
                preset: 'meeting',
                model: MEETING_PRESET.settings.model,
                isFormatted: true  // Add flag to indicate formatted content
            });
            
            lastAIResponseTime = now;
        } catch (error) {
            console.error('Error with primary model:', error);
            
            // Try fallback model
            try {
                const fallbackCompletion = await openai.chat.completions.create({
                    model: FALLBACK_PRESET.settings.model,
                    messages: [
                        {
                            role: "system",
                            content: MEETING_PRESET.systemPrompt
                        },
                        {
                            role: "user",
                            content: data.text
                        }
                    ],
                    max_tokens: FALLBACK_PRESET.settings.max_tokens,
                    temperature: FALLBACK_PRESET.settings.temperature,
                    frequency_penalty: FALLBACK_PRESET.settings.frequency_penalty,
                    presence_penalty: FALLBACK_PRESET.settings.presence_penalty
                });

                socket.emit('ai_response', { 
                    text: formatAIResponse(fallbackCompletion.choices[0].message.content),  // Format the response
                    context: data.text,
                    timestamp: new Date().toISOString(),
                    analysisType: 'detailed',
                    preset: 'meeting',
                    model: 'fallback',
                    isFormatted: true  // Add flag to indicate formatted content
                });
                
                lastAIResponseTime = now;
            } catch (fallbackError) {
                console.error('Error with fallback model:', fallbackError);
                
                // Use mock response as final fallback
                const mockResponse = `Technical Analysis Summary:
                    Context: ${data.text.split(' ').slice(0, 10).join(' ')}...
                    
                    Key Technical Points:
                    • Architecture Considerations
                    • Implementation Strategy
                    • Next Steps
                    
                    Note: Analysis systems currently experiencing issues. Will resume shortly.`;
                
                socket.emit('ai_response', { 
                    text: formatAIResponse(mockResponse),  // Format the response
                    context: data.text,
                    isMock: true,
                    preset: 'meeting',
                    model: 'mock',
                    isFormatted: true  // Add flag to indicate formatted content
                });
            }
        }
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
    });
};

// Replace the existing server.listen() call with:
const PORT = process.env.PORT || 5002;
startServer(PORT);

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Cleaning up...');
  for (const [_, stream] of activeSessions.entries()) {
    if (stream) {
      stream.destroy();
    }
  }
  server.close(() => {
    process.exit(0);
  });
});

// Add function to restart stream
const restartStream = async (roomId) => {
  try {
    console.log('Restarting stream...');
    const oldStream = activeSessions.get(roomId);
    if (oldStream) {
      oldStream.destroy();
      activeSessions.delete(roomId);
    }

    // Send any accumulated text before restarting
    if (currentSentence.trim()) {
      const transcription = {
        text: currentSentence.trim(),
        isFinal: true,
        timestamp: new Date().toISOString(),
        speakerTag: 0,
        socketId: socket.id
      };
      io.to(roomId).emit('transcription', transcription);
      currentSentence = '';
      wordCount = 0;
    }

    // Create new stream
    await createNewStream(roomId);
    isStreaming = false;
  } catch (error) {
    console.error('Error restarting stream:', error);
  }
};

// Update the stream creation
const createNewStream = async (roomId) => {
  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'en-US',
      enableAutomaticPunctuation: true,
      enableSpeakerDiarization: true,
      diarizationSpeakerCount: 2,
      model: 'latest_long',
      useEnhanced: true,
      metadata: {
        interactionType: 'DISCUSSION',
        industryNaicsCodeOfAudio: 813,
        originalMediaType: 'AUDIO',
      }
    },
    interimResults: true,
    singleUtterance: false
  };

  recognizeStream = speechClient
    .streamingRecognize(request)
    .on('error', (error) => {
      console.error('Speech recognition error:', error);
      if (error.code === 11) { // Audio timeout error
        restartStream(roomId);
      }
      socket.emit('transcription_error', { 
        message: 'Speech recognition error',
        details: error.message 
      });
    })
    .on('data', (data) => {
      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcript = data.results[0].alternatives[0].transcript;
        
        if (data.results[0].isFinal) {
          const now = Date.now();
          
          // Add to accumulated text
          accumulatedText += (accumulatedText ? ' ' : '') + transcript;
          
          // Count sentences in accumulated text
          const sentences = accumulatedText.match(/[.!?]+/g);
          sentenceCount = sentences ? sentences.length : 0;
          
          // Clear existing timer
          if (accumulationTimer) {
            clearTimeout(accumulationTimer);
          }
          
          // Function to send accumulated text
          const sendAccumulatedText = () => {
            if (accumulatedText.trim()) {
              const transcription = {
                text: accumulatedText.trim(),
                isFinal: true,
                timestamp: new Date().toISOString(),
                speakerTag: data.results[0].alternatives[0].words?.[0]?.speakerTag || 0,
                socketId: socket.id
              };
              
              console.log('Sending transcription:', transcription.text);
              io.to(roomId).emit('transcription', transcription);
              
              accumulatedText = '';
              sentenceCount = 0;
              lastTimestamp = now;
            }
          };
          
          // Check if we should send the accumulated text
          const shouldSend = 
            // If we have enough sentences
            sentenceCount >= MIN_SENTENCE_COUNT ||
            // Or if we have accumulated a lot of text
            accumulatedText.length > MAX_CHARS ||
            // Or if it's been a while since our last transmission
            (lastTimestamp && (now - lastTimestamp) > ACCUMULATION_TIMEOUT);
          
          if (shouldSend) {
            sendAccumulatedText();
          } else {
            // Set timer to send accumulated text after delay
            accumulationTimer = setTimeout(sendAccumulatedText, ACCUMULATION_TIMEOUT);
          }
        }
      }
    });

  activeSessions.set(roomId, recognizeStream);
  return recognizeStream;
};

// Update the analyzeContext function
const analyzeContext = async (context, socket) => {
    try {
        const completion = await openai.chat.completions.create({
            ...MEETING_PRESET.settings,
            messages: [
                {
                    role: "system",
                    content: MEETING_PRESET.systemPrompt
                },
                {
                    role: "user",
                    content: context
                }
            ]
        });

        socket.emit('ai_response', { 
            text: formatAIResponse(completion.choices[0].message.content),  // Format the response
            context: context,
            timestamp: new Date().toISOString(),
            segmentDuration: '20 seconds',
            analysisType: 'detailed',
            preset: 'meeting',
            model: MEETING_PRESET.settings.model,
            isFormatted: true  // Add flag to indicate formatted content
        });
    } catch (error) {
        console.error('Error analyzing context:', error);
        
        if (error.code === 'insufficient_quota' || error.code === 'rate_limit_exceeded') {
            const mockResponse = `Technical Analysis:
                • Context: ${context.split(' ').slice(0, 5).join(' ')}...
                • Requirements: Analyzing technical requirements...
                • Solution: Will suggest appropriate tech stack
                • Next Steps: Ready to provide specific implementation details`;
            
            socket.emit('ai_response', { 
                text: formatAIResponse(mockResponse),  // Format the response
                isMock: true,
                context: context,
                isFormatted: true  // Add flag to indicate formatted content
            });
        } else {
            socket.emit('ai_response', { 
                text: "Processing technical discussion. Will provide analysis in next segment.",
                isError: true
            });
        }
    }
};
