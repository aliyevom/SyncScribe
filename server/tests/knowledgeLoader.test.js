const { KnowledgeLoader } = require('../services/knowledgeLoader');
const { teamKnowledge } = require('../services/teamKnowledge');
const assert = require('assert');

describe('Knowledge Integration Tests', () => {
  let knowledgeLoader;
  let context;

  before(() => {
    knowledgeLoader = new KnowledgeLoader();
  });

  describe('Knowledge Base Loading', () => {
    it('should load hardcoded knowledge base', async () => {
      const promptContext = await knowledgeLoader.getPromptContext();
      
      // Test style guide integration
      assert(promptContext.includes('Writing Standards:'), 'Style guide not found');
      assert(promptContext.includes('Clear and direct language'), 'Writing standards missing');
      assert(promptContext.includes('use instead of'), 'Banned words missing');
      
      // Test technical knowledge
      assert(promptContext.includes('DPIT Platforms:'), 'Technical knowledge not found');
      assert(promptContext.includes('ServiceNow Greenfield:'), 'Platform info missing');
      assert(promptContext.includes('Security Standards:'), 'Security standards missing');
      
      // Test response patterns
      assert(promptContext.includes('Response Patterns:'), 'Response patterns not found');
      assert(promptContext.includes('Ground in DPIT context'), 'Response guidelines missing');
    });
  });

  describe('Team Knowledge Integration', () => {
    it('should provide platform metrics', () => {
      const platforms = teamKnowledge.teamData.organization.structure.engineering.techStack.platforms;
      
      // Test ServiceNow metrics
      assert(platforms['ServiceNow Greenfield'].metrics.includes('99.9% uptime'), 'ServiceNow metrics missing');
      assert(platforms['Teams Voice/Rooms'].adoption.includes('85% employee usage'), 'Teams metrics missing');
      assert(platforms['Connect AI'].accuracy.includes('95% correct'), 'Connect AI metrics missing');
    });

    it('should provide DORA metrics', () => {
      const metrics = teamKnowledge.teamData.organization.structure.engineering.metrics.DORA;
      
      assert(metrics['Deployment Frequency'] === '10 times per day', 'DORA deployment metric missing');
      assert(metrics['Lead Time'] === '< 1 day', 'DORA lead time metric missing');
      assert(metrics['MTTR'] === '< 30 minutes', 'DORA MTTR metric missing');
    });
  });

  describe('Knowledge Application', () => {
    it('should identify technical terms in transcript', () => {
      const transcript = 'We need to improve our ServiceNow Greenfield deployment and integrate with Teams Voice Rooms';
      const entities = teamKnowledge.extractEntities(transcript);
      
      assert(entities.technologies.has('ServiceNow Greenfield'), 'Failed to identify ServiceNow');
      assert(entities.technologies.has('Teams Voice/Rooms'), 'Failed to identify Teams Voice/Rooms');
    });

    it('should build context-aware prompt', () => {
      const transcript = 'Let\'s discuss the Connect AI accuracy improvements and DDI/Infoblox performance';
      const contextData = teamKnowledge.buildContextPrompt(transcript);
      
      assert(contextData.context.includes('Technologies discussed:'), 'Missing technology context');
      assert(contextData.entities.technologies.size > 0, 'Failed to extract technologies');
    });
  });

  describe('Response Generation', () => {
    it('should format metrics correctly', () => {
      const platforms = teamKnowledge.teamData.organization.structure.engineering.techStack.platforms;
      const connectai = platforms['Connect AI'];
      
      assert(connectai.accuracy === '95% correct responses', 'Incorrect metric format');
      assert(connectai.usage === '2,000+ daily interactions', 'Incorrect usage format');
    });

    it('should maintain style guidelines', async () => {
      const promptContext = await knowledgeLoader.getPromptContext();
      
      // Check style enforcement
      assert(promptContext.includes('use instead of'), 'Missing word replacement guide');
      assert(promptContext.includes('specific innovation metrics'), 'Missing metrics requirement');
      assert(promptContext.includes('proven approaches'), 'Missing alternatives for banned phrases');
      
      // Check format guidelines
      assert(promptContext.includes('Active voice'), 'Missing active voice guideline');
      assert(promptContext.includes('Specific, concrete examples'), 'Missing specificity guideline');
    });
  });
});

// Helper function to test prompt generation
async function generateTestPrompt(transcript) {
  const contextData = teamKnowledge.buildContextPrompt(transcript);
  const promptContext = await knowledgeLoader.getPromptContext();
  
  return {
    basePrompt: promptContext,
    context: contextData.context,
    entities: contextData.entities,
    meetingType: contextData.meetingType
  };
}

// Example usage:
async function runPromptTest() {
  const transcript = `
    We need to improve our ServiceNow Greenfield deployment metrics. 
    Currently at 99.9% uptime but we're seeing some delays in ticket resolution.
    Teams Voice adoption is good at 85% but we need better meeting room coverage.
    Connect AI accuracy is hitting 95% but we want to reach 98%.
  `;

  const result = await generateTestPrompt(transcript);
  console.log('Test Prompt Result:', JSON.stringify(result, null, 2));
}

if (require.main === module) {
  runPromptTest().catch(console.error);
}

module.exports = {
  generateTestPrompt
};
