// Prompt Profile Service
// Loads dynamic AI-agent "style profiles" from a dedicated GCS bucket so that
// role/customer-specific prompt content lives OUTSIDE the repository.
//
// Profiles are JSON objects stored under `profiles/<id>.json`, e.g.:
// {
//   "id": "agentic-staff",
//   "name": "Agentic Staff Style",
//   "description": "Combined assessment + coding + system-design answer discipline",
//   "mode": "append",                 // "append" (default) or "replace"
//   "combinedStyle": "shared answer discipline applied to ALL agents...",
//   "agents": {
//     "SPOKEN_RESPONDER":     "analysis style...",
//     "CODE_DEEP_DIVE":       "coding style...",
//     "SYSTEM_DESIGN_VIEWER": "system-design style..."
//   }
// }

require('dotenv').config();
const { Storage } = require('@google-cloud/storage');
const path = require('path');

const PROFILE_PREFIX = 'profiles/';
const CACHE_TTL_MS = parseInt(process.env.PROMPT_PROFILE_TTL_MS || '300000', 10); // 5 min

class PromptProfileService {
  constructor() {
    this.projectId = process.env.GCS_PROJECT_ID;
    this.bucketName = process.env.GCS_PROMPTS_BUCKET || 'syncscribe-prompts';

    try {
      const gcsConfig = { projectId: this.projectId };
      if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
        gcsConfig.credentials = {
          client_email: process.env.GCS_CLIENT_EMAIL,
          private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n'),
        };
      } else {
        gcsConfig.keyFilename = path.join(__dirname, '../key.json');
      }
      this.storage = new Storage(gcsConfig);
      console.log('[OK] PromptProfileService GCS initialized');
    } catch (error) {
      console.warn('[X] PromptProfileService GCS init failed:', error.message);
      this.storage = null;
    }

    // id -> { profile, fetchedAt }
    this.cache = new Map();
    this.listCache = null; // { items, fetchedAt }
  }

  _fresh(ts) {
    return ts && (Date.now() - ts) < CACHE_TTL_MS;
  }

  // Clear all caches (manual refresh)
  refresh() {
    this.cache.clear();
    this.listCache = null;
    return { success: true, refreshedAt: new Date().toISOString() };
  }

  // List available profiles (lightweight metadata only)
  async listProfiles() {
    if (this.listCache && this._fresh(this.listCache.fetchedAt)) {
      return this.listCache.items;
    }
    if (!this.storage) return [];
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [files] = await bucket.getFiles({ prefix: PROFILE_PREFIX });
      const items = [];
      for (const file of files) {
        if (!file.name.endsWith('.json')) continue;
        try {
          const [buf] = await file.download();
          const json = JSON.parse(buf.toString('utf8'));
          const id = json.id || path.basename(file.name, '.json');
          const profile = { ...json, id };
          // warm the per-id cache too
          this.cache.set(id, { profile, fetchedAt: Date.now() });
          items.push({ id, name: json.name || id, description: json.description || '' });
        } catch (err) {
          console.warn(`[PromptProfile] Skipping malformed profile ${file.name}: ${err.message}`);
        }
      }
      this.listCache = { items, fetchedAt: Date.now() };
      return items;
    } catch (error) {
      console.warn(`[PromptProfile] listProfiles failed: ${error.message}`);
      return [];
    }
  }

  // Get a full profile by id (with caching). Returns null if missing.
  async getProfile(id) {
    if (!id) return null;
    const cached = this.cache.get(id);
    if (cached && this._fresh(cached.fetchedAt)) return cached.profile;
    if (!this.storage) return null;
    try {
      const file = this.storage.bucket(this.bucketName).file(`${PROFILE_PREFIX}${id}.json`);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [buf] = await file.download();
      const json = JSON.parse(buf.toString('utf8'));
      const profile = { ...json, id: json.id || id };
      this.cache.set(id, { profile, fetchedAt: Date.now() });
      return profile;
    } catch (error) {
      console.warn(`[PromptProfile] getProfile(${id}) failed: ${error.message}`);
      return null;
    }
  }

  // Combine a profile into a base agent system prompt.
  // agentKey: 'SPOKEN_RESPONDER' | 'CODE_DEEP_DIVE' | 'SYSTEM_DESIGN_VIEWER'
  // Falls back to the base prompt when profile is missing.
  buildSystemPrompt(agentKey, baseSystemPrompt, profile) {
    if (!profile) return baseSystemPrompt;
    const parts = [];
    const agentText = profile.agents && profile.agents[agentKey];
    const combined = profile.combinedStyle;

    if (profile.mode === 'replace') {
      if (agentText) parts.push(agentText);
      else parts.push(baseSystemPrompt);
      if (combined) parts.push(combined);
      return parts.filter(Boolean).join('\n\n');
    }

    // default: append
    parts.push(baseSystemPrompt);
    if (combined) parts.push(`\n# Conversation Style (dynamic)\n${combined}`);
    if (agentText) parts.push(`\n# Agent-specific guidance (dynamic)\n${agentText}`);
    return parts.filter(Boolean).join('\n\n');
  }

  getHealthStatus() {
    return {
      enabled: !!this.storage,
      bucket: this.bucketName,
      cachedProfiles: this.cache.size,
      ttlMs: CACHE_TTL_MS,
    };
  }
}

module.exports = new PromptProfileService();
