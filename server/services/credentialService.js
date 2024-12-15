const encryptionService = require('./encryptionService');
const dotenv = require('dotenv');
const path = require('path');

class CredentialService {
  constructor() {
    
    dotenv.config({ path: path.join(__dirname, '..', '.env.secure') });
    this.credentials = this.decryptCredentials();
  }

  decryptCredentials() {
    try {
      return {
        openai: {
          apiKey: this.decryptValue('OPENAI_API_KEY'),
          orgId: this.decryptValue('OPENAI_ORG_ID'),
          projectId: this.decryptValue('OPENAI_PROJECT_ID'),
          assistantId: this.decryptValue('OPENAI_ASSISTANT_ID')
        },
        google: {
          projectId: this.decryptValue('GOOGLE_PROJECT_ID'),
          clientEmail: this.decryptValue('GOOGLE_CLIENT_EMAIL'),
          privateKey: this.decryptValue('GOOGLE_PRIVATE_KEY')
        }
      };
    } catch (error) {
      console.error('Error decrypting credentials:', error);
      throw error;
    }
  }

  decryptValue(key) {
    if (!process.env[`${key}_ENCRYPTED`]) {
      return null;
    }

    return encryptionService.decrypt({
      encryptedData: process.env[`${key}_ENCRYPTED`],
      iv: process.env[`${key}_IV`],
      authTag: process.env[`${key}_AUTH`]
    });
  }

  getOpenAIConfig() {
    return {
      apiKey: this.credentials.openai.apiKey,
      organization: this.credentials.openai.orgId
    };
  }

  getGoogleConfig() {
    return {
      projectId: this.credentials.google.projectId,
      credentials: {
        client_email: this.credentials.google.clientEmail,
        private_key: this.credentials.google.privateKey
      }
    };
  }
}

module.exports = new CredentialService(); 