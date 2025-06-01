const { AssemblyAI } = require('assemblyai');
const { Readable } = require('stream');

// Initialize AssemblyAI client
const assemblyClient = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY
});

// AssemblyAI configuration for real-time transcription
const assemblyAIConfig = {
  sampleRate: 16000,
  wordBoost: [
    'Power BI', 'Azure', 'SQL', 'dashboard', 'analytics',
    'database', 'report', 'visualization', 'business intelligence'
  ],
  punctuate: true,
  formatText: true,
  disfluencies: false, // Remove filler words
  languageDetection: false, // Stick to English only
  speakerLabels: true,
  redactPII: false,
  customSpelling: [
    { from: ['power bi', 'powerbi'], to: 'Power BI' },
    { from: ['azure'], to: 'Azure' },
    { from: ['sql'], to: 'SQL' }
  ]
};

// Create AssemblyAI real-time transcription stream
const createAssemblyAIStream = async (socket, roomId) => {
  try {
    const transcriber = assemblyClient.realtime.transcriber({
      sampleRate: assemblyAIConfig.sampleRate,
      wordBoost: assemblyAIConfig.wordBoost
    });

    transcriber.on('transcript', (transcript) => {
      if (transcript.text) {
        socket.emit('transcription', {
          text: transcript.text,
          isFinal: transcript.message_type === 'FinalTranscript',
          confidence: transcript.confidence,
          timestamp: new Date().toISOString(),
          service: 'assemblyai'
        });
      }
    });

    transcriber.on('error', (error) => {
      console.error('AssemblyAI error:', error);
      socket.emit('transcription_error', {
        message: 'AssemblyAI transcription error',
        details: error.message,
        service: 'assemblyai'
      });
    });

    await transcriber.connect();
    return transcriber;
  } catch (error) {
    console.error('Failed to create AssemblyAI stream:', error);
    throw error;
  }
};

// Process batch audio with AssemblyAI (for higher accuracy)
const processWithAssemblyAI = async (audioBuffer) => {
  try {
    // Convert buffer to base64
    const base64Audio = audioBuffer.toString('base64');
    
    // Upload audio for transcription
    const transcript = await assemblyClient.transcripts.create({
      audio_data: base64Audio,
      language_detection: false,
      punctuate: true,
      format_text: true,
      disfluencies: false,
      word_boost: assemblyAIConfig.wordBoost,
      boost_param: 'high',
      speaker_labels: true
    });

    // Poll for completion
    const result = await assemblyClient.transcripts.waitForCompletion(transcript.id);
    
    return {
      text: result.text,
      confidence: result.confidence,
      words: result.words,
      utterances: result.utterances
    };
  } catch (error) {
    console.error('AssemblyAI batch processing error:', error);
    throw error;
  }
};

module.exports = {
  createAssemblyAIStream,
  processWithAssemblyAI,
  assemblyAIConfig
}; 