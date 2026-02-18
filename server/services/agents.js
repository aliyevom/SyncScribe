const basePrompt = require('./basePrompt');
const { teamKnowledge } = require('./teamKnowledge');
const { knowledgeLoader } = require('./knowledgeLoader');

async function composePrompt(agentTask, meetingMeta = {}, teamData = {}) {
  const teamContext = teamData ? teamKnowledge.buildContextPrompt('', null, teamData).context : '';
  const tagContext = meetingMeta?.tags?.length ? `Tags: ${meetingMeta.tags.join(', ')}` : '';
  const knowledgeContext = await knowledgeLoader.getPromptContext();
  
  return `${basePrompt}
${knowledgeContext}

Context:
${teamContext}

Meeting:
Title: ${meetingMeta?.title || 'Untitled'}
Date: ${meetingMeta?.date || new Date().toISOString()}
${tagContext}

Agent task:
${agentTask}
`;
}

const AGENTS = {
  MEETING_ANALYST: {
    name: 'MEETING_ANALYST',
    description: 'Analyzes conversations for actionable insights, decisions, and team context',
    capabilities: ['Action items', 'Key decisions', 'Team dynamics', 'Meeting summaries'],
    async system(agentInput) {
      return composePrompt(
        `You analyze technical team meetings. Focus on:
        - Extracting clear decisions and action items with owners
        - Identifying team dynamics and collaboration points
        - Summarizing key technical discussions
        - Highlighting DORA metrics and platform performance
        Keep responses in clear paragraphs without bullets or lists.`,
        agentInput.meetingMeta,
        agentInput.teamData
      );
    }
  },

  TECHNICAL_ARCHITECT: {
    name: 'TECHNICAL_ARCHITECT',
    description: 'Focuses on technical decisions, architecture, and proven practices',
    capabilities: ['Architecture review', 'Tech recommendations', 'Risk assessment', 'Best practices'],
    async system(agentInput) {
      return composePrompt(
        `You analyze technical discussions for Engineering Chapters. Focus on:
        - Platform architecture decisions (ServiceNow, Teams Voice, GridGPT)
        - Security and reliability implications
        - Performance metrics and DORA standards
        - Cost and operational impacts
        Write in clear paragraphs using technical terms from our knowledge base.`,
        agentInput.meetingMeta,
        agentInput.teamData
      );
    }
  },

  ACTION_TRACKER: {
    name: 'ACTION_TRACKER',
    description: 'Tracks action items, decisions, and commitments',
    capabilities: ['Action items', 'Decision tracking', 'Blockers', 'Commitments'],
    async system(agentInput) {
      return composePrompt(
        `You track actions and decisions for Engineering Chapters. Focus on:
        - Clearly stating action items with owners
        - Capturing technical decisions and rationale
        - Identifying blockers and dependencies
        - Setting clear timelines and commitments
        Present information in clear paragraphs with specific dates and owners.`,
        agentInput.meetingMeta,
        agentInput.teamData
      );
    }
  }
};

function selectAgentByTags(tags = []) {
  const t = tags.map(s => s.toLowerCase());
  if (t.includes('architecture') || t.includes('design')) return 'TECHNICAL_ARCHITECT';
  if (t.includes('actions') || t.includes('decisions')) return 'ACTION_TRACKER';
  return 'MEETING_ANALYST';
}

module.exports = {
  AGENTS,
  selectAgentByTags,
  composePrompt
};