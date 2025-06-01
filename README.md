# SyncScribe - Advanced Meeting Transcriber

A real-time meeting transcription application with advanced AI analysis capabilities, specialized agents, and team knowledge integration. This application provides live transcription of meetings with context-aware AI analysis tailored to your organization.

## 🚀 Key Features

### Core Features
- Real-time speech-to-text transcription (Google Cloud & OpenAI Whisper)
- Screen sharing with audio capture
- Speaker detection and diarization
- Export transcriptions in multiple formats

### 🤖 Advanced AI Analysis
- **4 Specialized AI Agents**:
  - **Meeting Analyst**: General meetings, action items, decisions
  - **Onboarding Assistant**: Training sessions, new employee support
  - **Technical Architect**: Architecture reviews, technical discussions
  - **Action Tracker**: Sprint planning, task management
- **Team Knowledge Integration**: Understands your team structure, projects, and terminology
- **Context-Aware Analysis**: Adapts to your organization's specific needs
- **Enhanced Accuracy**: Improved Whisper configuration for technical discussions

### 🏷️ Smart Tagging System
- **Priority Tags**: Critical, High, Medium, Low with visual indicators
- **Type Tags**: Decision, Action, Blocker, Idea, Question
- **Department Tags**: Engineering, Product, Design, Business
- **Auto-Tagging**: Automatic detection based on keywords
- **Custom Tags**: Add your own tags via API

### 📊 Meeting Intelligence
- Automatic meeting type detection
- Real-time participant identification
- Project and technology tracking
- Action item extraction with assignee suggestions
- Decision tracking with rationale

## 🛠️ Tech Stack

- **Frontend:**
  - React.js with modern hooks
  - Tailwind CSS + shadcn/ui components
  - WebSocket for real-time communication
  - WebRTC for audio/video handling
  
- **Backend:**
  - Node.js + Express.js
  - Socket.IO for real-time events
  - OpenAI GPT-4 for intelligent analysis
  - **Speech Services**:
    - Google Cloud Speech-to-Text (streaming)
    - OpenAI Whisper (high accuracy)
  - **Team Knowledge Base**: JSON-based organization data
  - **Tag Service**: Meeting classification and context

## 📚 Documentation

- **[Quick Start Guide](QUICK_START.md)**: Get up and running in minutes
- **[AI Analysis Guide](AI_ANALYSIS_GUIDE.md)**: Complete guide to AI features, agent selection, and team configuration
- **[Team Data Setup](server/team-data-example.json)**: Example configuration for your organization

## 🚀 Quick Start

### Using Make (Recommended)

```bash
# Full setup - installs dependencies and configures environment
make setup

# Start both server and client in split terminals
make start

# Create meeting tags configuration
make tag-meeting
```

### Using Setup Script

```bash
# Make executable (first time only)
chmod +x setup.sh

# Run setup
./setup.sh

# Quick start (skip install)
./setup.sh --skip-install --clean
```

### Manual Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd meeting-transcriber
   ```

2. **Set up environment variables**:
   ```bash
   # Server environment
   cd server
   cp .env.example .env
   # Add your OpenAI API key and Google Cloud credentials
   ```

3. **Configure your team data**:
   ```bash
   cp team-data-example.json team-data.json
   # Edit team-data.json with your organization's information
   ```

4. **Install dependencies**:
   ```bash
   # Using make
   make install
   
   # Or manually
   cd server && npm install
   cd ../client && npm install
   ```

5. **Start the application**:
   ```bash
   # Using make
   make start
   
   # Or manually in two terminals
   cd server && node index.js
   cd client && npm start
   ```

6. **Access the application**:
   - Open http://localhost:3000
   - Select your preferred speech provider
   - Choose an AI agent based on your meeting type
   - Start transcribing!

## 🔧 Configuration

### Speech Providers
- **Google Cloud**: Best for real-time streaming, speaker detection
- **OpenAI Whisper**: Best for accuracy, technical terms, accents

### AI Agents
Select the appropriate agent in Settings based on your meeting:
- General meetings → Meeting Analyst
- Training/Onboarding → Onboarding Assistant
- Technical reviews → Technical Architect
- Planning sessions → Action Tracker

### Team Knowledge Base
Customize `team-data.json` with:
- Team member profiles and expertise
- Current projects and objectives
- Company glossary and terminology
- Meeting patterns and formats

### Meeting Tags
Use tags during meetings:
- Say `"This is hashtag priority critical"` to tag as critical
- Auto-detection for keywords like "urgent", "blocked", "decision"
- View all tags with `make analyze-tags`

## 📋 Available Commands

```bash
make help          # Show all available commands
make setup         # Full setup
make start         # Start application
make stop          # Stop all processes
make clean         # Clean and reset
make dev           # Development mode
make build         # Build for production
make tag-meeting   # Create tag configuration
make update-team   # Update team data
make analyze-tags  # View tag analytics
```

## 🔒 Security & Privacy

- Real-time processing only (no permanent storage)
- All data transmitted over secure WebSocket connections
- Team data stays on your server
- API keys never exposed to client

## 📈 Performance Tips

1. **For best transcription**:
   - Use a good quality microphone
   - Minimize background noise
   - Speak clearly and avoid overlapping

2. **For best AI analysis**:
   - Keep team data updated
   - Use consistent terminology
   - Select appropriate AI agent
   - Use tags to provide context

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

This project is licensed under the MIT License.

---

**Note**: This application requires valid API keys for OpenAI and Google Cloud services. Ensure you have the necessary credentials before running the application.

