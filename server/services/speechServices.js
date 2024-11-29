const speech = require('@google-cloud/speech');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const wav = require('wav');

// Initialize Google Speech client
const googleSpeechClient = new speech.SpeechClient({
  keyFilename: path.join(__dirname, '../key.json')
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Google Speech-to-Text configuration
const googleSpeechConfig = {
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
      originalMediaType: 'AUDIO'
    }
  },
  interimResults: true,
  singleUtterance: false
};

// OpenAI Speech-to-Text configuration
const openAISpeechConfig = {
  model: "whisper-1",
  language: "en",
  response_format: "verbose_json",
  temperature: 0.2,
  prompt: "This is a meeting conversation."
};

// Function to convert audio buffer to WAV format
const convertToWav = (audioBuffer, sampleRate = 16000) => {
  const writer = new wav.Writer({
    channels: 1,
    sampleRate: sampleRate,
    bitDepth: 16
  });

  const readable = new Readable();
  readable._read = () => {}; // _read is required but you can noop it
  readable.push(audioBuffer);
  readable.push(null);

  return new Promise((resolve, reject) => {
    const chunks = [];
    writer.on('data', chunk => chunks.push(chunk));
    writer.on('end', () => resolve(Buffer.concat(chunks)));
    writer.on('error', reject);
    readable.pipe(writer);
  });
};

// Function to create Google Speech stream
const createGoogleStream = (socket, roomId) => {
  const recognizeStream = googleSpeechClient
    .streamingRecognize(googleSpeechConfig)
    .on('error', (error) => {
      console.error('Google Speech recognition error:', error);
      socket.emit('transcription_error', {
        message: 'Speech recognition error',
        details: error.message,
        service: 'google'
      });
    })
    .on('data', (data) => {
      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcription = {
          text: data.results[0].alternatives[0].transcript,
          isFinal: data.results[0].isFinal,
          speakerTag: data.results[0].alternatives[0].words?.[0]?.speakerTag || 0,
          service: 'google',
          timestamp: new Date().toISOString()
        };
        socket.emit('transcription', transcription);
      }
    });

  return recognizeStream;
};

// Function to process audio with OpenAI
const processWithOpenAI = async (audioBuffer) => {
  try {
    // Convert the audio buffer to WAV format
    const wavBuffer = await convertToWav(audioBuffer);

    // Create a temporary WAV file
    const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.wav`);
    fs.writeFileSync(tempFilePath, wavBuffer);

    // Create a File object from the temporary file
    const file = fs.createReadStream(tempFilePath);

    // Process with OpenAI
    const response = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "en",
      response_format: "json",
      temperature: 0.2
    });

    // Clean up the temporary file
    fs.unlinkSync(tempFilePath);

    return {
      text: response.text,
      isFinal: true,
      service: 'openai',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('OpenAI Speech recognition error:', error);
    throw error;
  }
};

module.exports = {
  googleSpeechClient,
  openai,
  createGoogleStream,
  processWithOpenAI,
  googleSpeechConfig,
  openAISpeechConfig
}; 