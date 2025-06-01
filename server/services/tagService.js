// Tag Service for Enhanced AI Analysis
// This service manages meeting tags and integrates with AI analysis

const fs = require('fs').promises;
const path = require('path');

class TagService {
  constructor() {
    this.tags = null;
    this.tagFilePath = path.join(__dirname, '../meeting-tags.json');
    this.loadTags();
  }

  // Load tags from configuration file
  async loadTags() {
    try {
      const data = await fs.readFile(this.tagFilePath, 'utf8');
      this.tags = JSON.parse(data);
      console.log('Meeting tags loaded successfully');
    } catch (error) {
      console.warn('No meeting tags found, using defaults');
      this.tags = this.getDefaultTags();
    }
  }

  // Get default tags if no configuration exists
  getDefaultTags() {
    return {
      tags: {
        priority: {
          critical: { color: '#FF0000', weight: 10, aiPrompt: 'CRITICAL priority' },
          high: { color: '#FFA500', weight: 7, aiPrompt: 'High priority' },
          medium: { color: '#FFFF00', weight: 5, aiPrompt: 'Medium priority' },
          low: { color: '#00FF00', weight: 3, aiPrompt: 'Low priority' }
        },
        type: {
          decision: { icon: '🎯', aiPrompt: 'Key decision point' },
          action: { icon: '📋', aiPrompt: 'Action item required' },
          blocker: { icon: '🚫', aiPrompt: 'Blocking issue' },
          idea: { icon: '💡', aiPrompt: 'Idea or suggestion' },
          question: { icon: '❓', aiPrompt: 'Requires clarification' }
        }
      },
      autoTagRules: []
    };
  }

  // Extract tags from transcript using auto-tag rules
  extractAutoTags(transcript) {
    const detectedTags = new Set();
    const lowerTranscript = transcript.toLowerCase();

    if (this.tags.autoTagRules) {
      this.tags.autoTagRules.forEach(rule => {
        const hasKeyword = rule.keywords.some(keyword => 
          lowerTranscript.includes(keyword.toLowerCase())
        );
        
        if (hasKeyword) {
          rule.tags.forEach(tag => detectedTags.add(tag));
        }
      });
    }

    return Array.from(detectedTags);
  }

  // Parse user-provided tags from transcript
  parseUserTags(transcript) {
    const tagPattern = /#(\w+):(\w+)/g;
    const userTags = [];
    let match;

    while ((match = tagPattern.exec(transcript)) !== null) {
      userTags.push(`${match[1]}:${match[2]}`);
    }

    return userTags;
  }

  // Get all tags from transcript
  getAllTags(transcript) {
    const autoTags = this.extractAutoTags(transcript);
    const userTags = this.parseUserTags(transcript);
    
    // Combine and deduplicate
    const allTags = [...new Set([...autoTags, ...userTags])];
    
    // Sort by priority weight if applicable
    return this.sortTagsByPriority(allTags);
  }

  // Sort tags by priority weight
  sortTagsByPriority(tags) {
    return tags.sort((a, b) => {
      const aWeight = this.getTagWeight(a);
      const bWeight = this.getTagWeight(b);
      return bWeight - aWeight;
    });
  }

  // Get weight of a tag
  getTagWeight(tag) {
    const [category, value] = tag.split(':');
    
    if (this.tags.tags[category] && this.tags.tags[category][value]) {
      return this.tags.tags[category][value].weight || 0;
    }
    
    return 0;
  }

  // Build tag context for AI analysis
  buildTagContext(tags) {
    const contextParts = [];
    
    tags.forEach(tag => {
      const [category, value] = tag.split(':');
      
      if (this.tags.tags[category] && this.tags.tags[category][value]) {
        const tagInfo = this.tags.tags[category][value];
        if (tagInfo.aiPrompt) {
          contextParts.push(tagInfo.aiPrompt);
        }
        
        // Add expert context for department tags
        if (category === 'department' && tagInfo.experts) {
          contextParts.push(`Relevant experts: ${tagInfo.experts.join(', ')}`);
        }
        
        // Add team context for project tags
        if (category === 'project' && tagInfo.team) {
          contextParts.push(`Project team: ${tagInfo.team.join(', ')}`);
        }
      }
    });
    
    return contextParts.join('\n');
  }

  // Get tag metadata for UI display
  getTagMetadata(tag) {
    const [category, value] = tag.split(':');
    
    if (this.tags.tags[category] && this.tags.tags[category][value]) {
      return {
        category,
        value,
        ...this.tags.tags[category][value]
      };
    }
    
    return {
      category,
      value,
      color: '#888888',
      icon: '🏷️'
    };
  }

  // Analyze tag patterns in meeting history
  analyzeTagPatterns(meetingHistory) {
    const tagFrequency = {};
    const tagCorrelations = {};
    
    meetingHistory.forEach(meeting => {
      const tags = meeting.tags || [];
      
      // Count tag frequency
      tags.forEach(tag => {
        tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
      });
      
      // Find tag correlations
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const pair = [tags[i], tags[j]].sort().join(' + ');
          tagCorrelations[pair] = (tagCorrelations[pair] || 0) + 1;
        }
      }
    });
    
    return {
      frequency: tagFrequency,
      correlations: tagCorrelations,
      insights: this.generateTagInsights(tagFrequency, tagCorrelations)
    };
  }

  // Generate insights from tag patterns
  generateTagInsights(frequency, correlations) {
    const insights = [];
    
    // Find most common tags
    const sortedTags = Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    if (sortedTags.length > 0) {
      insights.push({
        type: 'frequency',
        message: `Most common tags: ${sortedTags.map(([tag]) => tag).join(', ')}`
      });
    }
    
    // Find strong correlations
    const strongCorrelations = Object.entries(correlations)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    if (strongCorrelations.length > 0) {
      insights.push({
        type: 'correlation',
        message: `Frequently paired tags: ${strongCorrelations.map(([pair]) => pair).join('; ')}`
      });
    }
    
    // Check for concerning patterns
    if (frequency['priority:critical'] > 5) {
      insights.push({
        type: 'warning',
        message: 'High number of critical priority items detected'
      });
    }
    
    if (frequency['type:blocker'] > 3) {
      insights.push({
        type: 'warning',
        message: 'Multiple blockers identified - consider dedicated resolution session'
      });
    }
    
    return insights;
  }

  // Save updated tags configuration
  async saveTags(tags) {
    try {
      await fs.writeFile(
        this.tagFilePath,
        JSON.stringify(tags, null, 2),
        'utf8'
      );
      this.tags = tags;
      console.log('Tags configuration saved');
    } catch (error) {
      console.error('Error saving tags:', error);
      throw error;
    }
  }

  // Add custom tag
  async addCustomTag(category, name, metadata) {
    if (!this.tags.tags[category]) {
      this.tags.tags[category] = {};
    }
    
    this.tags.tags[category][name] = metadata;
    await this.saveTags(this.tags);
  }

  // Add auto-tag rule
  async addAutoTagRule(keywords, tags) {
    if (!this.tags.autoTagRules) {
      this.tags.autoTagRules = [];
    }
    
    this.tags.autoTagRules.push({ keywords, tags });
    await this.saveTags(this.tags);
  }
}

// Create singleton instance
const tagService = new TagService();

module.exports = {
  TagService,
  tagService
}; 