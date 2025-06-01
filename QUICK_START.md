# SyncScribe Quick Start Guide

## 🚀 Getting Started

### 1. Quick Setup with Makefile

```bash
# First time setup - installs dependencies and configures environment
make setup

# Start both server and client in split terminals
make start

# Or start individually
make start-server  # In terminal 1
make start-client  # In terminal 2
```

### 2. Using the Setup Script

```bash
# Make the script executable (first time only)
chmod +x setup.sh

# Run full setup
./setup.sh

# Skip dependency installation (faster startup)
./setup.sh --skip-install

# Clean ports before starting
./setup.sh --clean
```

## 🏷️ Using Meeting Tags

### Creating Tags Configuration

```bash
# Create default meeting tags
make tag-meeting

# View available tags
make analyze-tags
```

### Tag Syntax in Meetings

During transcription, you can use tags in your speech:

- `"This is a #priority:critical issue"`
- `"We need a #type:decision on the architecture"`
- `"This is #type:blocker for the release"`
- `"Let's discuss this with #department:engineering"`

### Automatic Tag Detection

The system automatically detects and applies tags based on keywords:
- "urgent", "emergency" → `#priority:critical`
- "decide", "decision" → `#type:decision`
- "blocked", "stuck" → `#type:blocker`
- "action item", "todo" → `#type:action`

## 🤖 AI Agent Selection

### Available Agents

1. **Meeting Analyst** (Default)
   - Best for: General meetings, status updates
   - Focus: Action items, decisions, team dynamics

2. **Onboarding Assistant**
   - Best for: Training new team members
   - Focus: Explanations, context, learning resources

3. **Technical Architect**
   - Best for: Design reviews, technical discussions
   - Focus: Architecture, best practices, performance

4. **Action Tracker**
   - Best for: Sprint planning, task management
   - Focus: Action items, deadlines, assignments

### Switching Agents

Click the Settings icon (⚙️) → AI Agent tab → Select your agent

## 📊 Team Data Customization

### Update Team Information

```bash
# Create/update team data from example
make update-team

# Edit the file
nano server/team-data.json
```

### Key Sections to Customize

1. **Team Members**
   ```json
   "teamMembers": {
     "email@company.com": {
       "name": "Full Name",
       "role": "Job Title",
       "expertise": ["Skills", "Technologies"],
       "projects": ["Current Projects"]
     }
   }
   ```

2. **Current Projects**
   ```json
   "currentProjects": [{
     "name": "Project Name",
     "status": "In Progress",
     "team": ["Frontend", "Backend"],
     "lead": "Team Lead Name"
   }]
   ```

3. **Company Glossary**
   ```json
   "glossary": {
     "TERM": "Definition and context for your team"
   }
   ```

## 🛠️ Development Commands

```bash
# Install dependencies
make install

# Run in development mode (with hot reload)
make dev

# Build for production
make build

# Stop all processes
make stop

# Clean and reset
make clean

# Format code
make format

# Run linters
make lint
```

## 💡 Pro Tips

1. **Better Transcription Accuracy**
   - Use OpenAI Whisper for technical discussions
   - Speak clearly with minimal background noise
   - Avoid multiple people talking simultaneously

2. **Effective Tagging**
   - Say tags clearly: "hashtag priority critical"
   - Use consistent tag names
   - Review and update auto-tag rules regularly

3. **AI Analysis Optimization**
   - Wait 20-30 seconds for context accumulation
   - Use the right agent for your meeting type
   - Keep team data updated

4. **Meeting Best Practices**
   - Start with meeting type: "This is our sprint planning"
   - Mention participants by name
   - State decisions clearly
   - Summarize action items at the end

## 🔧 Troubleshooting

### Port Already in Use
```bash
make stop  # or
lsof -ti:3000 | xargs kill -9
lsof -ti:5002 | xargs kill -9
```

### Missing Dependencies
```bash
make clean
make install
```

### AI Not Recognizing Team Members
- Check `server/team-data.json` has correct names
- Ensure names match how they're spoken
- Restart server after updating team data

## 📝 Example Meeting Flow

1. **Start the meeting**
   - "This is our weekly engineering standup"
   - System detects meeting type

2. **Discuss with tags**
   - "John has a #priority:high update on the API"
   - "We have a #type:blocker with deployment"
   - "Sarah will take this as an #type:action item"

3. **AI provides analysis**
   - Identifies John as Backend Engineer
   - Highlights the blocker
   - Assigns action item to Sarah with context

4. **Export results**
   - Transcript with speaker labels
   - AI analysis with tags
   - Action items with owners

---

**Need Help?** Check the full [AI Analysis Guide](AI_ANALYSIS_GUIDE.md) for detailed documentation. 