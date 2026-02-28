const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
function loadTestEnv() {
  // Try to load from .env.test first
  const testEnvPath = path.join(__dirname, '../.env.test');
  const defaultEnvPath = path.join(__dirname, '../.env');

  if (fs.existsSync(testEnvPath)) {
    dotenv.config({ path: testEnvPath });
  } else if (fs.existsSync(defaultEnvPath)) {
    dotenv.config({ path: defaultEnvPath });
  }

  // Validate required environment variables
  const requiredEnvVars = ['OPENAI_API_KEY', 'DEEPGRAM_API_KEY'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

  if (missingEnvVars.length > 0) {
    console.warn(`
[X] Missing environment variables:
${missingEnvVars.map(key => `   - ${key}`).join('\n')}

To run all tests, create a .env file in the server directory with:
OPENAI_API_KEY=your_openai_key
DEEPGRAM_API_KEY=your_deepgram_key

Some tests will be skipped.
`);
  }
}

// Initialize test environment
loadTestEnv();

// Export helper functions for tests
module.exports = {
  isOpenAIAvailable: () => !!process.env.OPENAI_API_KEY,
  isDeepgramAvailable: () => !!process.env.DEEPGRAM_API_KEY,
  isGCSAvailable: () => !!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.GCS_PROJECT_ID,
  getMockTranscript: () => `
    Our ServiceNow Greenfield platform is showing 99.9% uptime, but ticket resolution time needs improvement.
    Teams Voice adoption is at 85% with 12,000 daily calls, and we're planning to equip 50 more meeting rooms.
    Connect AI accuracy is hitting 95%, but we want to reach 98% by optimizing the model.
  `,
  getMockMeetingContext: () => ({
    title: 'Platform Performance Review',
    date: new Date().toISOString(),
    tags: ['technical', 'performance', 'metrics']
  }),
  getMockRAGResponse: () => ({
    text: 'Software development best practices include DRY principle, YAGNI, and proper naming conventions.',
    analysisType: 'document-enhanced',
    agent: 'Meeting Analyst',
    ragUsed: true,
    ragSources: [
      {
        filename: 'technical-best-practices.txt',
        bucket: 'meeting-trans-443019-syncscribe-ng-docs',
        similarity: '78.2'
      }
    ],
    ragTag: '+RAG',
    timestamp: new Date().toISOString()
  }),
  getMockOriginalResponse: () => ({
    text: 'Software development best practices include following coding standards.',
    analysisType: 'original',
    agent: 'Meeting Analyst',
    ragUsed: false,
    ragSources: [],
    ragTag: null,
    timestamp: new Date().toISOString()
  }),
  getMockDocumentResults: () => [
    {
      text: 'Software development best practices include DRY principle, YAGNI, and proper naming conventions.',
      metadata: {
        filename: 'technical-best-practices.txt',
        bucket: 'meeting-trans-443019-syncscribe-ng-docs'
      },
      similarity: 0.782
    },
    {
      text: 'Following coding standards and style guides improves code quality.',
      metadata: {
        filename: 'ng-platform-overview.md',
        bucket: 'meeting-trans-443019-syncscribe-ng-docs'
      },
      similarity: 0.721
    }
  ]
};
