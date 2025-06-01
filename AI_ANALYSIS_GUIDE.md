# Enhanced AI Analysis System Guide

## Overview

The SyncScribe meeting transcriber now features an advanced AI analysis system with specialized agents, team knowledge integration, and improved transcription accuracy. This guide explains how to configure and use these new features effectively.

## Key Improvements

### 1. Specialized AI Agents

The system now includes four specialized AI agents, each optimized for different meeting scenarios:

#### **Meeting Analyst** (Default)
- **Best for**: General team meetings, project discussions, status updates
- **Features**: 
  - Extracts action items with suggested assignees
  - Identifies key decisions and decision makers
  - Analyzes team dynamics and collaboration patterns
  - Provides meeting summaries with context

#### **Onboarding Assistant**
- **Best for**: New employee onboarding, training sessions
- **Features**:
  - Explains company-specific terminology
  - Identifies team members and their roles
  - Highlights important information for newcomers
  - Suggests relevant documentation and resources

#### **Technical Architect**
- **Best for**: Architecture reviews, technical discussions, design meetings
- **Features**:
  - Analyzes technical decisions and implications
  - Identifies optimization opportunities
  - Suggests best practices and design patterns
  - Highlights security and performance considerations

#### **Action Tracker**
- **Best for**: Planning sessions, sprint planning, retrospectives
- **Features**:
  - Extracts clear action items with owners and deadlines
  - Tracks decisions and their rationale
  - Identifies blockers and dependencies
  - Notes commitments and promises made

### 2. Team Knowledge Base Integration

The AI now understands your organization's context:

- **Team Members**: Names, roles, expertise, and responsibilities
- **Projects**: Current initiatives, objectives, and milestones
- **Technology Stack**: Tools, frameworks, and architectural decisions
- **Company Glossary**: Internal terminology and acronyms
- **Meeting Patterns**: Standard formats and expectations

### 3. Enhanced Transcription Accuracy

#### **Improved Whisper Configuration**
- Better handling of technical terms and jargon
- Enhanced speaker diarization
- Reduced hallucinations for technical discussions
- Better accent and dialect support

#### **Hybrid Processing**
- Combines streaming and batch processing for optimal accuracy
- Intelligent noise reduction and filtering
- Context-aware transcription improvements

## Setup Guide

### 1. Configure Your Team Data

1. Copy the example team data file:
   ```bash
   cp server/team-data-example.json server/team-data.json
   ```

2. Edit `server/team-data.json` with your organization's information:
   - Update company name and mission
   - Add team members with their roles and expertise
   - Define current projects and initiatives
   - Add your company's glossary terms
   - Configure meeting patterns

### 2. Environment Configuration

Update your `.env` file with enhanced settings:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_api_key_here

# Model Selection (for better quality)
AI_MODEL=gpt-4-turbo-preview

# Fallback model (for rate limits)
FALLBACK_MODEL=gpt-3.5-turbo-1106
```

### 3. Start the Application

```bash
# Start the server
cd server
npm start

# Start the client (in another terminal)
cd client
npm start
```

## Using the Enhanced Features

### 1. Selecting an AI Agent

1. Click the Settings icon (⚙️) in the top right
2. Navigate to the "AI Agent" tab
3. Select the agent that best matches your meeting type
4. The agent will automatically adapt its analysis style

### 2. Viewing Team Context

1. In Settings, go to the "Team Context" tab
2. View real-time meeting context:
   - Identified participants
   - Technologies being discussed
   - Projects mentioned
   - Recent action items

### 3. Best Practices

#### For Accurate Transcription:
- Use OpenAI Whisper for better accuracy with technical terms
- Ensure good audio quality (minimize background noise)
- Speak clearly and avoid talking over each other

#### For Better AI Analysis:
- Let the AI accumulate 20-30 seconds of context before expecting analysis
- Use the appropriate agent for your meeting type
- Keep your team data file updated with new members and projects

## Advanced Configuration

### Custom Team Data Structure

The `team-data.json` file supports extensive customization:

```json
{
  "organization": {
    "customFields": {
      "department": "Engineering",
      "officeLocation": "San Francisco",
      "slackWorkspace": "company.slack.com"
    }
  },
  "integrations": {
    "jira": {
      "baseUrl": "https://company.atlassian.net",
      "projectKeys": ["ENG", "PROD", "QA"]
    }
  }
}
```

### Meeting Type Detection

The system automatically detects meeting types based on keywords:
- "standup", "daily" → Standup meeting
- "retro", "retrospective" → Retrospective
- "planning", "sprint" → Planning session
- "1:1", "one-on-one" → Personal meeting
- "architecture", "design" → Technical review

### API Integration

You can integrate with external systems:

```javascript
// Example: Send action items to task management system
socket.on('ai_response', (response) => {
  if (response.roomContext?.actionItems) {
    // Send to your task management API
    sendToTaskManager(response.roomContext.actionItems);
  }
});
```

## Troubleshooting

### Common Issues

1. **AI responses are generic**
   - Update your team data file with more specific information
   - Ensure you're using the appropriate AI agent
   - Check that GPT-4 is configured (not just GPT-3.5)

2. **Transcription missing technical terms**
   - Switch to OpenAI Whisper service
   - Add technical terms to your glossary
   - Ensure good audio quality

3. **Agent not recognizing team members**
   - Verify team members are properly configured in team-data.json
   - Check that names match how they're spoken in meetings
   - Add nicknames or variations as needed

### Performance Optimization

1. **Reduce latency**:
   - Use a closer server region
   - Optimize audio chunk size (default: 2 seconds)
   - Consider using the fallback model for faster responses

2. **Improve accuracy**:
   - Maintain updated team knowledge base
   - Use consistent terminology
   - Provide clear meeting agendas

## Security Considerations

1. **Data Privacy**:
   - All transcriptions are processed in real-time
   - No meeting data is stored permanently
   - Team data remains on your server

2. **Access Control**:
   - Implement authentication if needed
   - Use HTTPS in production
   - Rotate API keys regularly

## Future Enhancements

Planned features include:
- Integration with calendar systems
- Automatic meeting notes generation
- Email summaries post-meeting
- Multi-language support
- Custom AI agent creation

## Support

For issues or feature requests:
1. Check the troubleshooting section above
2. Review server logs for errors
3. Ensure all dependencies are up to date

---

*Note: This system is designed to enhance meeting productivity while respecting privacy and maintaining security. Always ensure you have consent from all participants before recording and transcribing meetings.* 