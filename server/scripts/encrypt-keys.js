require('dotenv').config();
const fs = require('fs');
const path = require('path');
const encryptionService = require('../services/encryptionService');

const encryptApiKeys = () => {
  try {
  
    const requiredEnvVars = [
      'OPENAI_API_KEY',
      'OPENAI_ORG_ID',
      'GOOGLE_PROJECT_ID',
      'GOOGLE_CLIENT_EMAIL',
      'GOOGLE_PRIVATE_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('Missing required environment variables:', missingVars.join(', '));
      console.error('Please ensure all required variables are set in your .env file');
      process.exit(1);
    }

    // Read credentials from environment
    const credentials = {
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        orgId: process.env.OPENAI_ORG_ID || '',
        projectId: process.env.OPENAI_PROJECT_ID || '',
        assistantId: process.env.OPENAI_ASSISTANT_ID || ''
      },
      google: {
        projectId: process.env.GOOGLE_PROJECT_ID || '',
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
        privateKey: process.env.GOOGLE_PRIVATE_KEY || ''
      }
    };

    // Encrypt credentials
    const encrypted = encryptionService.encryptCredentials(credentials);

    // Verify encryption results
    if (!encrypted.openai?.apiKey?.encryptedData || !encrypted.google?.projectId?.encryptedData) {
      throw new Error('Encryption failed - missing encrypted data');
    }

    // Generate secure .env content
    let secureEnvContent = `# Generated secure environment configuration
# DO NOT COMMIT THIS FILE

# Encryption Configuration
ENCRYPTION_KEY=${encryptionService.ENCRYPTION_KEY}

# OpenAI Encrypted Credentials
OPENAI_API_KEY_ENCRYPTED=${encrypted.openai.apiKey.encryptedData}
OPENAI_API_KEY_IV=${encrypted.openai.apiKey.iv}
OPENAI_API_KEY_AUTH=${encrypted.openai.apiKey.authTag}

OPENAI_ORG_ID_ENCRYPTED=${encrypted.openai.orgId.encryptedData}
OPENAI_ORG_ID_IV=${encrypted.openai.orgId.iv}
OPENAI_ORG_ID_AUTH=${encrypted.openai.orgId.authTag}

# Google Cloud Encrypted Credentials
GOOGLE_PROJECT_ID_ENCRYPTED=${encrypted.google.projectId.encryptedData}
GOOGLE_PROJECT_ID_IV=${encrypted.google.projectId.iv}
GOOGLE_PROJECT_ID_AUTH=${encrypted.google.projectId.authTag}

GOOGLE_CLIENT_EMAIL_ENCRYPTED=${encrypted.google.clientEmail.encryptedData}
GOOGLE_CLIENT_EMAIL_IV=${encrypted.google.clientEmail.iv}
GOOGLE_CLIENT_EMAIL_AUTH=${encrypted.google.clientEmail.authTag}

GOOGLE_PRIVATE_KEY_ENCRYPTED=${encrypted.google.privateKey.encryptedData}
GOOGLE_PRIVATE_KEY_IV=${encrypted.google.privateKey.iv}
GOOGLE_PRIVATE_KEY_AUTH=${encrypted.google.privateKey.authTag}

# Proxy Configuration
PROXY_HOST=localhost
PROXY_PORT=8080

# Traffic Masking
ENABLE_TRAFFIC_MASKING=true
DECOY_REQUESTS_ENABLED=true

# Assistant Configuration
ASSISTANT_NAME="Technical Meeting Assistant"
ASSISTANT_MODEL="gpt-4-turbo-preview"
ASSISTANT_TEMPERATURE=0.7
ASSISTANT_MAX_TOKENS=2000
ASSISTANT_MIN_WORDS=300
`;

    // Create scripts directory if it doesn't exist
    const serverDir = path.join(__dirname, '..');
    if (!fs.existsSync(serverDir)) {
      fs.mkdirSync(serverDir, { recursive: true });
    }

    // Write to .env.secure
    fs.writeFileSync(path.join(serverDir, '.env.secure'), secureEnvContent);
    console.log('Credentials encrypted successfully! Check .env.secure file.');
    
    // Backup original .env if it exists
    const envPath = path.join(serverDir, '.env');
    if (fs.existsSync(envPath)) {
      fs.copyFileSync(envPath, path.join(serverDir, '.env.backup'));
      console.log('Original .env backed up to .env.backup');
    }

  } catch (error) {
    console.error('Error encrypting credentials:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
};

// Add error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});

encryptApiKeys(); 