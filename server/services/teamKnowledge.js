// Team Knowledge Base Service
// This service manages team-specific information, documentation, and context

class TeamKnowledgeBase {
  constructor() {
    // Hardcoded Engineering Chapters structure
    this.teamData = {
      organization: {
        name: "Engineering Chapters",
        mission: "Enabling collaboration and innovation across platforms",
        values: ["People First", "Collaboration", "Innovation", "Consistency"],
        structure: {
          engineering: {
            teams: ["Infrastructure", "Software", "Network"],
            techStack: {
              platforms: {
                "ServiceNow Greenfield": {
                  metrics: "99.9% uptime, 45% faster ticket resolution",
                  deployment: "Rolling updates every 2 weeks"
                },
                "Teams Voice/Rooms": {
                  adoption: "85% employee usage, 12,000 daily calls",
                  coverage: "250 meeting rooms equipped"
                },
                "DDI/Infoblox": {
                  performance: "3ms average DNS response time",
                  scale: "Managing 50,000+ IP addresses"
                },
                "GridGPT/Connect AI": {
                  accuracy: "95% correct responses",
                  usage: "2,000+ daily interactions"
                }
              },
              infrastructure: [
                "Windows 11/Intune/Jamf/AVD",
                "Entra/AD",
                "M365",
                "Public/Private Cloud",
                "Utah/Tier 1-3"
              ]
            },
            metrics: {
              "DORA": {
                "Deployment Frequency": "10 times per day",
                "Lead Time": "< 1 day",
                "MTTR": "< 30 minutes",
                "Change Failure Rate": "< 5%"
              },
              "Platform": {
                "Availability": "99.99%",
                "Response Time": "< 200ms",
                "Error Rate": "< 0.1%"
              }
            }
          },
          chapters: {
            teams: ["Chapter Leaders", "Platform Partners", "Skills Development"],
            tools: ["Skills Matrix", "Demand Intake", "Technical Debt Tracker"],
            metrics: {
              "Skills Coverage": "92%",
              "Platform Adoption": "88%",
              "Technical Debt Reduction": "35% YoY"
            }
          }
        }
      },
      
      // Team member profiles for better context
      teamMembers: new Map([
        ["john.doe", {
          name: "John Doe",
          role: "Senior Frontend Engineer",
          expertise: ["React", "TypeScript", "Performance Optimization"],
          projects: ["Dashboard Redesign", "Mobile App"],
          onboardingBuddy: true
        }],
        ["jane.smith", {
          name: "Jane Smith",
          role: "Engineering Manager",
          expertise: ["Team Leadership", "Architecture", "Mentoring"],
          teams: ["Frontend Team"],
          decisionMaker: true
        }]
      ]),
      
      // Common terms and acronyms
      glossary: {
        "API": "Application Programming Interface - our main REST API is at api.company.com",
        "CI/CD": "Continuous Integration/Continuous Deployment - we use GitHub Actions",
        "MVP": "Minimum Viable Product - our approach to launching features quickly",
        "SLA": "Service Level Agreement - 99.9% uptime guarantee",
        "OKR": "Objectives and Key Results - quarterly goal setting framework"
      },
      
      // Project context
      currentProjects: [
        {
          name: "Customer Dashboard v2",
          status: "In Progress",
          team: ["Frontend", "Backend", "UX"],
          keyObjectives: ["Improve performance by 50%", "Add real-time updates", "Mobile responsive"],
          techDecisions: ["React 18", "GraphQL", "WebSockets for real-time"]
        }
      ],
      
      // Onboarding information
      onboarding: {
        week1: [
          "Setup development environment",
          "Access to all required tools",
          "Meet team members",
          "Review architecture documentation"
        ],
        week2: [
          "First code contribution",
          "Understand deployment process",
          "Attend sprint planning",
          "Shadow senior developers"
        ],
        resources: [
          "Engineering Wiki: wiki.company.com",
          "Architecture Docs: docs.company.com/architecture",
          "Coding Standards: docs.company.com/standards"
        ]
      },
      
      // Common meeting patterns
      meetingPatterns: {
        standup: {
          format: ["What did you do yesterday?", "What will you do today?", "Any blockers?"],
          duration: "15 minutes",
          participants: "Development team"
        },
        planning: {
          format: ["Review backlog", "Estimate stories", "Commit to sprint goals"],
          duration: "2 hours",
          participants: "Product, Engineering, Design"
        },
        retrospective: {
          format: ["What went well?", "What could improve?", "Action items"],
          duration: "1 hour",
          participants: "Entire team"
        }
      }
    };
    
    // Context accumulator for meeting analysis
    this.meetingContext = {
      participants: new Set(),
      topics: new Set(),
      decisions: [],
      actionItems: [],
      questions: [],
      technicalTerms: new Set()
    };
  }
  
  // Load custom team data from file or database
  async loadTeamData(filePath) {
    try {
      const fs = require('fs').promises;
      const data = await fs.readFile(filePath, 'utf8');
      const customData = JSON.parse(data);
      
      // Merge custom data with defaults
      const merged = {
        ...this.teamData,
        ...customData
      };

      // Normalize teamMembers to a Map (the rest of code expects a Map)
      if (merged.teamMembers && !(merged.teamMembers instanceof Map)) {
        const entries = Array.isArray(merged.teamMembers)
          ? merged.teamMembers.map((m, idx) => [String(idx), m])
          : Object.entries(merged.teamMembers);
        merged.teamMembers = new Map(entries);
      }

      // Ensure nested collections exist
      merged.currentProjects = merged.currentProjects || [];
      merged.glossary = merged.glossary || {};
      merged.organization = merged.organization || this.teamData.organization;
      merged.meetingPatterns = merged.meetingPatterns || this.teamData.meetingPatterns;

      this.teamData = merged;
      
      console.log('Team knowledge base loaded successfully');
    } catch (error) {
      console.warn('Using default team data:', error.message);
    }
  }
  
  // Get context for a specific topic
  getTopicContext(topic) {
    const lowercaseTopic = topic.toLowerCase();
    let context = [];
    
    // Search in glossary
    for (const [term, definition] of Object.entries(this.teamData.glossary)) {
      if (lowercaseTopic.includes(term.toLowerCase())) {
        context.push(`${term}: ${definition}`);
      }
    }
    
    // Search in current projects
    this.teamData.currentProjects.forEach(project => {
      if (lowercaseTopic.includes(project.name.toLowerCase())) {
        context.push(`Project "${project.name}" - Status: ${project.status}, Teams: ${project.team.join(', ')}`);
      }
    });
    
    // Search for team members
    for (const [email, member] of this.teamData.teamMembers) {
      if (lowercaseTopic.includes(member.name.toLowerCase()) || 
          lowercaseTopic.includes(member.role.toLowerCase())) {
        context.push(`${member.name} (${member.role}) - Expertise: ${member.expertise.join(', ')}`);
      }
    }
    
    return context;
  }
  
  // Identify meeting type from context
  identifyMeetingType(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    if (lowerTranscript.includes('yesterday') && lowerTranscript.includes('today') && 
        lowerTranscript.includes('blocker')) {
      return 'standup';
    } else if (lowerTranscript.includes('sprint') && lowerTranscript.includes('planning')) {
      return 'planning';
    } else if (lowerTranscript.includes('retrospective') || lowerTranscript.includes('retro')) {
      return 'retrospective';
    } else if (lowerTranscript.includes('onboarding') || lowerTranscript.includes('new hire')) {
      return 'onboarding';
    } else if (lowerTranscript.includes('architecture') || lowerTranscript.includes('technical design')) {
      return 'technical';
    }
    
    return 'general';
  }
  
  // Extract entities from transcript
  extractEntities(transcript) {
    const entities = {
      people: new Set(),
      projects: new Set(),
      technologies: new Set(),
      dates: new Set(),
      actionItems: []
    };
    
    // Extract team members
    for (const [_, member] of this.teamData.teamMembers) {
      if (transcript.includes(member.name)) {
        entities.people.add(member.name);
      }
    }
    
    // Extract projects
    this.teamData.currentProjects.forEach(project => {
      if (transcript.toLowerCase().includes(project.name.toLowerCase())) {
        entities.projects.add(project.name);
      }
    });
    
    // Extract technologies
    const techKeywords = [];
    
    // Safely extract platform keywords
    try {
      if (this.teamData?.organization?.structure?.engineering?.techStack?.platforms) {
        techKeywords.push(...Object.keys(this.teamData.organization.structure.engineering.techStack.platforms));
      }
      if (this.teamData?.organization?.structure?.engineering?.techStack?.infrastructure) {
        techKeywords.push(...this.teamData.organization.structure.engineering.techStack.infrastructure);
      }
    } catch (error) {
      console.warn('Error extracting tech keywords:', error);
    }
    
    // Add default technical terms
    techKeywords.push(
      'API', 'database', 'frontend', 'backend', 'deployment', 'testing',
      'ServiceNow', 'Teams Voice', 'GridGPT', 'Infoblox'
    );
    
    techKeywords.forEach(tech => {
      // Handle compound terms (e.g., "Teams Voice")
      const techParts = tech.toLowerCase().split(/[\/\s]+/);
      const transcriptLower = transcript.toLowerCase();
      
      if (techParts.every(part => transcriptLower.includes(part))) {
        entities.technologies.add(tech);
      }
    });
    
    // Extract action items (simple pattern matching)
    const actionPatterns = [
      /(?:need to|should|will|going to|must|have to)\s+([^.]+)/gi,
      /(?:action item:|todo:|task:)\s*([^.]+)/gi,
      /(?:follow up on|check on|investigate)\s+([^.]+)/gi
    ];
    
    actionPatterns.forEach(pattern => {
      const matches = transcript.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 5 && match[1].length < 100) {
          entities.actionItems.push(match[1].trim());
        }
      }
    });
    
    return entities;
  }
  
  // Generate onboarding context for new team members
  getOnboardingContext(week = 1) {
    const weekKey = `week${week}`;
    const tasks = this.teamData.onboarding[weekKey] || [];
    const resources = this.teamData.onboarding.resources;
    
    return {
      currentWeek: week,
      tasks: tasks,
      resources: resources,
      buddies: Array.from(this.teamData.teamMembers.values())
        .filter(member => member.onboardingBuddy)
        .map(member => `${member.name} (${member.role})`)
    };
  }
  
  // Build context-aware prompt for AI analysis
  buildContextPrompt(transcript, meetingType = null) {
    const detectedType = meetingType || this.identifyMeetingType(transcript);
    const entities = this.extractEntities(transcript);
    const relevantContext = [];
    
    // Add meeting-specific context
    if (this.teamData.meetingPatterns[detectedType]) {
      const pattern = this.teamData.meetingPatterns[detectedType];
      relevantContext.push(`This appears to be a ${detectedType} meeting.`);
      relevantContext.push(`Expected format: ${pattern.format.join(', ')}`);
    }
    
    // Add people context
    if (entities.people.size > 0) {
      relevantContext.push(`Participants mentioned: ${Array.from(entities.people).join(', ')}`);
    }
    
    // Add project context
    if (entities.projects.size > 0) {
      entities.projects.forEach(projectName => {
        const project = this.teamData.currentProjects.find(p => p.name === projectName);
        if (project) {
          relevantContext.push(`Project context - ${project.name}: ${project.keyObjectives.join(', ')}`);
        }
      });
    }
    
    // Add technology context
    if (entities.technologies.size > 0) {
      relevantContext.push(`Technologies discussed: ${Array.from(entities.technologies).join(', ')}`);
    }
    
    return {
      meetingType: detectedType,
      context: relevantContext.join('\n'),
      entities: entities,
      isOnboarding: detectedType === 'onboarding'
    };
  }
}

// Create singleton instance
const teamKnowledge = new TeamKnowledgeBase();

module.exports = {
  TeamKnowledgeBase,
  teamKnowledge
}; 