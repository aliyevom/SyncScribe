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
⚠️  Missing environment variables:
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
  getMockTranscript: () => `
    Our ServiceNow Greenfield platform is showing 99.9% uptime, but ticket resolution time needs improvement.
    Teams Voice adoption is at 85% with 12,000 daily calls, and we're planning to equip 50 more meeting rooms.
    GridGPT accuracy is hitting 95%, but we want to reach 98% by optimizing the model.
  `,
  getMockMeetingContext: () => ({
    title: 'Platform Performance Review',
    date: new Date().toISOString(),
    tags: ['technical', 'performance', 'metrics']
  })
};
