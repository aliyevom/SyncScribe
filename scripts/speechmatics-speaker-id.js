#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const WebSocket = require(path.join(ROOT_DIR, 'server/node_modules/ws'));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsAt = line.indexOf('=');
    if (equalsAt <= 0) continue;

    const key = line.slice(0, equalsAt).trim();
    let value = line.slice(equalsAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT_DIR, '.env'));
loadEnvFile(path.join(ROOT_DIR, '.env.local'));
loadEnvFile(path.join(ROOT_DIR, 'server/.env'));

function usage() {
  console.log(`
Speechmatics known-speaker CLI

Required env:
  SPEECHMATICS_API_KEY=<api-key>

Commands:
  configure --from-env [--region=us|eu]
    Save SPEECHMATICS_API_KEY from the current environment into .env and server/.env.

  enroll <audio-file> [--save-env] [--out=sample/speechmatics-my-voice.json]
    Generate a Speechmatics speaker identifier from a clean solo voice sample.

  identify <audio-file> [--speaker-id=<id>]
    Transcribe an audio file while tagging your enrolled voice as Me.

  status
    Show sanitized Speechmatics setup status.
`);
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];

  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const withoutPrefix = arg.slice(2);
      const eq = withoutPrefix.indexOf('=');
      if (eq === -1) flags[withoutPrefix] = true;
      else flags[withoutPrefix.slice(0, eq)] = withoutPrefix.slice(eq + 1);
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function normalizeRegion(region) {
  const value = String(region || process.env.SPEECHMATICS_REGION || 'us').toLowerCase();
  if (value === 'eu' || value === 'eu1') return 'eu';
  if (value === 'usa' || value === 'us' || value === 'us1') return 'us';
  return 'us';
}

function getRealtimeUrl(region = null) {
  if (process.env.SPEECHMATICS_RT_URL) {
    return process.env.SPEECHMATICS_RT_URL.replace(/\/+$/, '');
  }

  return normalizeRegion(region) === 'eu'
    ? 'wss://eu.rt.speechmatics.com/v2'
    : 'wss://us.rt.speechmatics.com/v2';
}

function getConfig(overrides = {}) {
  const region = normalizeRegion(overrides.region);
  const apiKey = overrides.apiKey || process.env.SPEECHMATICS_API_KEY || '';

  if (!apiKey) {
    throw new Error('Missing SPEECHMATICS_API_KEY. Run configure with the key in your shell env.');
  }

  return {
    apiKey,
    region,
    realtimeUrl: overrides.realtimeUrl || getRealtimeUrl(region),
    language: process.env.SPEECHMATICS_LANGUAGE || 'en',
    model: process.env.SPEECHMATICS_MODEL || 'enhanced',
  };
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function parseSpeakerIdentifiers(raw) {
  return String(raw || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function sanitizeSpeakers(speakers = []) {
  return speakers.map(speaker => ({
    label: speaker.label,
    identifierCount: (speaker.speaker_identifiers || []).length,
    identifierFingerprints: (speaker.speaker_identifiers || []).map(hashSecret),
  }));
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function setEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, line);
  const suffix = content.endsWith('\n') || content.length === 0 ? '' : '\n';
  return `${content}${suffix}${line}\n`;
}

function writeEnvValues(filePath, values) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') {
      content = setEnvValue(content, key, String(value));
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function saveRuntimeEnv(values) {
  writeEnvValues(path.join(ROOT_DIR, '.env'), values);
  writeEnvValues(path.join(ROOT_DIR, 'server/.env'), values);
}

function buildRecognitionMessage({ enroll = false, speakerIdentifiers = [] } = {}) {
  const speakerConfig = enroll
    ? {
        get_speakers: true,
        max_speakers: 2,
        prefer_current_speaker: true,
      }
    : {
        speakers: speakerIdentifiers.length
          ? [{ label: 'Me', speaker_identifiers: speakerIdentifiers }]
          : undefined,
        max_speakers: 4,
        prefer_current_speaker: true,
        speaker_sensitivity: 0.45,
      };

  if (!speakerConfig.speakers) delete speakerConfig.speakers;

  return {
    message: 'StartRecognition',
    audio_format: {
      type: 'file',
    },
    transcription_config: {
      language: process.env.SPEECHMATICS_LANGUAGE || 'en',
      model: process.env.SPEECHMATICS_MODEL || 'enhanced',
      max_delay: 0.8,
      diarization: 'speaker',
      speaker_diarization_config: speakerConfig,
    },
  };
}

function speakerFromResult(result) {
  const alt = result?.alternatives?.[0];
  if (!alt?.speaker) return 'UU';
  return String(alt.speaker).toLowerCase() === 'me' ? 'Me' : String(alt.speaker);
}

function summarizeTranscript(messages) {
  const speakerCounts = new Map();
  const lines = [];

  for (const message of messages) {
    if (message.message !== 'AddTranscript') continue;
    const text = (message.metadata?.transcript || '').trim();
    if (!text) continue;

    const counts = new Map();
    for (const result of message.results || []) {
      const speaker = speakerFromResult(result);
      if (speaker === 'UU') continue;
      counts.set(speaker, (counts.get(speaker) || 0) + 1);
      speakerCounts.set(speaker, (speakerCounts.get(speaker) || 0) + 1);
    }

    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    lines.push({ speaker: top ? top[0] : 'UU', text });
  }

  return {
    speakerCounts: Object.fromEntries(Array.from(speakerCounts.entries()).sort()),
    lines,
  };
}

function runFileSession(audioPath, { enroll = false, speakerIdentifiers = [] } = {}) {
  const config = getConfig();
  const absoluteAudioPath = path.resolve(audioPath);
  if (!fs.existsSync(absoluteAudioPath)) {
    throw new Error(`Audio file not found: ${absoluteAudioPath}`);
  }

  const audio = fs.readFileSync(absoluteAudioPath);
  const chunkSize = Number.parseInt(process.env.SPEECHMATICS_FILE_CHUNK_BYTES || '8192', 10);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(config.realtimeUrl, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'User-Agent': 'SyncScribe-Speechmatics-CLI/1.0',
      },
    });

    const messages = [];
    let sentChunks = 0;
    let lastAck = 0;
    let sentAllAudio = false;
    let sentEnd = false;
    let settled = false;
    let speakers = [];

    const cleanup = () => {
      try { ws.close(); } catch (_) {}
    };

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const sendJson = (payload) => ws.send(JSON.stringify(payload));

    const maybeEndStream = () => {
      if (!sentAllAudio || sentEnd) return;
      if (lastAck < sentChunks) return;

      sentEnd = true;
      sendJson({ message: 'EndOfStream', last_seq_no: sentChunks });
    };

    const sendAudio = () => {
      for (let offset = 0; offset < audio.length; offset += chunkSize) {
        ws.send(audio.subarray(offset, Math.min(offset + chunkSize, audio.length)));
        sentChunks += 1;
      }
      sentAllAudio = true;
      maybeEndStream();
      setTimeout(() => {
        if (!sentEnd && !settled) {
          sentEnd = true;
          sendJson({ message: 'EndOfStream', last_seq_no: sentChunks });
        }
      }, 3000);
    };

    ws.on('open', () => {
      sendJson(buildRecognitionMessage({ enroll, speakerIdentifiers }));
    });

    ws.on('message', (payload, isBinary) => {
      if (isBinary) return;

      let message;
      try {
        message = JSON.parse(payload.toString('utf8'));
      } catch (error) {
        return;
      }

      messages.push(message);

      if (message.message === 'RecognitionStarted') {
        sendAudio();
      } else if (message.message === 'AudioAdded') {
        lastAck = Math.max(lastAck, message.seq_no || 0);
        maybeEndStream();
      } else if (message.message === 'SpeakersResult') {
        speakers = message.speakers || [];
      } else if (message.message === 'EndOfTranscript') {
        setTimeout(() => settle(resolve, { speakers, messages, audioPath: absoluteAudioPath, config }), 1200);
      } else if (message.message === 'Error') {
        settle(reject, new Error(`Speechmatics error: ${message.type || ''} ${message.reason || ''}`.trim()));
      }
    });

    ws.on('error', error => settle(reject, error));
    ws.on('close', () => {
      if (settled) return;
      if (messages.some(message => message.message === 'AddTranscript')) {
        settle(resolve, { speakers, messages, audioPath: absoluteAudioPath, config });
      } else {
        settle(reject, new Error('Speechmatics connection closed before transcript was returned.'));
      }
    });
  });
}

async function configure(flags) {
  const apiKey = flags.key || process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) throw new Error('No key found. Run with SPEECHMATICS_API_KEY set, or pass --key=<key>.');

  const region = normalizeRegion(flags.region);
  saveRuntimeEnv({
    VOICE_IDENTITY_PROVIDER: 'speechmatics',
    SPEECHMATICS_API_KEY: apiKey,
    SPEECHMATICS_REGION: region,
    SPEECHMATICS_RT_URL: getRealtimeUrl(region),
    SPEECHMATICS_LANGUAGE: process.env.SPEECHMATICS_LANGUAGE || 'en',
    SPEECHMATICS_MODEL: process.env.SPEECHMATICS_MODEL || 'enhanced',
    SPEECHMATICS_MY_SPEAKER_LABEL: 'Me',
  });

  console.log(JSON.stringify({
    configured: true,
    provider: 'speechmatics',
    region,
    realtimeUrl: getRealtimeUrl(region),
    keyFingerprint: hashSecret(apiKey),
  }, null, 2));
}

async function enroll(audioPath, flags) {
  const result = await runFileSession(audioPath, { enroll: true });
  const speakers = result.speakers || [];
  const selected = speakers.find(speaker => (speaker.speaker_identifiers || []).length > 0);
  if (!selected) {
    throw new Error('No speaker identifier returned. Use a clearer 15-30 second solo voice sample and try again.');
  }

  const identifiers = selected.speaker_identifiers || [];
  const outPath = path.resolve(flags.out || path.join(ROOT_DIR, 'sample/speechmatics-my-voice.json'));
  ensureParentDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify({
    savedAt: new Date().toISOString(),
    sourceAudio: path.resolve(audioPath),
    region: result.config.region,
    realtimeUrl: result.config.realtimeUrl,
    selectedLabel: selected.label,
    selectedSpeaker: selected,
    speakers,
  }, null, 2), 'utf8');

  if (flags['save-env']) {
    saveRuntimeEnv({
      VOICE_IDENTITY_PROVIDER: 'speechmatics',
      SPEECHMATICS_MY_SPEAKER_ID: identifiers[0],
      SPEECHMATICS_MY_SPEAKER_IDS: identifiers.join(','),
      SPEECHMATICS_MY_SPEAKER_LABEL: 'Me',
    });
  }

  console.log(JSON.stringify({
    enrolled: true,
    savedTo: outPath,
    savedEnv: Boolean(flags['save-env']),
    selectedLabel: selected.label,
    selectedIdentifierCount: identifiers.length,
    selectedIdentifierFingerprints: identifiers.map(hashSecret),
    speakers: sanitizeSpeakers(speakers),
    transcript: summarizeTranscript(result.messages),
  }, null, 2));
}

async function identify(audioPath, flags) {
  const identifiers = parseSpeakerIdentifiers(
    flags['speaker-id'] || process.env.SPEECHMATICS_MY_SPEAKER_IDS || process.env.SPEECHMATICS_MY_SPEAKER_ID
  );
  if (identifiers.length === 0) {
    throw new Error('No speaker identifier configured. Run enroll <audio-file> --save-env first.');
  }

  const result = await runFileSession(audioPath, {
    enroll: false,
    speakerIdentifiers: identifiers,
  });

  console.log(JSON.stringify({
    identified: true,
    identifierCount: identifiers.length,
    identifierFingerprints: identifiers.map(hashSecret),
    transcript: summarizeTranscript(result.messages),
  }, null, 2));
}

function status() {
  const identifiers = parseSpeakerIdentifiers(process.env.SPEECHMATICS_MY_SPEAKER_IDS || process.env.SPEECHMATICS_MY_SPEAKER_ID);
  const apiKey = process.env.SPEECHMATICS_API_KEY || '';
  console.log(JSON.stringify({
    provider: process.env.VOICE_IDENTITY_PROVIDER || null,
    hasApiKey: Boolean(apiKey),
    keyFingerprint: apiKey ? hashSecret(apiKey) : null,
    region: normalizeRegion(),
    realtimeUrl: getRealtimeUrl(),
    identifierCount: identifiers.length,
    identifierFingerprints: identifiers.map(hashSecret),
  }, null, 2));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseArgs(rest);

  if (!command || command === 'help' || command === '--help') {
    usage();
    return;
  }

  if (command === 'configure') {
    await configure(flags);
  } else if (command === 'enroll') {
    if (!positional[0]) throw new Error('Usage: enroll <audio-file> [--save-env]');
    await enroll(positional[0], flags);
  } else if (command === 'identify') {
    if (!positional[0]) throw new Error('Usage: identify <audio-file> [--speaker-id=<id>]');
    await identify(positional[0], flags);
  } else if (command === 'status') {
    status();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
