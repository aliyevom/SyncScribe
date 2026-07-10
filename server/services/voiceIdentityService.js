const fs = require('fs');
const path = require('path');

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function resolvePath(value) {
  if (!value) return null;
  if (path.isAbsolute(value)) return value;

  const candidates = [
    path.resolve(__dirname, '..', value),
    path.resolve(__dirname, '..', '..', value),
    path.resolve(process.cwd(), value),
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

function normalizeRegion(region) {
  const value = String(region || 'us').toLowerCase();
  if (value === 'eu' || value === 'eu1') return 'eu';
  return 'us';
}

class VoiceIdentityService {
  constructor() {
    this.lastError = null;
  }

  getConfig() {
    const provider = (process.env.VOICE_IDENTITY_PROVIDER || 'speechmatics').toLowerCase();
    const region = normalizeRegion(process.env.SPEECHMATICS_REGION);
    const realtimeUrl = process.env.SPEECHMATICS_RT_URL ||
      (region === 'eu' ? 'wss://eu.rt.speechmatics.com/v2' : 'wss://us.rt.speechmatics.com/v2');
    const speakerIds = parseCsv(process.env.SPEECHMATICS_MY_SPEAKER_IDS || process.env.SPEECHMATICS_MY_SPEAKER_ID);
    const enrollmentSample = resolvePath(process.env.MY_VOICE_ENROLLMENT_WAV || 'sample/my-voice-enrollment.wav');

    return {
      provider,
      enrollmentSample,
      sampleExists: Boolean(enrollmentSample && fs.existsSync(enrollmentSample)),
      speechmatics: {
        region,
        realtimeUrl,
        hasKey: Boolean(process.env.SPEECHMATICS_API_KEY),
        speakerIdentifierCount: speakerIds.length,
        speakerLabel: process.env.SPEECHMATICS_MY_SPEAKER_LABEL || 'Me',
      },
    };
  }

  getHealthStatus() {
    const config = this.getConfig();
    const configured = config.provider === 'speechmatics' &&
      config.speechmatics.hasKey &&
      config.speechmatics.speakerIdentifierCount > 0;

    return {
      provider: config.provider,
      configured,
      readyForIdentification: configured,
      readyForEnrollment: config.provider === 'speechmatics' &&
        config.speechmatics.hasKey &&
        config.sampleExists,
      enrollmentSample: config.enrollmentSample,
      sampleExists: config.sampleExists,
      speechmatics: config.speechmatics,
      lastError: this.lastError,
    };
  }
}

module.exports = new VoiceIdentityService();
