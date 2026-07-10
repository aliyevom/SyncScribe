const WebSocket = require('ws');

const DEFAULT_REGION = 'us';
const DEFAULT_SAMPLE_RATE = 16000;
const MAX_CHUNK_BYTES = 3200; // 100ms at 16kHz, 16-bit mono

const activeSessions = new Map();

function normalizeRegion(region) {
  const value = String(region || DEFAULT_REGION).toLowerCase();
  if (value === 'eu' || value === 'eu1') return 'eu';
  if (value === 'usa' || value === 'us' || value === 'us1') return 'us';
  return DEFAULT_REGION;
}

function getRealtimeUrl() {
  if (process.env.SPEECHMATICS_RT_URL) {
    return process.env.SPEECHMATICS_RT_URL.replace(/\/+$/, '');
  }

  return normalizeRegion(process.env.SPEECHMATICS_REGION) === 'eu'
    ? 'wss://eu.rt.speechmatics.com/v2'
    : 'wss://us.rt.speechmatics.com/v2';
}

function parseSpeakerIdentifiers() {
  const raw = process.env.SPEECHMATICS_MY_SPEAKER_IDS || process.env.SPEECHMATICS_MY_SPEAKER_ID || '';
  return raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function getConfig() {
  return {
    apiKey: process.env.SPEECHMATICS_API_KEY || '',
    realtimeUrl: getRealtimeUrl(),
    language: process.env.SPEECHMATICS_LANGUAGE || 'en',
    model: process.env.SPEECHMATICS_MODEL || 'enhanced',
    mySpeakerLabel: process.env.SPEECHMATICS_MY_SPEAKER_LABEL || 'Me',
    mySpeakerIdentifiers: parseSpeakerIdentifiers(),
    speakerSensitivity: Number.parseFloat(process.env.SPEECHMATICS_SPEAKER_SENSITIVITY || '0.45'),
    maxSpeakers: Number.parseInt(process.env.SPEECHMATICS_MAX_SPEAKERS || '4', 10),
  };
}

function normalizeSpeakerLabel(label) {
  if (!label) return 'UU';
  return String(label).toLowerCase() === 'me' ? 'me' : String(label);
}

function buildRecognitionMessage(config) {
  const speakerConfig = {
    max_speakers: Number.isFinite(config.maxSpeakers) ? Math.max(2, config.maxSpeakers) : 4,
    prefer_current_speaker: true,
    speaker_sensitivity: Number.isFinite(config.speakerSensitivity)
      ? Math.max(0, Math.min(1, config.speakerSensitivity))
      : 0.45,
  };

  if (config.mySpeakerIdentifiers.length > 0) {
    speakerConfig.speakers = [{
      label: config.mySpeakerLabel,
      speaker_identifiers: config.mySpeakerIdentifiers,
    }];
  }

  return {
    message: 'StartRecognition',
    audio_format: {
      type: 'raw',
      encoding: 'pcm_s16le',
      sample_rate: DEFAULT_SAMPLE_RATE,
    },
    transcription_config: {
      language: config.language,
      model: config.model,
      max_delay: 0.8,
      max_delay_mode: 'flexible',
      enable_partials: false,
      diarization: 'speaker',
      speaker_diarization_config: speakerConfig,
      conversation_config: {
        end_of_utterance_silence_trigger: 0.7,
      },
    },
  };
}

function extractWords(results = []) {
  return results
    .map(item => {
      const alt = item?.alternatives?.[0];
      if (!alt) return null;
      return {
        word: alt.content,
        start: item.start_time,
        end: item.end_time,
        confidence: alt.confidence,
        speaker: normalizeSpeakerLabel(alt.speaker),
      };
    })
    .filter(Boolean);
}

function dominantSpeaker(words) {
  const counts = new Map();
  for (const word of words) {
    if (!word.speaker || word.speaker === 'UU') continue;
    counts.set(word.speaker, (counts.get(word.speaker) || 0) + 1);
  }

  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : 'UU';
}

function emitTranscript(socket, message, isFinal) {
  const text = (message.metadata?.transcript || '').trim();
  if (!text) return;

  const words = extractWords(message.results || []);
  const speakerTag = dominantSpeaker(words);
  const confidenceValues = words
    .map(word => word.confidence)
    .filter(value => typeof value === 'number');
  const confidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;

  socket.emit('transcription', {
    text,
    isFinal,
    speechFinal: isFinal,
    speakerTag,
    confidence,
    words,
    service: 'speechmatics',
    timestamp: new Date().toISOString(),
    languageCode: message.language || 'en',
    metadata: {
      startTime: message.metadata?.start_time ?? null,
      endTime: message.metadata?.end_time ?? null,
      transcript: text,
    },
  });
}

function createSpeechmaticsStream(socket, roomId) {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error('Missing SPEECHMATICS_API_KEY. Set it in server/.env.');
  }

  const existing = activeSessions.get(roomId);
  if (existing) {
    try { existing.destroy(); } catch (_) {}
    activeSessions.delete(roomId);
  }

  const ws = new WebSocket(config.realtimeUrl, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'User-Agent': 'SyncScribe/1.0',
    },
  });

  const state = {
    started: false,
    closed: false,
    sentChunks: 0,
    pendingAudio: [],
  };

  const session = {
    send(audioData) {
      if (state.closed) return;
      const buffer = Buffer.from(audioData);
      if (!state.started || ws.readyState !== WebSocket.OPEN) {
        state.pendingAudio.push(buffer);
        return;
      }
      sendAudioBuffer(buffer);
    },
    finish() {
      finishSession();
    },
    destroy() {
      finishSession();
    },
    getReadyState() {
      return ws.readyState;
    },
  };

  function sendJson(payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function sendAudioBuffer(buffer) {
    for (let offset = 0; offset < buffer.length; offset += MAX_CHUNK_BYTES) {
      const chunk = buffer.subarray(offset, Math.min(offset + MAX_CHUNK_BYTES, buffer.length));
      if (chunk.length === 0) continue;
      ws.send(chunk);
      state.sentChunks += 1;
    }
  }

  function flushPendingAudio() {
    const queued = state.pendingAudio.splice(0);
    for (const buffer of queued) sendAudioBuffer(buffer);
  }

  function finishSession() {
    if (state.closed) return;
    state.closed = true;

    try {
      if (ws.readyState === WebSocket.OPEN) {
        sendJson({ message: 'EndOfStream', last_seq_no: state.sentChunks });
        setTimeout(() => {
          try { ws.close(); } catch (_) {}
        }, 1200);
      } else {
        try { ws.terminate(); } catch (_) {}
      }
    } catch (_) {
      try { ws.terminate(); } catch (_) {}
    }

    activeSessions.delete(roomId);
  }

  ws.on('open', () => {
    console.log('Speechmatics connection established');
    sendJson(buildRecognitionMessage(config));
  });

  ws.on('message', (payload, isBinary) => {
    if (isBinary) return;

    let message;
    try {
      message = JSON.parse(payload.toString('utf8'));
    } catch (error) {
      console.warn('Speechmatics non-JSON message:', payload.toString());
      return;
    }

    try {
      if (message.message === 'RecognitionStarted') {
        state.started = true;
        flushPendingAudio();
        socket.emit('transcription_metadata', {
          service: 'speechmatics',
          metadata: {
            id: message.id,
            languagePackInfo: message.language_pack_info || null,
            knownSpeaker: config.mySpeakerIdentifiers.length > 0 ? config.mySpeakerLabel : null,
          },
        });
      } else if (message.message === 'AddPartialTranscript') {
        emitTranscript(socket, message, false);
      } else if (message.message === 'AddTranscript') {
        emitTranscript(socket, message, true);
      } else if (message.message === 'EndOfUtterance') {
        socket.emit('utterance_end', {
          lastWordEnd: message.metadata?.end_time ?? null,
          service: 'speechmatics',
          timestamp: new Date().toISOString(),
        });
      } else if (message.message === 'Warning') {
        console.warn('Speechmatics warning:', message);
      } else if (message.message === 'Error') {
        console.error('Speechmatics error:', message);
        socket.emit('transcription_error', {
          message: 'Speechmatics transcription error',
          details: message.reason || message.type || 'Unknown Speechmatics error',
          service: 'speechmatics',
        });
      }
    } catch (error) {
      console.error('Error processing Speechmatics message:', error);
      socket.emit('transcription_error', {
        message: 'Error processing Speechmatics transcription',
        details: error.message,
        service: 'speechmatics',
      });
    }
  });

  ws.on('error', (error) => {
    console.error('Speechmatics websocket error:', error);
    socket.emit('transcription_error', {
      message: 'Speechmatics connection error',
      details: error.message,
      service: 'speechmatics',
    });
  });

  ws.on('close', () => {
    console.log('Speechmatics connection closed');
    state.closed = true;
    activeSessions.delete(roomId);
  });

  activeSessions.set(roomId, session);
  return session;
}

module.exports = {
  createSpeechmaticsStream,
  getSpeechmaticsConfig: getConfig,
};
