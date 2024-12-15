const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// DF
class EncryptionService {
  constructor() {
    const passphrase = 'SyncScribe_2024!@#$%^&*()_+1234567890';
    const salt = 'SyncScribe_Salt_2024!@#';
    this.ENCRYPTION_KEY = crypto.scryptSync(passphrase, salt, 32);
    this.IV_LENGTH = 16;
  }

  encrypt(text) {
    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(
        'aes-256-gcm', 
        this.ENCRYPTION_KEY,
        iv
      );
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      
      return {
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw error;
    }
  }

  decrypt(data) {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.ENCRYPTION_KEY,
        Buffer.from(data.iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
      
      let decrypted = decipher.update(data.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw error;
    }
  }

  encryptCredentials(credentials) {
    const encrypted = {};
    
    for (const [service, creds] of Object.entries(credentials)) {
      encrypted[service] = {};
      for (const [key, value] of Object.entries(creds)) {
        if (value) {
          encrypted[service][key] = this.encrypt(value);
        }
      }
    }
    
    return encrypted;
  }
}

module.exports = new EncryptionService(); 