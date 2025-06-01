# Speech-to-Text Setup Guide

## Prerequisites

### 1. Google Cloud Speech-to-Text
- Enable the Speech-to-Text API in Google Cloud Console
- Create a service account and download the JSON key
- Place the key file as `server/key.json`

### 2. OpenAI API (for Whisper)
- Get your API key from https://platform.openai.com/api-keys
- Create `server/.env` file:
```
OPENAI_API_KEY=your-openai-api-key-here
```

## Improving Transcription Accuracy

### Best Practices:

1. **Audio Quality**
   - Use a good quality microphone
   - Minimize background noise
   - Speak clearly and at a moderate pace
   - Maintain consistent volume

2. **For Google Speech-to-Text**
   - The system is configured with:
     - Enhanced model for better accuracy
     - Speaker diarization (identifies different speakers)
     - Automatic punctuation
     - Speech context for business terms

3. **For OpenAI Whisper**
   - Processes audio in 2-second chunks
   - Better for longer pauses and varied accents
   - More robust to background noise

4. **Troubleshooting**
   - If you see repeated text: This is being fixed by duplicate detection
   - If you see mixed languages: Ensure you're speaking primarily in English
   - For connection errors: Check your API keys and internet connection

## Testing Your Setup

1. Start the server:
   ```bash
   cd server
   npm install
   node index.js
   ```

2. Start the client:
   ```bash
   cd client
   npm install
   npm start
   ```

3. Select your preferred provider (Google or OpenAI)
4. Allow screen share with audio when prompted
5. Start speaking clearly and watch the transcription

## Accuracy Tips

- **Google**: Best for real-time transcription, meetings, and conversations
- **OpenAI**: Best for accuracy with varied accents and background noise
- Both services work best with:
  - Clear speech
  - Minimal background noise
  - Good internet connection
  - Proper microphone setup 