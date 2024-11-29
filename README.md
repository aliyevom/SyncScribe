# Meeting Transcriber

A real-time meeting transcription application with AI analysis capabilities. This application provides live transcription of meetings, with features for AI-powered analysis, summary generation, and collaborative note-taking.

## Features

- Real-time speech-to-text transcription
- AI-powered meeting analysis
- Meeting summaries and key points extraction
- Collaborative note-taking
- Secure meeting rooms
- Export transcriptions in multiple formats

## Tech Stack

- **Frontend:**
  - React.js
  - WebSocket for real-time communication
  - CSS Modules for styling
  
- **Backend:**
  - Node.js
  - Express.js
  - Socket.IO
  - OpenAI API for AI analysis
  - **GCP AI Services**:  
    - **Google Cloud Speech-to-Text**  
    - **Google Cloud Natural Language API**  
    - **Cloud Translation API** for multilingual meetings  
    - **Cloud Text-to-Speech** for generating audio summaries  
  - **Google Cloud Storage** for secure transcript storage  

- **DevOps:**
  - Hosted on **Google Kubernetes Engine (GKE)** for scalability
  - **Cloud Functions** for serverless event handling
  - **Cloud Monitoring** for performance metrics

