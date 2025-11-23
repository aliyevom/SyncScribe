const assert = require('assert');
const { knowledgeLoader } = require('../services/knowledgeLoader');
const { teamKnowledge } = require('../services/teamKnowledge');
const { AGENTS } = require('../services/agents');
const OpenAI = require('openai');

describe('AI Analysis Integration Tests', () => {
  let openai;
  let meetingContext;

  before(function() {
    // Skip tests if API keys are not available
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[X] Skipping AI Analysis tests: OPENAI_API_KEY not found');
      this.skip();
      return;
    }

    // Initialize OpenAI client
    try {
      openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    } catch (error) {
      console.error('Failed to initialize OpenAI client:', error);
      this.skip();
      return;
    }

    // Set up meeting context
    meetingContext = {
      title: 'Platform Performance Review',
      date: new Date().toISOString(),
      tags: ['technical', 'performance', 'metrics']
    };
  });

  describe('OpenAI Integration', () => {
    it('should generate analysis with correct style and context', async () => {
      const transcript = `
        Our ServiceNow Greenfield platform is showing 99.9% uptime, but ticket resolution time needs improvement.
        Teams Voice adoption is at 85% with 12,000 daily calls, and we're planning to equip 50 more meeting rooms.
        GridGPT accuracy is hitting 95%, but we want to reach 98% by optimizing the model.
      `;

      // Get agent configuration
      const agent = AGENTS.TECHNICAL_ARCHITECT;
      const systemPrompt = await agent.system({
        meetingMeta: meetingContext,
        teamData: teamKnowledge.teamData
      });

      // Call OpenAI
      let completion;
      try {
        completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: transcript }
          ],
          temperature: 0.7,
          max_tokens: 500
        });
      } catch (error) {
        console.error('OpenAI API Error:', error);
        throw error;
      }

      const analysis = completion.choices[0].message.content;

      // Verify style guidelines
      assert(!analysis.toLowerCase().includes('leverage'), 'Analysis contains banned word: leverage');
      assert(!analysis.toLowerCase().includes('utilize'), 'Analysis contains banned word: utilize');
      // Check for banned words but allow them in specific technical contexts
      const bannedWords = ['leverage', 'utilize', 'innovative'];
      bannedWords.forEach(word => {
        assert(!analysis.toLowerCase().includes(word), `Analysis contains banned word: ${word}`);
      });
      
      // Verify technical context
      assert(analysis.includes('ServiceNow'), 'Analysis missing platform reference');
      assert(analysis.includes('Teams Voice'), 'Analysis missing Teams Voice reference');
      assert(analysis.includes('GridGPT'), 'Analysis missing GridGPT reference');
      
      // Verify metrics inclusion
      assert(analysis.includes('99.9%'), 'Analysis missing uptime metric');
      assert(analysis.includes('85%'), 'Analysis missing adoption metric');
      assert(analysis.includes('95%'), 'Analysis missing accuracy metric');
      
      // Verify format
      const listMarkers = ['•', '-', '1.', '2.', '3.', '*'];
      const hasListMarkers = listMarkers.some(marker => 
        analysis.split('\n').some(line => line.trim().startsWith(marker))
      );
      assert(!hasListMarkers, 'Analysis contains list markers or bullet points');
      
      console.log('Generated Analysis:', analysis);
    });

    it('should adapt response based on meeting type', async () => {
      const transcript = `
        Let's review our DORA metrics. Deployment frequency is at 10 times per day,
        lead time under 1 day, MTTR below 30 minutes, and change failure rate under 5%.
        We need to improve our deployment automation to hit 15 deployments per day.
      `;

      // Test with different agents
      const agents = [
        AGENTS.MEETING_ANALYST,
        AGENTS.TECHNICAL_ARCHITECT,
        AGENTS.ACTION_TRACKER
      ];

      for (const agent of agents) {
        const systemPrompt = await agent.system({
          meetingMeta: {
            ...meetingContext,
            tags: [agent.name.toLowerCase()]
          },
          teamData: teamKnowledge.teamData
        });

        let completion;
        try {
          completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: transcript }
            ],
            temperature: 0.7,
            max_tokens: 500
          });
        } catch (error) {
          console.error('OpenAI API Error:', error);
          throw error;
        }

        const analysis = completion.choices[0].message.content;

        // Verify agent-specific content
        if (agent === AGENTS.MEETING_ANALYST) {
          assert(analysis.toLowerCase().includes('metrics') || analysis.toLowerCase().includes('performance'), 'Meeting analysis missing metrics summary');
        } else if (agent === AGENTS.TECHNICAL_ARCHITECT) {
          assert(analysis.includes('DORA'), 'Technical analysis missing DORA reference');
        } else if (agent === AGENTS.ACTION_TRACKER) {
          const actionWords = ['improve', 'increase', 'enhance', 'optimize'];
          const hasAction = actionWords.some(word => analysis.toLowerCase().includes(word));
          assert(hasAction, 'Action tracking missing improvement tasks');
        }

        console.log(`${agent.name} Analysis:`, analysis);
      }
    });
  });

  describe('Knowledge Integration', () => {
    it('should combine multiple knowledge sources', async () => {
      const transcript = `
        The secure-by-design implementation for our ServiceNow Greenfield platform
        needs review. We're hitting our DORA metrics targets but need to ensure
        our design-to-operate process aligns with our North Star goals.
      `;

      // Get knowledge context
      const knowledgeContext = await knowledgeLoader.getPromptContext();
      const teamContext = teamKnowledge.buildContextPrompt(transcript);

      // Verify knowledge combination
      assert(knowledgeContext.includes('Secure-by-design principles'), 'Missing security knowledge');
      assert(knowledgeContext.includes('DORA Metrics'), 'Missing metrics knowledge');
      assert(teamContext.context.includes('ServiceNow'), 'Missing platform knowledge');

      // Test with OpenAI
      const agent = AGENTS.TECHNICAL_ARCHITECT;
      const systemPrompt = await agent.system({
        meetingMeta: meetingContext,
        teamData: teamKnowledge.teamData
      });

      let completion;
      try {
        completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: transcript }
          ],
          temperature: 0.7,
          max_tokens: 500
        });
      } catch (error) {
        console.error('OpenAI API Error:', error);
        throw error;
      }

      const analysis = completion.choices[0].message.content;
      console.log('Combined Knowledge Analysis:', analysis);
    });
  });
});