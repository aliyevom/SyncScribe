const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const { audioPreprocessor } = require('./speechServices');

// Track active Deepgram sessions
const activeSessions = new Map();

// Initialize Deepgram client
const API_KEY = process.env.DEEPGRAM_API_KEY;
if (!API_KEY) {
  throw new Error('Missing DEEPGRAM_API_KEY. Set it in server/.env (do not hardcode).');
}

// Create Deepgram client
const deepgramClient = createClient(API_KEY);

// Deepgram configuration for RAW PCM16 (what our client sends)
const deepgramConfig = {
  model: 'nova-3',
  language: 'en-US',
  encoding: 'linear16',
  sample_rate: 16000,
  channels: 1,
  smart_format: true,
  interim_results: true,
  punctuate: true,
  diarize: true,
  // Semantic endpointing / turn-taking signals (Phase 1)
  endpointing: 300,       // ms of silence before Deepgram marks speech_final
  utterance_end_ms: 1000, // emit UtteranceEnd after ~1s gap (needs interim_results)
  vad_events: true        // emit SpeechStarted events
};

// Create Deepgram WebSocket stream
const createDeepgramStream = (socket, roomId) => {
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 3;

  const createStream = () => {
  try {
    // Clean up any existing session
    const existingStream = activeSessions.get(roomId);
    if (existingStream) {
      try {
        existingStream.finish();
        existingStream.removeAllListeners();
      } catch (err) {
        console.warn('Error cleaning up existing stream:', err);
      }
      activeSessions.delete(roomId);
    }

    // Create new stream
    const deepgramLive = deepgramClient.listen.live(deepgramConfig);
    activeSessions.set(roomId, deepgramLive);

    // Set up keepAlive interval
    const keepAliveInterval = setInterval(() => {
      if (deepgramLive.getReadyState() === 1) { // OPEN
        console.log('Sending keepAlive to Deepgram');
        deepgramLive.keepAlive();
      }
    }, 10000);

    // Handle connection open
    deepgramLive.addListener(LiveTranscriptionEvents.Open, () => {
      console.log('Deepgram connection established');
    });

            // Handle transcription results
      deepgramLive.addListener(LiveTranscriptionEvents.Transcript, (data) => {
        try {
          console.log('Received transcription:', data);
          const { channel, is_final, speech_final } = data;

          if (channel?.alternatives?.length > 0) {
            const alternative = channel.alternatives[0];

            // Get word-level information (diarization puts `speaker` on each word)
            const words = alternative.words || [];
            const wordTimings = words.map(word => ({
              word: word.word,
              start: word.start,
              end: word.end,
              confidence: word.confidence,
              speaker: (typeof word.speaker === 'number') ? word.speaker : null
            }));

            // Resolve the turn-level speaker: majority vote across words,
            // falling back to channel.speaker, then 0.
            let speakerTag = 0;
            const speakerCounts = {};
            for (const w of wordTimings) {
              if (typeof w.speaker === 'number') {
                speakerCounts[w.speaker] = (speakerCounts[w.speaker] || 0) + 1;
              }
            }
            const topSpeaker = Object.entries(speakerCounts)
              .sort((a, b) => b[1] - a[1])[0];
            if (topSpeaker) {
              speakerTag = parseInt(topSpeaker[0], 10);
            } else if (channel.speaker !== undefined && channel.speaker !== null) {
              speakerTag = parseInt(channel.speaker, 10) || 0;
            }

            const transcriptionResult = {
              text: alternative.transcript,
              isFinal: is_final,
              speechFinal: speech_final,
              speakerTag,
              confidence: alternative.confidence || 0,
              words: wordTimings,
              service: 'deepgram',
              timestamp: new Date().toISOString(),
              languageCode: channel.language || 'en-US',
              metadata: {
                hasFillerWords: alternative.filler_words?.length > 0,
                sentiment: alternative.sentiment,
                speechRate: words.length > 0 ? words.length / (words[words.length - 1].end - words[0].start) : 0
              }
            };

            // Emit any non-empty transcript (including interim) for live UI
            if (alternative.transcript && alternative.transcript.trim().length > 0) {
              socket.emit('transcription', transcriptionResult);
            }
          }
        } catch (error) {
          console.error('Error processing transcription:', error);
          socket.emit('transcription_error', {
            message: 'Error processing transcription',
            details: error.message,
            service: 'deepgram'
          });
        }
      });

      // Handle end-of-turn signal (Phase 1) — fires after utterance_end_ms of silence
      deepgramLive.addListener(LiveTranscriptionEvents.UtteranceEnd, (data) => {
        try {
          socket.emit('utterance_end', {
            lastWordEnd: data?.last_word_end ?? null,
            channel: data?.channel ?? null,
            service: 'deepgram',
            timestamp: new Date().toISOString()
          });
        } catch (err) {
          console.warn('Error emitting utterance_end:', err);
        }
      });

      // Handle VAD speech-start (Phase 1)
      deepgramLive.addListener(LiveTranscriptionEvents.SpeechStarted, (data) => {
        try {
          socket.emit('speech_started', {
            timestamp: new Date().toISOString(),
            service: 'deepgram'
          });
        } catch (err) {
          console.warn('Error emitting speech_started:', err);
        }
      });

      // Handle errors
      deepgramLive.addListener(LiveTranscriptionEvents.Error, (error) => {
        console.error('Deepgram error:', error);
        
        // Clean up the failed stream
        try {
          deepgramLive.finish();
          deepgramLive.removeAllListeners();
          clearInterval(keepAliveInterval);
          activeSessions.delete(roomId);
        } catch (err) {
          console.warn('Error cleaning up failed stream:', err);
        }
        
        // Attempt reconnection
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`Attempting to reconnect to Deepgram (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
          setTimeout(() => {
            try {
              const newStream = createStream();
              if (newStream) {
                console.log('Reconnection successful');
              }
            } catch (err) {
              console.error('Reconnection failed:', err);
              socket.emit('transcription_error', {
                message: 'Failed to reconnect to speech service',
                details: err.message,
                service: 'deepgram'
              });
            }
          }, 2000 * reconnectAttempts); // Exponential backoff
        } else {
          socket.emit('transcription_error', {
            message: 'Speech recognition error - max retries exceeded',
            details: error.message,
            service: 'deepgram'
          });
        }
      });

      // Handle close
      deepgramLive.addListener(LiveTranscriptionEvents.Close, () => {
        console.log('Deepgram connection closed');
        clearInterval(keepAliveInterval);
        activeSessions.delete(roomId);
        try {
          deepgramLive.finish();
          deepgramLive.removeAllListeners();
        } catch (err) {
          console.warn('Error during stream cleanup:', err);
        }
      });

      // Handle warning
      deepgramLive.addListener(LiveTranscriptionEvents.Warning, (warning) => {
        console.warn('Deepgram warning:', warning);
      });

      // Handle metadata
      deepgramLive.addListener(LiveTranscriptionEvents.Metadata, (metadata) => {
        console.log('Deepgram metadata:', metadata);
        socket.emit('transcription_metadata', {
          metadata,
          service: 'deepgram'
        });
      });

      // Handle close
      deepgramLive.addListener('close', () => {
        console.log('Deepgram connection closed');
      });

      return deepgramLive;
    } catch (error) {
      console.error('Error creating Deepgram stream:', error);
      throw error;
    }
  };

  return createStream();
};

// Process audio data
const processAudioData = (stream, audioData) => {
  try {
    // Apply noise reduction
    const processedBuffer = audioPreprocessor.applyNoiseReduction(audioData);
    
    // Check for voice activity
    if (!audioPreprocessor.detectVoiceActivity(processedBuffer)) {
      return; // Skip silence
    }
    
    // Send processed audio to Deepgram
    if (stream && stream.getReadyState) {
      const readyState = stream.getReadyState();
      if (readyState === 1) {
        stream.send(processedBuffer);
      } else {
        console.log('Stream not ready, state:', readyState);
      }
    } else {
      // For v3 SDK, just send directly if stream is available
      if (stream && typeof stream.send === 'function') {
        stream.send(processedBuffer);
      }
    }
  } catch (error) {
    console.error('Error processing audio data:', error);
    throw error;
  }
};

module.exports = {
  deepgramClient,
  createDeepgramStream,
  processAudioData,
  deepgramConfig
};