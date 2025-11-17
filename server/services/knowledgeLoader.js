const fs = require('fs').promises;
const path = require('path');

class KnowledgeLoader {
  constructor() {
    this.knowledgeCache = new Map();
    this.knowledgeDir = path.join(__dirname, '../knowledge');
    
    // Hardcoded knowledge base
    this.hardcodedKnowledge = {
      style: `
Writing Standards:
- Clear and direct language
- Active voice for engagement
- Positive phrasing always
- "You" instead of "we"
- Contractions for warmth
- Specific, concrete examples

Banned Words:
- use instead of "leverage"
- use instead of "utilize"
- strong instead of "robust"
- specific innovation metrics
- proven approaches instead of "best practices"
- specific performance metrics

Banned Phrases:
- "I think/believe"
- "Sort of/kind of"
- "We're excited to"
- "The future of"
- "Game-changing"
- "Out of the box"`,

      technical: `
DPIT Platforms:
- ServiceNow Greenfield: Latest deployment metrics
- Teams Voice/Rooms: Current adoption rates
- DDI/Infoblox: Configuration standards
- GridGPT/Connect AI: Use case library
- DORA Metrics: Performance tracking

Security Standards:
- Secure-by-design principles for all platforms
- Zero-trust authentication patterns
- Role-based authorization flows
- Data protection and encryption
- Compliance with industry standards
- Regular security audits
- Incident response procedures
- Access control policies

Operational Excellence:
- Deployment procedures
- Monitoring standards
- Incident response
- Capacity planning
- Performance metrics`,

      response: `
Response Patterns:
1. Ground in DPIT context
2. Provide concrete examples
3. Include relevant metrics
4. Link to actual services
5. End with clear next steps

Adaptation Rules:
- Reconfigure per context
- Mirror technical depth
- Match format to request
- Stay within boundaries
- Maintain consistent voice

Evidence Standards:
- Back claims with metrics
- Use real service names
- Show configurations
- Reference platforms
- Include performance data`
    };
  }

  async getPromptContext() {
    return `
${this.hardcodedKnowledge.style}

${this.hardcodedKnowledge.technical}

${this.hardcodedKnowledge.response}
    `.trim();
  }

  // Keep file loading capability for future extensibility
  async loadKnowledgeFile(filename) {
    if (this.knowledgeCache.has(filename)) {
      return this.knowledgeCache.get(filename);
    }

    try {
      const filePath = path.join(this.knowledgeDir, filename);
      const content = await fs.readFile(filePath, 'utf8');
      
      if (filename.endsWith('.mdc')) {
        const [_, frontmatter, markdown] = content.split('---');
        const config = frontmatter ? this.parseFrontmatter(frontmatter) : {};
        
        this.knowledgeCache.set(filename, {
          content: markdown.trim(),
          config,
          type: 'mdc'
        });
      } else {
        this.knowledgeCache.set(filename, {
          content: content.trim(),
          type: 'raw'
        });
      }

      return this.knowledgeCache.get(filename);
    } catch (error) {
      console.error(`Error loading knowledge file ${filename}:`, error);
      return null;
    }
  }

  parseFrontmatter(frontmatter) {
    const config = {};
    const lines = frontmatter.trim().split('\n');
    
    for (const line of lines) {
      const [key, value] = line.split(':').map(s => s.trim());
      if (key && value) {
        if (value.toLowerCase() === 'true') config[key] = true;
        else if (value.toLowerCase() === 'false') config[key] = false;
        else if (!isNaN(value)) config[key] = Number(value);
        else config[key] = value.replace(/^["']|["']$/g, '');
      }
    }
    
    return config;
  }
}

const knowledgeLoader = new KnowledgeLoader();

module.exports = {
  KnowledgeLoader,
  knowledgeLoader
};