require('dotenv').config();

const speech = require('@google-cloud/speech');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const wav = require('wav');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);

// Initialize Google Speech client
const googleSpeechClient = new speech.SpeechClient({
  keyFilename: path.join(__dirname, '../key.json')
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Enhanced Google Speech-to-Text configuration
const googleSpeechConfig = {
  config: {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'en-US',
    enableAutomaticPunctuation: true,
    enableSpeakerDiarization: true,
    diarizationSpeakerCount: 10, // Support up to 10 speakers
    model: 'video', // Better for technical meetings
    useEnhanced: true,
    metadata: {
      interactionType: 'DISCUSSION',
      microphoneDistance: 'NEARFIELD',
      originalMediaType: 'AUDIO'
    },
    enableWordTimeOffsets: true,
    enableWordConfidence: true,
    // Context-aware speech recognition
    speechContexts: [{
      phrases: [
        // Engineering Chapters terms
        'DORA metrics', 'design-to-operate', 'secure-by-design', 'ServiceNow',
        'Windows 11', 'Intune', 'Jamf', 'AVD', 'Entra', 'AD', 'M365',
        'Teams Voice', 'Teams Rooms', 'public cloud', 'private cloud',
        'Utah', 'Tier 1', 'Tier 2', 'Tier 3', 'DDI', 'Infoblox',
        'PBX', 'AMI', 'ADMS', 'Connect AI', 'TDEM',
        // Meeting terms
        'sprint', 'backlog', 'user story', 'epic', 'retrospective', 'standup',
        'planning', 'grooming', 'velocity', 'burndown', 'agile', 'scrum',
        'action item', 'blocker', 'dependency', 'milestone', 'deadline',
        // Business terms
        'OKR', 'KPI', 'ROI', 'MVP', 'SLA', 'stakeholder', 'requirement'
      ],
      boost: 20
    }],
    alternativeLanguageCodes: ['en-GB', 'en-IN'], // Support accents
    profanityFilter: false,
    enableSeparateRecognitionPerChannel: false,
    // Advanced audio processing
    audioChannelCount: 1,
    enableAutomaticPunctuation: true,
    maxAlternatives: 2 // Get alternatives for better accuracy
  },
  interimResults: true,
  singleUtterance: false,
  enableWordTimeOffsets: true
};

// Enhanced OpenAI Whisper configuration
const openAISpeechConfig = {
  model: "whisper-1",
  language: "en",
  response_format: "verbose_json", // Get more detailed output
  temperature: 0.0, // Lower temperature for more accurate transcription
  // Provide context prompt for better accuracy
  prompt: `This is a technical team meeting. Common terms include:
    DORA metrics, design-to-operate, secure-by-design, ServiceNow Greenfield,
    Windows 11, Intune, Jamf, AVD, Entra/AD, M365, Teams Voice, Teams Rooms,
    public/private cloud, Utah/Tier 1-3, DDI/Infoblox, PBX, AMI/ADMS, 
    Use clear, people-first language. Transcribe accurately with proper punctuation.`
};

// Audio preprocessing for better quality
class AudioPreprocessor {
  constructor() {
    this.bufferSize = 0;
    this.silenceThreshold = 0.01;
    this.noiseGateThreshold = 0.02;
  }

  // Apply noise reduction
  applyNoiseReduction(audioBuffer) {
    const samples = new Float32Array(audioBuffer.buffer);
    const processed = new Float32Array(samples.length);
    
    // Simple noise gate
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) < this.noiseGateThreshold) {
        processed[i] = 0;
      } else {
        processed[i] = samples[i];
      }
    }
    
    // Convert back to Int16Array
    const int16Array = new Int16Array(processed.length);
    for (let i = 0; i < processed.length; i++) {
      const s = Math.max(-1, Math.min(1, processed[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    return Buffer.from(int16Array.buffer);
  }

  // Detect voice activity
  detectVoiceActivity(audioBuffer) {
    const samples = new Float32Array(audioBuffer.buffer);
    let energy = 0;
    
    for (let i = 0; i < samples.length; i++) {
      energy += samples[i] * samples[i];
    }
    
    energy = Math.sqrt(energy / samples.length);
    return energy > this.silenceThreshold;
  }
}

const audioPreprocessor = new AudioPreprocessor();

// Enhanced Google Speech stream with better error handling
const createGoogleStream = (socket, roomId) => {
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 3;
  
  const createStream = () => {
  const recognizeStream = googleSpeechClient
    .streamingRecognize(googleSpeechConfig)
    .on('error', (error) => {
      console.error('Google Speech recognition error:', error);
        
        // Handle specific errors
        if (error.code === 11) { // Exceeded maximum duration
          console.log('Stream duration exceeded, creating new stream...');
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(() => {
              const newStream = createStream();
              activeSessions.set(roomId, newStream);
            }, 1000);
          }
        } else {
      socket.emit('transcription_error', {
        message: 'Speech recognition error',
        details: error.message,
        service: 'google'
      });
        }
    })
    .on('data', (data) => {
      if (data.results[0] && data.results[0].alternatives[0]) {
          const result = data.results[0];
          const alternative = result.alternatives[0];
          
          // Extract speaker information
          let speakerTag = 0;
          let speakerConfidence = 0;
          
          if (alternative.words && alternative.words.length > 0) {
            const speakerCounts = {};
            const speakerConfidences = {};
            
            alternative.words.forEach(word => {
              const tag = word.speakerTag || 0;
              speakerCounts[tag] = (speakerCounts[tag] || 0) + 1;
              if (word.confidence) {
                speakerConfidences[tag] = (speakerConfidences[tag] || []);
                speakerConfidences[tag].push(word.confidence);
              }
            });
            
            // Find dominant speaker
            speakerTag = Object.keys(speakerCounts).reduce((a, b) => 
              speakerCounts[a] > speakerCounts[b] ? a : b
            );
            
            // Calculate average confidence for dominant speaker
            if (speakerConfidences[speakerTag]) {
              const confidences = speakerConfidences[speakerTag];
              speakerConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
            }
          }
          
        const transcription = {
            text: alternative.transcript,
            isFinal: result.isFinal,
            speakerTag: parseInt(speakerTag) || 0,
            confidence: alternative.confidence || speakerConfidence || 0,
            words: alternative.words || [],
            alternatives: data.results[0].alternatives.slice(0, 2), // Include alternatives
          service: 'google',
            timestamp: new Date().toISOString(),
            languageCode: result.languageCode || 'en-US'
        };
          
          // Only emit if it's final or has meaningful content with good confidence
          if (result.isFinal || (alternative.transcript.trim().length > 2 && 
              (!alternative.confidence || alternative.confidence > 0.7))) {
        socket.emit('transcription', transcription);
          }
      }
    });

  return recognizeStream;
};

  return createStream();
};

// Enhanced OpenAI Whisper processing with better audio handling
const processWithOpenAI = async (audioBuffer, context = '') => {
  try {
    const tempDir = process.env.TEMP_AUDIO_DIR || os.tmpdir();
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFile = path.join(tempDir, `audio-${Date.now()}.wav`);
    
    // Apply noise reduction before processing
    const processedBuffer = audioPreprocessor.applyNoiseReduction(audioBuffer);
    
    // Check if there's actual voice activity
    if (!audioPreprocessor.detectVoiceActivity(processedBuffer)) {
      return null; // Skip silence
    }
    
    // Convert to WAV with optimal settings
    const wavWriter = new wav.Writer({
      channels: 1,
      sampleRate: 16000,
      bitDepth: 16
    });

    // Create streams
    const bufferStream = new Readable();
    bufferStream.push(processedBuffer);
    bufferStream.push(null);

    const fileStream = fs.createWriteStream(tempFile);

    // Write WAV file
    await new Promise((resolve, reject) => {
      bufferStream
        .pipe(wavWriter)
        .pipe(fileStream)
        .on('finish', resolve)
        .on('error', reject);
    });

    try {
      // Create dynamic prompt based on context
      let dynamicPrompt = openAISpeechConfig.prompt;
      if (context) {
        dynamicPrompt += ` Context: ${context}`;
      }
      
      // Process with OpenAI Whisper
      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: openAISpeechConfig.model,
        language: openAISpeechConfig.language,
        response_format: openAISpeechConfig.response_format,
        temperature: openAISpeechConfig.temperature,
        prompt: dynamicPrompt
      });
      
      // Process verbose response
      if (response.segments) {
        // Extract high-confidence segments
        const highConfidenceText = response.segments
          .filter(segment => !segment.no_speech_prob || segment.no_speech_prob < 0.5)
          .map(segment => segment.text)
          .join(' ')
          .trim();
        
        return {
          text: highConfidenceText || response.text,
          isFinal: true,
          confidence: response.segments.length > 0 ? 
            1 - (response.segments[0].no_speech_prob || 0) : 0.9,
          duration: response.duration,
          language: response.language,
          segments: response.segments
        };
      }
      
      return {
        text: response.text,
        isFinal: true,
        confidence: 0.9
      };
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanupError) {
        console.warn('Error cleaning up temp file:', cleanupError);
      }
    }
  } catch (error) {
    console.error('OpenAI Speech recognition error:', error);
    throw error;
  }
};

// Hybrid approach: Use both services for better accuracy
const processWithHybrid = async (audioBuffer, primaryService = 'openai') => {
  const results = [];
  
  try {
    // Process with primary service
    if (primaryService === 'openai') {
      const openaiResult = await processWithOpenAI(audioBuffer);
      if (openaiResult) {
        results.push({ ...openaiResult, service: 'openai' });
      }
    }
    
    // You could add Google Speech API batch processing here
    // for comparison and improved accuracy
    
    // Return best result or merge results
    if (results.length > 0) {
      // Sort by confidence
      results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      return results[0];
    }
    
    return null;
  } catch (error) {
    console.error('Hybrid processing error:', error);
    throw error;
  }
};

module.exports = {
  googleSpeechClient,
  openai,
  createGoogleStream,
  processWithOpenAI,
  processWithHybrid,
  googleSpeechConfig,
  openAISpeechConfig,
  AudioPreprocessor,
  audioPreprocessor
}; 