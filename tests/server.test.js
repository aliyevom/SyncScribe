const fs = require('fs');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');
const wav = require('wav');

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    createReadStream: jest.fn(() => ({
        on: jest.fn((event, callback) => {
            if (event === 'error') {
                callback(new Error('Mock ReadStream Error'));
            }
        })
    }))
}));


jest.mock('@google-cloud/speech', () => {
  return {
    SpeechClient: jest.fn().mockImplementation(() => ({
      streamingRecognize: jest.fn(() => ({
        on: jest.fn().mockReturnThis()
      }))
    }))
  };
});

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: jest.fn().mockResolvedValue({ text: 'Test transcription text' })
      }
    }
  }));
});

const speechServices = require('../server/services/speechServices');

// Mock console.error to avoid cluttering the test output
console.error = jest.fn();

describe('speechServices', () => {
  describe('convertToWav', () => {
    it('should convert audio buffer to WAV format', async () => {
      const mockAudioBuffer = Buffer.from('mock audio data');
      const wavBuffer = await speechServices.convertToWav(mockAudioBuffer);
      expect(wavBuffer).toBeInstanceOf(Buffer);
      expect(wavBuffer.length).toBeGreaterThan(0);
    });
  });

  describe('createGoogleStream', () => {
    it('should create a Google Speech stream', () => {
      const mockSocket = {
        emit: jest.fn()
      };
      const mockRoomId = 'room123';
      const recognizeStream = speechServices.createGoogleStream(mockSocket, mockRoomId);
      expect(recognizeStream).toBeDefined();
    });
  });

  describe('processWithOpenAI', () => {
    it('should process audio buffer with OpenAI and return transcription', async () => {
      const mockAudioBuffer = Buffer.from('mock audio data');
      const transcription = await speechServices.processWithOpenAI(mockAudioBuffer);

      expect(transcription).toEqual({
        text: 'Test transcription text',
        isFinal: true,
        service: 'openai',
        timestamp: expect.any(String)
      });
    });

    it('should throw an error if OpenAI processing fails', async () => {
      const mockAudioBuffer = Buffer.from('mock audio data');

      // Mock OpenAI to throw an error
      speechServices.openai.audio.transcriptions.create.mockRejectedValueOnce(
        new Error('OpenAI error')
      );

      await expect(speechServices.processWithOpenAI(mockAudioBuffer)).rejects.toThrow(
        'OpenAI error'
      );
    });
  });
});
