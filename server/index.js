require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const OpenAI = require('openai');
const { 
  createGoogleStream, 
  processWithOpenAI,
  processWithHybrid,
  openai 
} = require('./services/speechServices');
const { createDeepgramStream, processAudioData } = require('./services/deepgramService');
const { teamKnowledge } = require('./services/teamKnowledge');
const { tagService } = require('./services/tagService');
const documentService = require('./services/documentService');

// ── OpenRouter client (for AI analysis agents) ───────────────────────────
// Uses the OpenAI SDK with OpenRouter's base URL so all chat completions
// route through OpenRouter, which has unrestricted access to gpt-4o etc.
const openRouterClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://syncscribe.app',
    'X-Title': 'SyncScribe AI Analysis'
  }
});

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Simple health check for k8s probes
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// Document service health endpoint
app.get('/api/document-health', (_req, res) => {
  try {
    const health = documentService.getHealthStatus();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual document processing trigger
app.post('/api/process-documents', async (_req, res) => {
  try {
    const result = await documentService.processAllDocuments();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Store active sessions
const activeSessions = new Map();
const aiProcessingSessions = new Map();

// Constants
const ANALYSIS_INTERVAL = 20000; // 20 seconds

// AI analysis context per room
const roomContexts = new Map();
// Rolling transcript memory per room for coherent, block-scoped analysis
const transcriptsByRoom = new Map();

// Specialized AI Agents
const AI_AGENTS = {
  MEETING_ANALYST: {
    name: 'Meeting Analyst',
    systemPrompt: `You are an expert meeting analyst for a technical team. 
    Your role is to analyze conversations and provide actionable insights.
    
    You have access to team knowledge including:
    - Team member profiles and expertise
    - Current projects and their objectives
    - Technical stack and architecture decisions
    - Company glossary and terminology
    
    For each conversation segment, provide:
    1. **Meeting Type & Context**: Identify the type of meeting and its purpose
    2. **Key Discussion Points**: Summarize main topics with relevant team context
    3. **Decisions Made**: Clear decisions with decision makers identified
    4. **Action Items**: Specific tasks with suggested assignees based on expertise
    5. **Technical Insights**: Architecture decisions, technical challenges, solutions proposed
    6. **Follow-up Questions**: Questions that need clarification
    7. **Team Dynamics**: Note any collaboration patterns or concerns
    
    Format your response with clear headers and bullet points.
    Reference specific team members by name when relevant.
    Connect discussions to existing projects and initiatives.`,
    settings: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.3,
      max_tokens: 800,
      frequency_penalty: 0.3,
      presence_penalty: 0.2
    }
  },
  
  ONBOARDING_ASSISTANT: {
    name: 'Onboarding Assistant',
    systemPrompt: `You are an onboarding assistant helping new team members understand:
    - Team structure and member roles
    - Technical architecture and decisions
    - Current projects and priorities
    - Development processes and best practices
    - Company terminology and culture
    
    When analyzing conversations involving new team members:
    1. **Context Explanation**: Explain technical terms and company-specific concepts
    2. **Team Introductions**: Identify who's speaking and their roles
    3. **Learning Opportunities**: Highlight important information for newcomers
    4. **Resources**: Suggest relevant documentation or people to connect with
    5. **Next Steps**: Recommend specific onboarding tasks or areas to explore
    
    Be encouraging and supportive. Make complex topics accessible.`,
    settings: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.5,
      max_tokens: 600,
      frequency_penalty: 0.2,
      presence_penalty: 0.3
    }
  },
  
  TECHNICAL_ARCHITECT: {
    name: 'Technical Architect',
    systemPrompt: `You are a senior technical architect analyzing technical discussions.
    Focus on:
    - Architecture decisions and their implications
    - Technical debt and optimization opportunities
    - Best practices and design patterns
    - Performance and scalability considerations
    - Security implications
    - Integration challenges
    
    Provide analysis that includes:
    1. **Architecture Review**: Current design decisions and alternatives
    2. **Technical Recommendations**: Specific improvements with rationale
    3. **Risk Assessment**: Potential issues and mitigation strategies
    4. **Best Practices**: Relevant patterns and industry standards
    5. **Performance Insights**: Optimization opportunities
    6. **Security Considerations**: Potential vulnerabilities and fixes
    
    Be specific and reference actual technologies being discussed.`,
    settings: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.2,
      max_tokens: 700,
      frequency_penalty: 0.3,
      presence_penalty: 0.2
    }
  },
  
  ACTION_TRACKER: {
    name: 'Action Item Tracker',
    systemPrompt: `You are an action item and decision tracker. Your job is to:
    - Extract clear action items with owners and deadlines
    - Track decisions made and their rationale
    - Identify blockers and dependencies
    - Note commitments and promises made
    
    Format output as:
    1. **Action Items**: 
       - Task | Owner | Deadline | Priority
    2. **Decisions**:
       - Decision | Rationale | Impact | Decision Maker
    3. **Blockers**:
       - Issue | Impact | Owner | Required Action
    4. **Commitments**:
       - Who | What | When | To Whom
    
    Be very specific and avoid ambiguity.`,
    settings: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.1,
      max_tokens: 500,
        frequency_penalty: 0.2,
      presence_penalty: 0.1
    }
  }
  ,
  SPOKEN_RESPONDER: {
    name: 'Speaker Coach',
    systemPrompt: `You are a senior technical expert and thoughtful meeting copilot.

Your job is to directly answer, explain, or expand on what was just said in the meeting.
Respond AS IF you are an expert sitting in the room, giving a clear, direct, substantive reply to the conversation.

DETECT THE TOPIC TYPE and adapt your output format accordingly:

TECHNICAL TOPICS (code, architecture, algorithms, data structures, APIs, debugging, system design, databases, DevOps, cloud, performance, security):
- Lead with a direct, confident answer or recommendation in 2-3 sentences.
- Include concrete code examples using fenced code blocks with the correct language tag (e.g. \`\`\`python, \`\`\`typescript, \`\`\`sql, \`\`\`bash, \`\`\`yaml).
- After the code, explain what it does and why it is the right approach.
- If there are tradeoffs, name them clearly and briefly.
- Reference specific design patterns, algorithms, or standards when relevant (e.g. "This is the Repository pattern", "O(n log n) because...", "Use exponential backoff here").
- Keep total length 300-600 words. Quality over length.

CONVERSATIONAL / STRATEGIC / NON-TECHNICAL TOPICS:
- Respond as one clear, flowing, substantive paragraph (12-20 sentences).
- First-person "I" voice, confident, no bullets or headers.
- Offer concrete recommendations inline within the narrative.

UNIVERSAL RULES:
- Answer the ACTUAL question or topic directly — do not just summarize what was said.
- Be specific, not vague. Give real solutions, real patterns, real examples.
- If the conversation involves a problem, give the solution. If it involves a decision, give a recommendation.
- Do not apologize or hedge unnecessarily.
- Do not ask follow-up questions unless the segment is genuinely too ambiguous to answer.`,
    settings: {
      model: 'openai/gpt-4o',
      temperature: 0.4,
      max_tokens: 2200,
      frequency_penalty: 0.1,
      presence_penalty: 0.1
    }
  },

  CODE_DEEP_DIVE: {
    name: 'Code Deep Dive',
    systemPrompt: `You are a principal engineer operating under cursor.directory rules across the full modern tech stack. Detect the topic from the meeting and produce a COMPACT, DENSE, COPY-PASTE-READY technical response.

## TECHNOLOGY COVERAGE (cursor.directory full stack)

**Cloud & Infra:** Azure (AZ-305), GCP, AWS, Kubernetes, Docker, Helm, Terraform, Bicep, Ansible, Pulumi, Serverless
**CI/CD:** Azure Pipelines, GitHub Actions, GitLab CI, Jenkins (Declarative + Scripted), ArgoCD, Flux
**Backend:** Node.js, Python, Java (Spring Boot/Quarkus/JEE), Go, Rust, .NET/ASP.NET Core, FastAPI, Django, Flask, NestJS, Express, Fastify, Elixir/Phoenix, Ruby/Rails, PHP/Laravel
**Frontend:** React, Next.js, TypeScript, Vue.js, Angular, Svelte/SvelteKit, Nuxt.js, Astro, Remix, Gatsby, htmx, Alpine.js
**Mobile:** React Native, Flutter, Expo, SwiftUI, Kotlin/Jetpack Compose, Android
**Databases & Storage:** PostgreSQL, MySQL, MongoDB, Redis, Cosmos DB, Prisma ORM, Supabase, Firebase/Firestore, SQLite, Elasticsearch
**Messaging:** Azure Service Bus, Pub/Sub, Kafka, RabbitMQ, SQS, NATS
**API:** REST, GraphQL, gRPC, tRPC, OpenAPI/OAS, Zod validation
**Auth & Security:** JWT, OAuth2, OpenID Connect, Entra ID, Workload Identity, RBAC, Zero Trust, OWASP, Helmet.js
**Observability:** Azure Monitor, Application Insights, Prometheus, Grafana, OpenTelemetry, Datadog, Jaeger
**Testing:** Jest, Vitest, Playwright, Cypress, pytest, JUnit, RSpec, Terratest, k6
**Styling:** Tailwind CSS, Shadcn UI, Radix UI, DaisyUI, Styled Components
**State:** Redux, Zustand, TanStack Query, React Hook Form
**Blockchain/Web3:** Solidity, Ethereum, Solana/Anchor, Cosmos/CosmWasm, Wagmi, Viem
**AI/ML:** PyTorch, TensorFlow, LangChain, Diffusion models, Transformer architectures, Jupyter
**IaC Conventions:** CAF naming (Azure), GCP project conventions, Terratest, tflint, terrascan
**Patterns:** Clean Architecture, SOLID, DDD, CQRS, Saga, BFF, Microservices, Hexagonal, TDD, BDD

## RESPONSE FORMAT — COMPACT & DENSE

### 1. Direct Answer
One crisp paragraph. State the solution. No preamble like "Certainly!" or "Let me explain."

### 2. Tech Stack Summary Table (always include when multiple tools/choices exist)
| Concern | Recommended | Why |
|---|---|---|
| ... | ... | ... |

### 3. Primary Code Block
Correct fenced language tag. Full working example, all real values, no pseudocode.
- \`\`\`bash — az / gcloud / aws / kubectl / helm / terraform / ansible
- \`\`\`groovy — Jenkinsfile (Declarative AND Scripted side by side)
- \`\`\`yaml — Pipelines / K8s manifests / docker-compose
- \`\`\`java \`\`\`python \`\`\`typescript \`\`\`go \`\`\`rust — application code
- \`\`\`hcl — Terraform / Bicep IaC

### 4. Secondary Code Block (only when a different tool/angle adds real value)

### 5. Key Lines Explained
Tight inline comments or a compact bullet list. Not exhaustive prose.

### 6. Comparison / Tradeoffs Table (use when choosing between options)
| Option | Pros | Cons | Use when |
|---|---|---|---|

### 7. Security & Gotchas
3-5 bullets maximum. Real commands for IAM/RBAC. Real Key Vault / Secret Manager references.

## STRICT OUTPUT RULES
- NO openers like "Certainly!", "Great question!", "In this segment we will explore..."
- NO filler sentences. Every sentence must carry information.
- Use **bold** for key terms inline within sentences.
- Use tables whenever comparing options, listing resources, or showing configurations.
- Use \`inline code\` for all command names, resource names, env vars, file paths.
- Keep total response under 600 words unless code volume requires more.
- Code blocks: real values, ALL flags, real region names. Engineers must run this immediately.
- Jenkins: always show Declarative pipeline. Add Scripted only if meaningfully different.
- Secrets: never in env vars or code. Always Key Vault / Secret Manager reference.`,
    settings: {
      model: 'openai/gpt-4o',
      temperature: 0.15,
      max_tokens: 3500,
      frequency_penalty: 0.05,
      presence_penalty: 0.05
    }
  },

  SYSTEM_DESIGN_VIEWER: {
    name: 'System Design Viewer',
    systemPrompt: `You are a Staff Principal Cloud Architect operating under the following cursor.directory professional rules. You produce structured, deeply technical system design artifacts — not summaries. Every design must be unique to the conversation context, progressively more detailed than the previous one, and production-grade.

## CURSOR RULES IN EFFECT (cursor.directory/rules/azure + cloud + infrastructure-as-code)

### Identity & Scope
- Staff-level architect across Azure, GCP, multi-cloud, and on-prem hybrid
- Deep expertise: AKS, Azure Container Apps, API Management, Event-Driven Architecture, CQRS, Saga, GitOps, Service Mesh, Zero Trust, FinOps
- Outputs must be clean enough to paste directly into Confluence, Notion, or a design doc

### Architecture Principles (cursor.directory rules applied)
- Prefer event-driven microservices over synchronous coupling where scale matters
- Apply IaC to all resources: Terraform (remote GCS/Azure Blob backend, state locking, tflint + terrascan)
- Use GitOps for cluster state: ArgoCD or Flux with Helm charts
- Kubernetes: HPA + KEDA for scaling, NetworkPolicies for segmentation, Workload Identity for pod auth
- Never use service account keys — use Workload Identity Federation (GCP) or Managed Identity (Azure)
- Secrets: Key Vault (Azure) or Secret Manager (GCP) with CSI driver — never environment variables
- Monitoring: Azure Monitor + Log Analytics + Application Insights; GCP: Cloud Monitoring + Cloud Trace + Error Reporting
- Security: Zero Trust model, Private Endpoints, VNet injection, NSG rules, Cloud Armor / Azure Front Door WAF
- Cost: tag every resource (Environment, Workload, CostCenter, Owner); use committed use discounts / reserved instances

### CAF Naming (Azure Cloud Adoption Framework — mandatory)
- Resource Group: rg-{workload}-{env}-{region}
- AKS Cluster: aks-{workload}-{env}-{region}
- Container Registry: cr{workload}{env} (lowercase, no hyphens)
- Key Vault: kv-{workload}-{env} (max 24 chars)
- Storage Account: st{workload}{env}{region} (no hyphens, ≤24 chars, lowercase)
- Function App: func-{workload}-{env}-{region}
- Service Bus Namespace: sb-{workload}-{env}
- API Management: apim-{workload}-{env}-{region}
- Log Analytics: log-{workload}-{env}-{region}
- App Insights: appi-{workload}-{env}-{region}
- Virtual Network: vnet-{workload}-{env}-{region}
- Subnet: snet-{purpose}-{env}

### GCP Naming
- Project: {workload}-{env}-{random4}
- GKE Cluster: gke-{workload}-{env}-{region}
- Cloud Run service: {workload}-{service}-{env}
- Artifact Registry: ar-{workload}-{env}-{region}
- Pub/Sub Topic: {workload}-{event}-topic
- Secret: {workload}-{secret-name}

## RESPONSE STRUCTURE (always produce ALL sections)

## System Design: {Specific Descriptive Title Based On Conversation}

### Architecture Pattern
Name the pattern + one-line rationale. Patterns: Event-Driven Microservices, CQRS + Event Sourcing, Saga Orchestration, BFF, Strangler Fig, Hub-and-Spoke, Sidecar, Cell-Based, Hexagonal, Clean Architecture.

### Component Map
Detailed ASCII diagram. Show EVERY component, protocol, and data direction:

\`\`\`
[Client Browser / Mobile / CLI]
          |
          v  HTTPS/WSS (TLS 1.3)
[Azure Front Door + WAF (OWASP ruleset)]
          |
          v
[Azure API Management (Standard v2)]
    policies: rate-limit, JWT validate, CORS
          |
    ______|______
    |            |
    v            v
[AKS:          [AKS:
 svc-auth]      svc-core]   ← HPA: 2-20 replicas
    |               |
    v               v
[Entra ID      [Azure Service Bus
 Managed ID]    Topic: domain-events]
                    |
              ______|______
              |            |
              v            v
        [Azure Function:  [Azure Function:
         fn-processor]    fn-notifier]
              |
    __________|___________
    |                     |
    v                     v
[Azure OpenAI GPT-4o]  [Azure Cognitive Search
 (PTU deployment)       (Semantic ranker, RAG)]
              |
              v
    [Cosmos DB for NoSQL
     Container: domain-data
     Partition: /tenantId]
\`\`\`

### Data Flow
Numbered steps with product names, protocols, SLA impact:
1. ...

### Infrastructure as Code
Terraform snippet for the most critical resource in this design:

\`\`\`hcl
# Example: core resource with CAF naming, tags, and Key Vault secret reference
\`\`\`

### Key Design Decisions
- Pattern rationale
- Why this product was chosen over alternatives
- SLA target and how it is achieved

### CAF Resource Inventory
Full list with CAF-compliant names for every resource mentioned:
| Resource Type | CAF Name | SKU / Tier | Notes |
|---|---|---|---|

### Security Controls (Zero Trust)
- Identity & Access: Entra ID + Managed Identity + Workload Identity
- Network perimeter: Private Endpoints, NSG rules (explicit allow-list), VNet injection
- Secrets management: Key Vault CSI driver (no env vars ever)
- Data: CMK at rest, TLS 1.3 in transit, Transparent Data Encryption on DB
- Threat detection: Microsoft Defender for Cloud, Cloud Armor rules

### Scalability & Resilience
- Horizontal scaling: HPA + KEDA triggers
- Circuit breaker: Istio / Dapr sidecar pattern
- Multi-region: Active-Active vs Active-Passive (justify which)
- Failure modes and retry strategy (exponential backoff with jitter)
- RTO / RPO targets and how they are met

### FinOps & Cost Controls
- Reserved instances / committed use for predictable workloads
- KEDA scale-to-zero for event-driven Functions
- Resource tagging strategy for cost allocation
- Estimated monthly cost bracket for this architecture

### OOP / Domain Model
Class/interface hierarchy for the key domain services:

\`\`\`
[interfaces and implementations]
\`\`\`

### Improvement Over Previous Design
Explicitly state what was improved compared to the prior version. This design must be MORE complete and MORE correct each iteration.

ABSOLUTE RULES:
- Use ONLY real product names — never generic terms ("a database", "a queue")
- CAF naming on every single Azure resource
- Every section must be filled with specifics, not "TBD" or vague text
- Each successive design generated in the same session must add depth, fix gaps, and evolve the architecture`,
    settings: {
      model: 'openai/gpt-4o',
      temperature: 0.3,
      max_tokens: 3500,
      frequency_penalty: 0.05,
      presence_penalty: 0.05
    }
  }
};

// Fallback configuration for rate limits
const FALLBACK_CONFIG = {
  model: 'gpt-3.5-turbo-1106',
  temperature: 0.3,
  max_tokens: 400,
  frequency_penalty: 0.2,
  presence_penalty: 0.1
};

// Initialize team knowledge base
const initializeKnowledgeBase = async () => {
  try {
    // Try to load custom team data if available
    await teamKnowledge.loadTeamData('./team-data.json');
    console.log('Team knowledge base initialized');
  } catch (error) {
    console.log('Using default team knowledge base');
  }
};

initializeKnowledgeBase();

// Function to format AI response with rich HTML
const formatAIResponse = (analysis, agentName) => {
    let html = `<div class="ai-analysis">`;
    html += `<div class="agent-header">${agentName}</div>`;
    
    // Split by numbered or bulleted sections
    const sections = analysis.split(/\n(?=\d+\.\s+\*\*|#{1,3}\s+|\*\*)/);
    
    sections.forEach(section => {
        if (!section.trim()) return;
        
        // Handle main headers (## Header or **Header**)
        if (section.match(/^#{1,3}\s+(.+)|^\*\*(.+)\*\*:/)) {
            const headerMatch = section.match(/^#{1,3}\s+(.+)|^\*\*(.+)\*\*:/);
            const headerText = headerMatch[1] || headerMatch[2];
            
            html += `<div class="analysis-section">`;
            html += `<div class="section-header">${headerText.replace(/\*\*/g, '')}</div>`;
            
            // Process the content after the header
            const content = section.substring(headerMatch[0].length).trim();
            html += formatContent(content);
            html += `</div>`;
        }
        // Handle numbered sections (1. **Header**)
        else if (section.match(/^\d+\.\s+\*\*(.+)\*\*/)) {
            const match = section.match(/^(\d+)\.\s+\*\*(.+)\*\*:?\s*([\s\S]*)/);
            if (match) {
                html += `<div class="analysis-section">`;
                html += `<div class="section-header">${match[1]}. ${match[2]}</div>`;
                html += formatContent(match[3]);
                html += `</div>`;
            }
        } else {
            html += formatContent(section);
        }
    });
    
    html += `</div>`;
    return html;
};

// Helper function to format content
const formatContent = (content) => {
    if (!content) return '';
    
    let formatted = content;
    
    // Format bullet points with better structure
    formatted = formatted.replace(/^\s*[-•]\s+(.+)$/gm, (match, text) => {
        // Check if it's a key-value format
        if (text.includes(':') || text.includes('|')) {
            const separator = text.includes('|') ? '|' : ':';
            const parts = text.split(separator).map(p => p.trim());
            
            if (parts.length >= 2) {
                const label = parts[0];
                const value = parts.slice(1).join(separator);
                
                return `<div class="bullet-item">
<span class="bullet">•</span>
<span class="bullet-label">${label}:</span>
    <span class="bullet-value">${value}</span>
</div>`;
            }
        }
        
        return `<div class="bullet-item">
<span class="bullet">•</span>
    <span class="bullet-text">${text}</span>
</div>`;
    });

    // Format inline bold text
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Format inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Format line breaks
    formatted = formatted.replace(/\n\n/g, '</p><p>');
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Wrap in paragraph if not already wrapped
    if (!formatted.includes('<div') && !formatted.includes('<p>')) {
        formatted = `<p>${formatted}</p>`;
    }
    
    return formatted;
};

// Convert structured JSON to HTML for consistent, professional formatting
const formatStructuredResponse = (obj, agentName) => {
    const safeArray = (v) => Array.isArray(v) ? v : (v ? [String(v)] : []);
    const section = (title, items) => {
        if (!items || (Array.isArray(items) && items.length === 0)) return '';
        if (Array.isArray(items)) {
            const lis = items.map(it => `<div class="bullet-item"><span class="bullet">•</span><span class="bullet-text">${String(it)}</span></div>`).join('');
            return `<div class="analysis-section"><div class="section-header">${title}</div>${lis}</div>`;
        }
        return `<div class="analysis-section"><div class="section-header">${title}</div><p>${String(items)}</p></div>`;
    };
    let html = `<div class="ai-analysis"><div class="agent-header">${agentName}</div>`;
    if (obj.summary) {
        html += `<div class="analysis-section"><div class="section-header">Summary</div><p>${obj.summary}</p></div>`;
    }
    html += section('Key Points', safeArray(obj.key_points));
    html += section('Talking Points for You', safeArray(obj.talking_points));
    html += section('Questions to Ask', safeArray(obj.questions));
    if (obj.action_items && Array.isArray(obj.action_items)) {
        const list = obj.action_items.map(ai => {
            if (ai && typeof ai === 'object') {
                const parts = [ai.item || ai.text || ''];
                if (ai.owner) parts.push(`Owner: ${ai.owner}`);
                if (ai.due) parts.push(`Due: ${ai.due}`);
                return parts.filter(Boolean).join(' — ');
            }
            return String(ai);
        });
        html += section('Action Items', list);
    }
    html += section('Risks', safeArray(obj.risks));
    return html + '</div>';
};

// Remove repeated phrases and tidy whitespace for spoken paragraphs
const cleanParagraph = (text) => {
    if (!text) return '';

    // Preserve code blocks before cleaning prose
    const codeBlocks = [];
    const withPlaceholders = text.replace(/```[\s\S]*?```/g, (match) => {
        const idx = codeBlocks.length;
        codeBlocks.push(match);
        return `__CODE_BLOCK_${idx}__`;
    });

    // Clean prose sections only
    let t = withPlaceholders.replace(/[ \t]+/g, ' ').trim();
    t = t.replace(/\b(\w+)(\s+\1){1,}\b/gi, '$1');
    t = t.replace(/\s*\.(\s*\.)+/g, '.');

    // Collapse repeated sentences in prose (skip placeholder lines)
    const seen = new Set();
    const sentences = t.split(/(?<=[.!?])\s+/);
    const filtered = sentences.filter(s => {
        if (s.startsWith('__CODE_BLOCK_')) return true;
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    let cleaned = filtered.join(' ').trim();

    // Restore code blocks
    codeBlocks.forEach((block, idx) => {
        cleaned = cleaned.replace(`__CODE_BLOCK_${idx}__`, block);
    });

    return cleaned;
};

// Enhanced AI analysis with team context and rolling history
const analyzeWithAgent = async (text, roomId, agent = AI_AGENTS.MEETING_ANALYST, recentHistory = []) => {
    try {
        // Get or create room context
        if (!roomContexts.has(roomId)) {
            roomContexts.set(roomId, {
                meetingType: null,
                participants: new Set(),
                topics: new Set(),
                projectsMentioned: new Set(),
                decisions: [],
                actionItems: [],
                tags: new Set(),
                selectedBucket: null // 'n1', 'u1', or null for both
            });
        }
        
        const roomContext = roomContexts.get(roomId);
        
        // Extract tags from transcript
        const detectedTags = tagService.getAllTags(text);
        detectedTags.forEach(tag => roomContext.tags.add(tag));
        
        // Build tag context for AI
        const tagContext = tagService.buildTagContext(detectedTags);
        
        // Build context from team knowledge
        const contextAnalysis = teamKnowledge.buildContextPrompt(text);
        roomContext.meetingType = contextAnalysis.meetingType;
        
        // Update room context with entities
        contextAnalysis.entities.people.forEach(p => roomContext.participants.add(p));
        contextAnalysis.entities.projects.forEach(p => roomContext.projectsMentioned.add(p));
        contextAnalysis.entities.technologies.forEach(t => roomContext.topics.add(t));
        
        // SEARCH DOCUMENT KNOWLEDGE BASE
        let documentContext = null;
        let relevantDocs = [];
        try {
            // Determine bucket filter based on room context
            let bucketFilter = null;
            if (roomContext.selectedBucket === 'n1') {
                bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
            } else if (roomContext.selectedBucket === 'u1') {
                bucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
            }
            // If null, search both buckets (no filter)
            
            // Search for relevant documents based on current conversation
            relevantDocs = await documentService.searchDocuments(text, 5, bucketFilter);
            
            if (relevantDocs && relevantDocs.length > 0) {
                documentContext = {
                    found: true,
                    count: relevantDocs.length,
                    sources: relevantDocs.map(doc => ({
                        filename: doc.metadata.filename,
                        bucket: doc.metadata.bucket,
                        similarity: (doc.similarity * 100).toFixed(1)
                    })),
                    content: relevantDocs.map((doc, idx) => 
                        `[Document ${idx + 1}: ${doc.metadata.filename} (${(doc.similarity * 100).toFixed(1)}% match)]\n${doc.text}`
                    ).join('\n\n')
                };
                
                console.log(`[OK] Found ${relevantDocs.length} relevant documents for analysis`);
            }
        } catch (error) {
            console.warn('Document search failed:', error.message);
        }
        
        // Build enhanced prompt with team context and tags
        let enhancedPrompt = agent.systemPrompt + '\n\n';
        
        // ADD DOCUMENT CONTEXT AS PRIMARY SOURCE
        if (documentContext && documentContext.found) {
            enhancedPrompt += 'DOCUMENT CONTEXT (PRIMARY SOURCE OF TRUTH):\n';
            enhancedPrompt += '='.repeat(80) + '\n';
            enhancedPrompt += 'The following information comes from your organization\'s official documentation.\n';
            enhancedPrompt += 'USE THIS AS YOUR PRIMARY SOURCE when answering questions related to these topics.\n';
            enhancedPrompt += 'If the current discussion is DIRECTLY RELATED to the document content below, cite and explain based on these documents.\n';
            enhancedPrompt += 'If the discussion is NOT related to these documents, provide analysis as usual.\n\n';
            enhancedPrompt += documentContext.content + '\n';
            enhancedPrompt += '='.repeat(80) + '\n\n';
        }
        
        enhancedPrompt += 'Team Context:\n' + contextAnalysis.context + '\n\n';
        
        // Add tag context if present
        if (tagContext) {
            enhancedPrompt += 'Tag Context:\n' + tagContext + '\n\n';
            enhancedPrompt += 'Detected Tags: ' + detectedTags.join(', ') + '\n\n';
        }
        
        enhancedPrompt += 'Meeting Context:\n';
        enhancedPrompt += `- Meeting Type: ${roomContext.meetingType}\n`;
        enhancedPrompt += `- Participants: ${Array.from(roomContext.participants).join(', ')}\n`;
        enhancedPrompt += `- Projects Mentioned: ${Array.from(roomContext.projectsMentioned).join(', ')}\n`;
        enhancedPrompt += `- Technologies Discussed: ${Array.from(roomContext.topics).join(', ')}\n`;
        enhancedPrompt += `- Active Tags: ${Array.from(roomContext.tags).join(', ')}\n\n`;
        
        // For onboarding meetings, add specific context
        if (contextAnalysis.isOnboarding) {
            const onboardingContext = teamKnowledge.getOnboardingContext();
            enhancedPrompt += `\nOnboarding Context:\n`;
            enhancedPrompt += `- Current Week Tasks: ${onboardingContext.tasks.join(', ')}\n`;
            enhancedPrompt += `- Available Buddies: ${onboardingContext.buddies.join(', ')}\n`;
            enhancedPrompt += `- Key Resources: ${onboardingContext.resources.join(', ')}\n\n`;
        }
        
        // Build short rolling context from recent history
        const recentContext = recentHistory && recentHistory.length
            ? `Recent context (most recent first):\n${recentHistory.map((t,i)=>`[${i+1}] ${t}`).join('\n')}\n\n`
            : '';

        // Ask for structured JSON to ensure consistent formatting across blocks
        const jsonSchemaInstruction = `You must produce a single JSON object with the following shape:
{
  "summary": string,
  "key_points": string[],
  "talking_points": string[],
  "questions": string[],
  "action_items": Array<{"item": string, "owner"?: string, "due"?: string}>,
  "risks": string[]
}
Do not include any extra commentary or markdown; JSON only.`;

        const completion = await openai.chat.completions.create({
            ...agent.settings,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: enhancedPrompt },
                { role: 'user', content: `${recentContext}${jsonSchemaInstruction}\n\nAnalyze this conversation segment as if in a live interview. Keep it concise and actionable. Segment:\n\n${text}` }
            ]
        });

        let analysisHtml;
        let analysisText = '';
        try {
            const json = JSON.parse(completion.choices[0].message.content || '{}');
            analysisHtml = formatStructuredResponse(json, agent.name);
            analysisText = completion.choices[0].message.content || '';
        } catch (_) {
            const fallbackText = completion.choices[0].message.content || '';
            analysisHtml = formatAIResponse(fallbackText, agent.name);
            analysisText = fallbackText;
        }
        
        // ADD DOCUMENT ATTRIBUTION IF USED
        if (documentContext && documentContext.found) {
            const docBadge = `<div class="document-enhanced-badge">
                <span class="badge-icon">[OK]</span>
                <span class="badge-text">Document Enhanced</span>
                <div class="document-sources">
                    ${documentContext.sources.map(src => 
                        `<div class="doc-source">
                            <span class="doc-name">${src.filename}</span>
                            <span class="doc-similarity">${src.similarity}% match</span>
                        </div>`
                    ).join('')}
                </div>
            </div>`;
            
            analysisHtml = analysisHtml.replace('<div class="ai-analysis">', 
                `<div class="ai-analysis document-enhanced">${docBadge}`);
        }
        
        // Extract and store action items and decisions
        const actionItemMatches = analysisText.matchAll(/(?:action item|todo|task):\s*([^.]+)/gi);
        for (const match of actionItemMatches) {
            roomContext.actionItems.push({
                text: match[1].trim(),
                timestamp: new Date().toISOString(),
                segment: text.substring(0, 50) + '...',
                tags: detectedTags
            });
        }
        
        return {
            analysis: analysisHtml,
            agent: agent.name,
            context: contextAnalysis,
            tags: detectedTags,
            tagMetadata: detectedTags.map(tag => tagService.getTagMetadata(tag)),
            roomContext: {
                meetingType: roomContext.meetingType,
                participants: Array.from(roomContext.participants),
                topics: Array.from(roomContext.topics),
                actionItems: roomContext.actionItems.slice(-5), // Last 5 action items
                tags: Array.from(roomContext.tags)
            }
        };
        
    } catch (error) {
        console.error('Error with AI agent:', error);
        
        // Try fallback model
        try {
            const fallbackCompletion = await openai.chat.completions.create({
                ...FALLBACK_CONFIG,
                messages: [
                    {
                        role: "system",
                        content: agent.systemPrompt
                    },
                    {
                        role: "user",
                        content: text
                    }
                ]
            });
            
            return {
                analysis: formatAIResponse(fallbackCompletion.choices[0].message.content, agent.name),
                agent: agent.name,
                isFallback: true
            };
        } catch (fallbackError) {
            throw fallbackError;
        }
    }
};

// Speech-style single-paragraph reply using recent history for flow
const analyzeSpokenReply = async (text, roomId, agent = AI_AGENTS.SPOKEN_RESPONDER, recentHistory = [], lensName, useRAG = false) => {
    try {
        if (!roomContexts.has(roomId)) {
            roomContexts.set(roomId, {
                meetingType: null,
                participants: new Set(),
                topics: new Set(),
                projectsMentioned: new Set(),
                decisions: [],
                actionItems: [],
                tags: new Set(),
                selectedBucket: null
            });
        }

        const roomContext = roomContexts.get(roomId);
        const contextAnalysis = teamKnowledge.buildContextPrompt(text);
        const tagContext = tagService.buildTagContext(tagService.getAllTags(text));

        // SEARCH DOCUMENT KNOWLEDGE BASE (only if useRAG is true)
        let documentContext = null;
        let ragUsed = false;
        let ragSources = [];
        
        if (useRAG) {
            try {
                // Determine bucket filter based on room context
                let bucketFilter = null;
                console.log(`[analyzeSpokenReply] Room context selectedBucket: ${roomContext?.selectedBucket || 'null'}`);
                if (roomContext && roomContext.selectedBucket === 'n1') {
                    bucketFilter = process.env.GCS_BUCKET_N1 || 'syncscribe-n1';
                    console.log(`[OK] Searching N-1 bucket only: ${bucketFilter}`);
                } else if (roomContext && roomContext.selectedBucket === 'u1') {
                    bucketFilter = process.env.GCS_BUCKET_U1 || 'syncscribe-u1';
                    console.log(`[OK] Searching U-1 bucket only: ${bucketFilter}`);
                } else {
                    bucketFilter = null;
                    console.log(`[OK] Searching both buckets (no filter)`);
                }
                
                // Search for relevant documents
                console.log(`Calling documentService.searchDocuments() with bucketFilter: ${bucketFilter || 'null'}`);
                const relevantDocs = await documentService.searchDocuments(text, 3, bucketFilter);
                console.log(`[OK] Search returned ${relevantDocs?.length || 0} documents`);
                if (relevantDocs && relevantDocs.length > 0) {
                    console.log(`Document buckets found: ${relevantDocs.map(d => d.metadata?.bucket).join(', ')}`);
                }
                
                if (relevantDocs && relevantDocs.length > 0) {
                    ragUsed = true;
                    ragSources = relevantDocs.map(doc => ({
                        filename: doc.metadata.filename,
                        bucket: doc.metadata.bucket,
                        similarity: (doc.similarity * 100).toFixed(1)
                    }));
                    
                    documentContext = {
                        found: true,
                        count: relevantDocs.length,
                        sources: ragSources,
                        content: relevantDocs.map((doc, idx) => 
                            `[Reference ${idx + 1}: ${doc.metadata.filename} (${(doc.similarity * 100).toFixed(1)}% match)]\n${doc.text}`
                        ).join('\n\n')
                    };
                    
                    console.log(`[OK] Found ${relevantDocs.length} relevant documents`);
                    console.log(`Sources: ${ragSources.map(s => `${s.filename} (${s.similarity}%)`).join(', ')}`);
                } else {
                    console.log(`No relevant documents found`);
                    console.log(`      Similarity threshold: ${(documentService.minSimilarity * 100).toFixed(1)}%`);
                    console.log(`      Search query length: ${text.length} chars`);
                }
            } catch (error) {
                console.warn(`[X] Document search failed: ${error.message}`);
            }
        } else {
                console.log(`[OK] Skipping document search (useRAG=false)`);
        }

        const recentContext = recentHistory && recentHistory.length
            ? `Recent context (most recent first):\n${recentHistory.map((t,i)=>`[${i+1}] ${t}`).join('\n')}\n\n`
            : '';

        // Detect whether the segment is technical so the prompt can ask for depth
        const TECHNICAL_SIGNALS = [
            /\b(function|class|interface|type|const|let|var|async|await|import|export|return)\b/,
            /\b(algorithm|complexity|O\(|Big[- ]O|data structure|array|list|map|set|tree|graph|heap|queue|stack|hash)\b/i,
            /\b(API|REST|GraphQL|gRPC|endpoint|request|response|HTTP|websocket|socket)\b/i,
            /\b(database|SQL|query|index|schema|migration|ORM|NoSQL|Postgres|MySQL|MongoDB|Redis)\b/i,
            /\b(architecture|microservice|monolith|service|container|docker|kubernetes|k8s|deployment|CI\/CD|pipeline)\b/i,
            /\b(bug|error|exception|stack trace|debug|log|test|unit test|integration test|coverage)\b/i,
            /\b(performance|latency|throughput|cache|CDN|load balancer|scaling|memory|CPU|bottleneck)\b/i,
            /\b(security|auth|JWT|OAuth|encryption|hash|salt|XSS|CSRF|injection|RBAC)\b/i,
            /\b(design pattern|singleton|factory|observer|strategy|repository|MVC|MVVM|SOLID|DRY|KISS)\b/i,
            /\b(cloud|AWS|GCP|Azure|S3|GCS|Lambda|function|serverless|IAM|VPC|subnet)\b/i,
            /`{1,3}|```|\bcode\b|\bsnippet\b|\bimplementation\b|\brefactor\b/i,
        ];
        const isTechnical = TECHNICAL_SIGNALS.some(re => re.test(text));

        // Build system prompt
        let systemPrompt = agent.systemPrompt;
        if (lensName) {
            systemPrompt += `\n\nYou are acting with the lens of a ${lensName}. Apply that perspective to your answer.`;
        }
        
        // Add document context if found and useRAG is true
        if (useRAG && documentContext && documentContext.found) {
            systemPrompt += `\n\nDOCUMENT REFERENCES AVAILABLE:\nYou have access to relevant documentation from the organization's knowledge base. When the conversation relates to these documents, incorporate specific details and facts from them naturally into your response. Use these as authoritative references when relevant. If the conversation is NOT related to these documents, provide analysis as usual without forcing connections.\n\nIMPORTANT TAGGING INSTRUCTION:\nWhen you use information directly from the document references, wrap those specific sentences with [RAG_START] and [RAG_END] tags. Only tag complete sentences that are directly based on the document content. Do not tag general knowledge or your own analysis.\n\nExample:\n- General analysis here. [RAG_START]This specific practice is outlined in our documentation.[RAG_END] More general analysis.\n\nDocument Content:\n${documentContext.content}`;
        }

        const technicalInstruction = isTechnical
            ? `This segment is TECHNICAL. Respond with a direct answer, include a concrete code example (fenced with the correct language tag), explain the approach, and call out any important tradeoffs. Be specific and precise.`
            : `This segment is conversational. Respond as a single clear, flowing paragraph with concrete recommendations inline.`;

        const userPrompt = `${recentContext}${tagContext ? `Tag hints:\n${tagContext}\n\n` : ''}${technicalInstruction}${useRAG && documentContext && documentContext.found ? '\nWhen relevant, incorporate specific details from the provided document references and tag them with [RAG_START]...[RAG_END].' : ''}\n\nMeeting segment to respond to:\n${text}`;

        const run = async (settings) => {
            console.log(`[OK] Calling OpenRouter API (model: ${settings.model || agent.settings.model})...`);
            const startTime = Date.now();
            const result = await openRouterClient.chat.completions.create({
            ...settings,
                messages: [ 
                    { role: 'system', content: systemPrompt }, 
                    { role: 'user', content: userPrompt } 
                ]
        });
            const duration = Date.now() - startTime;
            console.log(`[OK] OpenAI API call completed in ${duration}ms`);
            return result;
        };

        let completion;
        try {
            completion = await run(agent.settings);
        } catch (e1) {
            console.warn(`[X] Primary model failed, retrying with fallback...`);
            try {
                const safer = { model: 'openai/gpt-4o-mini', temperature: 0.6, max_tokens: 1600 };
                completion = await run(safer);
            } catch (e2) {
                console.error(`[X] Fallback model also failed: ${e2.message}`);
                throw e2;
            }
        }

        const raw = (completion.choices?.[0]?.message?.content || '').trim();
        
        // Extract tags
        const detectedTags = tagService.getAllTags(text);
        detectedTags.forEach(tag => roomContext.tags.add(tag));
        
        return { 
            analysis: cleanParagraph(raw), 
            agent: agent.name, 
            isFallback: false,
            ragUsed: ragUsed,
            ragSources: ragSources,
            ragTag: ragUsed ? '+RAG' : null,
            tags: Array.from(roomContext.tags),
            tagMetadata: Array.from(roomContext.tags).map(tag => tagService.getTagMetadata(tag)),
            roomContext: {
                meetingType: roomContext.meetingType,
                participants: Array.from(roomContext.participants),
                topics: Array.from(roomContext.topics),
                actionItems: roomContext.actionItems.slice(-5),
                tags: Array.from(roomContext.tags)
            }
        };
    } catch (error) {
        console.error('[X] Error with spoken reply agent:', error);
        console.error('   Stack:', error.stack);
        throw error;
    }
};

// Socket.io connection handling
io.on('connection', (socket) => {
  // Support client requesting a stable room id across refresh via connection query
  const desiredRoomId = (socket.handshake && socket.handshake.query && socket.handshake.query.desiredRoomId) || '';
  if (desiredRoomId && typeof desiredRoomId === 'string') {
    try {
      // Override socket.id only for the purpose of room identity by aliasing
      // We keep socket.id unchanged, but we use desiredRoomId as the room key everywhere
      socket.join(desiredRoomId);
      socket.emit('room_alias', { roomId: desiredRoomId });
    } catch (_) {}
  }
  console.log('Client connected:', socket.id);
  let recognizeStream = null;
  let currentService = null;
  let audioBuffer = Buffer.alloc(0);
  let lastProcessTime = Date.now();
  const minProcessInterval = 2000; // Minimum 2 seconds between processing

  socket.on('start_transcription', async ({ roomId, service }) => {
    try {
      // Clean up existing stream if any
      if (recognizeStream) {
        recognizeStream.destroy();
        activeSessions.delete(roomId);
      }

      currentService = service;
      console.log(`Starting transcription with service: ${service}`);

      if (service === 'google') {
        recognizeStream = createGoogleStream(socket, roomId);
        activeSessions.set(roomId, recognizeStream);
      } else if (service === 'deepgram') {
        recognizeStream = createDeepgramStream(socket, roomId);
        activeSessions.set(roomId, recognizeStream);
      }

      socket.join(roomId);
      socket.emit('transcription_started');
      
      // Initialize room context
      if (!roomContexts.has(roomId)) {
        roomContexts.set(roomId, {
          meetingType: null,
          participants: new Set(),
          topics: new Set(),
          projectsMentioned: new Set(),
          decisions: [],
          actionItems: [],
          tags: new Set()
        });
      }
    } catch (error) {
      console.error('Error starting transcription:', error);
      socket.emit('transcription_error', { 
        message: 'Failed to start transcription',
        details: error.message 
      });
    }
  });

  socket.on('audio_data', async (data) => {
    try {
      const { roomId, audio, service } = data;
      const now = Date.now();
      
      if (service === 'google') {
        const stream = activeSessions.get(roomId);
        if (stream && !stream.destroyed) {
          const audioBuffer = Buffer.from(audio);
          stream.write(audioBuffer);
        }
      } else if (service === 'deepgram') {
        const stream = activeSessions.get(roomId);
        if (stream) {
          // Send raw 16-bit PCM bytes directly to Deepgram in reasonable chunks
          try {
            const buf = Buffer.from(audio);
            const MAX_CHUNK = 3200; // 100ms at 16kHz, 16-bit mono (2 bytes/sample)
            if (buf.length <= MAX_CHUNK) {
              stream.send(buf);
            } else {
              for (let offset = 0; offset < buf.length; offset += MAX_CHUNK) {
                const chunk = buf.subarray(offset, Math.min(offset + MAX_CHUNK, buf.length));
                stream.send(chunk);
              }
            }
          } catch (err) {
            console.error('Error forwarding audio to Deepgram:', err);
          }
        }
      } else if (service === 'openai') {
        try {
          // Accumulate audio data
          audioBuffer = Buffer.concat([audioBuffer, Buffer.from(audio)]);
          
          // Process when we have enough data and enough time has passed
          if (audioBuffer.length >= 32000 && (now - lastProcessTime) >= minProcessInterval) {
            // Get current room context for better transcription
            const roomContext = roomContexts.get(roomId) || {};
            const contextHint = Array.from(roomContext.topics || []).join(' ');
            
            // Process with enhanced Whisper
            const result = await processWithHybrid(audioBuffer, 'openai');
            if (result && result.text) {
              socket.emit('transcription', {
                text: result.text,
                isFinal: true,
                timestamp: new Date().toISOString(),
                service: 'openai',
                confidence: result.confidence || 0.9,
                speakerTag: 0
              });
            }
            
            // Reset buffer and update time
            audioBuffer = Buffer.alloc(0);
            lastProcessTime = now;
          }
        } catch (error) {
          console.error('OpenAI processing error:', error);
          socket.emit('transcription_error', {
            message: 'OpenAI processing error',
            details: error.message,
            service: 'openai'
          });
        }
      }
    } catch (error) {
      console.error('Error processing audio data:', error);
      socket.emit('transcription_error', { 
        message: 'Error processing audio',
        details: error.message 
      });
    }
  });

  socket.on('stop_transcription', (roomId) => {
    try {
      const stream = activeSessions.get(roomId);
      if (stream) {
        try {
          if (typeof stream.finish === 'function') {
            stream.finish();
          } else if (typeof stream.destroy === 'function') {
            stream.destroy();
          }
        } catch (_) {}
        activeSessions.delete(roomId);
      }
      socket.leave(roomId);
      socket.emit('transcription_stopped');
    } catch (error) {
      console.error('Error stopping transcription:', error);
    }
  });

  socket.on('stop_ai_processing', (roomId) => {
    try {
      // Clear any pending AI analysis timers
      const processingSession = aiProcessingSessions.get(roomId);
      if (processingSession) {
        if (processingSession.timer) {
          clearTimeout(processingSession.timer);
        }
        aiProcessingSessions.delete(roomId);
      }

      // Clear room context
      roomContexts.delete(roomId);

      console.log(`Stopped AI processing for room: ${roomId}`);
    } catch (error) {
      console.error('Error stopping AI processing:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (recognizeStream) {
      try {
        if (typeof recognizeStream.finish === 'function') {
          recognizeStream.finish();
        } else if (typeof recognizeStream.destroy === 'function') {
          recognizeStream.destroy();
        }
      } catch (_) {}
    }
    
    // Clean up AI processing on disconnect
    for (const [roomId, session] of aiProcessingSessions.entries()) {
      if (session.socketId === socket.id) {
        if (session.timer) {
          clearTimeout(session.timer);
        }
        aiProcessingSessions.delete(roomId);
        roomContexts.delete(roomId);
      }
    }
  });

  socket.on('process_with_ai', async (data) => {
    // Explicitly handle useRAG to avoid default value issues
    const useRAG = data.useRAG === true || data.useRAG === 'true' || data.useRAG === 1;
    const { text, roomId, agentType = 'MEETING_ANALYST', blockId } = data;
    
    // Use socket ID as fallback if roomId is empty
    const effectiveRoomId = roomId || socket.id;
    
    // Log received data for debugging
    console.log(`\n[SERVER] Received process_with_ai request:`);
    console.log(`   Raw useRAG parameter: ${data.useRAG} (type: ${typeof data.useRAG})`);
    console.log(`   Processed useRAG: ${useRAG} (type: ${typeof useRAG})`);
    console.log(`   roomId from data: ${roomId || 'EMPTY!'}`);
    console.log(`   socket.id: ${socket.id}`);
    console.log(`   effectiveRoomId: ${effectiveRoomId}`);
    
    try {
        const agent = AI_AGENTS[agentType] || AI_AGENTS.MEETING_ANALYST;
        // Maintain rolling history per room (use effectiveRoomId)
        if (!transcriptsByRoom.has(effectiveRoomId)) transcriptsByRoom.set(effectiveRoomId, []);
        const roomTranscripts = transcriptsByRoom.get(effectiveRoomId);
        roomTranscripts.push({ text, ts: Date.now(), blockId });
        // Keep last 20 blocks for context
        if (roomTranscripts.length > 20) roomTranscripts.splice(0, roomTranscripts.length - 20);
        const recent = roomTranscripts.slice(-4, -0).reverse().map(t => t.text).slice(0, 3);

        console.log(`\n[${new Date().toISOString()}] Starting AI analysis for block ${blockId}`);
        console.log(`   Text length: ${text.length} chars`);
        console.log(`   Agent: ${agent.name}`);
        console.log(`   Recent history: ${recent.length} blocks`);
        console.log(`   Analysis mode: ${useRAG ? 'Document-Enhanced (RAG)' : 'Original (Standard)'}`);

        // Ensure room context exists (use effectiveRoomId)
        if (!roomContexts.has(effectiveRoomId)) {
          roomContexts.set(effectiveRoomId, {
            meetingType: null,
            participants: new Set(),
            topics: new Set(),
            projectsMentioned: new Set(),
            decisions: [],
            actionItems: [],
            tags: new Set(),
            selectedBucket: null
          });
        }
        
        // Get room context for bucket filtering (use effectiveRoomId)
        const roomContext = roomContexts.get(effectiveRoomId);
        console.log(`Room context bucket selection: ${roomContext?.selectedBucket || 'null'} (roomId: ${effectiveRoomId})`);
        const bucketInfo = roomContext?.selectedBucket ? ` (bucket: ${roomContext.selectedBucket})` : ' (all buckets)';
        console.log(`Bucket info:${bucketInfo}`);
        
        if (useRAG) {
            // STEP: Generate Document-Enhanced analysis (with RAG)
            console.log(`[OK] Generating document-enhanced analysis...`);
            console.log(`RAG search config:${bucketInfo}`);
            
            const ragResult = await analyzeSpokenReply(text, effectiveRoomId, AI_AGENTS.SPOKEN_RESPONDER, recent, agent.name, true);
            
            console.log(`[OK] RAG search result: ragUsed=${ragResult.ragUsed}, sources=${ragResult.ragSources.length}`);
            
            if (ragResult.ragUsed && ragResult.ragSources.length > 0) {
                console.log(`[OK] Document-enhanced analysis generated (${ragResult.analysis.length} chars)`);
                console.log(`Sources used: ${ragResult.ragSources.map(s => `${s.filename} (${s.similarity}%)`).join(', ')}`);
                
                // Send document-enhanced analysis
                socket.emit('ai_response', { 
                    text: ragResult.analysis,
                    context: text,
                    timestamp: new Date().toISOString(),
                    analysisType: 'document-enhanced',
                    agent: ragResult.agent,
                    roomContext: ragResult.roomContext,
                    tags: ragResult.tags,
                    tagMetadata: ragResult.tagMetadata,
                    isFormatted: false,
                    isFallback: ragResult.isFallback,
                    blockId,
                    ragUsed: true,
                    ragSources: ragResult.ragSources,
                    ragTag: '+RAG'
                });
            } else {
                console.log(`[X] No relevant documents found`);
                // Send fallback message when RAG is requested but no documents found
                socket.emit('ai_response', {
                    text: 'No relevant documents found in the knowledge base for this conversation segment.',
                    context: text,
                    timestamp: new Date().toISOString(),
                    analysisType: 'document-enhanced',
                    agent: agent.name,
                    isFormatted: false,
                    isFallback: true,
                    blockId,
                    ragUsed: false,
                    ragSources: [],
                    ragTag: null
                });
            }
        } else {
            // STEP: Generate ORIGINAL analysis (without RAG)
            console.log(`[OK] Generating original analysis (without RAG)...`);
            const originalResult = await analyzeSpokenReply(text, effectiveRoomId, AI_AGENTS.SPOKEN_RESPONDER, recent, agent.name, false);
            
            console.log(`[OK] Original analysis generated (${originalResult.analysis.length} chars)`);
            
            // Send original analysis
            socket.emit('ai_response', { 
                text: originalResult.analysis,
                context: text,
                timestamp: new Date().toISOString(),
                analysisType: 'original',
                agent: originalResult.agent,
                roomContext: originalResult.roomContext,
                tags: originalResult.tags,
                tagMetadata: originalResult.tagMetadata,
                isFormatted: false,
                isFallback: originalResult.isFallback,
                blockId,
                ragUsed: false,
                ragSources: [],
                ragTag: null
            });
        }
        
        console.log(`[OK] Analysis complete for block ${blockId}\n`);
        
        } catch (error) {
        console.error('[X] Error with AI processing:', error);
        console.error('   Stack:', error.stack);
        
        // Send plain single-paragraph fallback (no bullets/headings)
        const sanitized = (text || '')
          .replace(/[\r\n]+/g, ' ')
          .replace(/\s*[-•]\s+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const paragraph = sanitized
          ? `From this part of the conversation, I understand ${sanitized}. We will resume detailed analysis shortly; for now, treat this as an interim spoken summary.`
          : 'The analysis service is temporarily unavailable and will resume shortly.';
        socket.emit('ai_response', {
          text: paragraph,
          isError: true,
          isFormatted: false,
          agent: 'System',
          analysisType: 'error',
          ragUsed: false,
          ragSources: [],
          ragTag: null,
          timestamp: new Date().toISOString()
        });
    }
  });

  // ── Code Deep Dive ───────────────────────────────────────────────────────
  socket.on('process_code_deep_dive', async (data) => {
    const { text, roomId, blockId } = data;
    const effectiveRoomId = roomId || socket.id;
    console.log(`[CODE_DEEP_DIVE] Block ${blockId} (room ${effectiveRoomId})`);
    try {
      if (!roomContexts.has(effectiveRoomId)) {
        roomContexts.set(effectiveRoomId, {
          meetingType: null, participants: new Set(), topics: new Set(),
          projectsMentioned: new Set(), decisions: [], actionItems: [],
          tags: new Set(), selectedBucket: null
        });
      }
      const agent = AI_AGENTS.CODE_DEEP_DIVE;
      const completion = await openRouterClient.chat.completions.create({
        ...agent.settings,
        messages: [
          { role: 'system', content: agent.systemPrompt },
          { role: 'user', content: `Meeting segment:\n${text}\n\nProvide the full code deep dive response as described.` }
        ]
      });
      const result = (completion.choices?.[0]?.message?.content || '').trim();
      socket.emit('code_deep_dive_response', {
        text: result,
        blockId,
        timestamp: new Date().toISOString(),
        agent: agent.name
      });
      console.log(`[CODE_DEEP_DIVE] Done for block ${blockId} (${result.length} chars)`);
    } catch (err) {
      console.error('[CODE_DEEP_DIVE] Error:', err.message);
      socket.emit('code_deep_dive_response', {
        text: `Code Deep Dive unavailable: ${err.message}`,
        blockId,
        timestamp: new Date().toISOString(),
        agent: 'Code Deep Dive',
        isError: true
      });
    }
  });

  // ── System Design Viewer ─────────────────────────────────────────────────
  // Counter per room; also store the last design text for the improvement loop
  const systemDesignCounters = new Map();
  const systemDesignHistory = new Map(); // roomId -> last design text

  socket.on('process_system_design', async (data) => {
    const { text, roomId, blockId, recentBlocks = [] } = data;
    const effectiveRoomId = roomId || socket.id;

    // Maintain counter — emit design on 1st block, then every 3rd
    const prev = systemDesignCounters.get(effectiveRoomId) || 0;
    const next = prev + 1;
    systemDesignCounters.set(effectiveRoomId, next);
    const shouldGenerate = next === 1 || next % 3 === 0;
    if (!shouldGenerate) {
      console.log(`[SYSTEM_DESIGN] Skipping block ${blockId} (counter ${next})`);
      return;
    }

    console.log(`[SYSTEM_DESIGN] Generating iteration #${next} for block ${blockId}`);

    // Build cumulative conversation context
    const conversationContext = recentBlocks.length
      ? `Recent conversation (most recent last):\n${recentBlocks.slice(-8).map((t, i) => `[${i+1}] ${t}`).join('\n')}\n\nLatest segment:\n${text}`
      : `Meeting segment:\n${text}`;

    // Fetch previous design for the improvement loop
    const previousDesign = systemDesignHistory.get(effectiveRoomId);
    const previousDesignSection = previousDesign
      ? `\n\n---\nPREVIOUS DESIGN (iteration #${next - 1} — you MUST improve upon this):\n${previousDesign}`
      : '';

    const userPrompt = `${conversationContext}${previousDesignSection}

Produce iteration #${next} of the system design. ${next > 1 ? 'This must be measurably more complete, more specific, and more technically accurate than the previous design. Explicitly state what improved in the "Improvement Over Previous Design" section.' : 'This is the first design — establish a strong, complete baseline.'}`;

    try {
      const agent = AI_AGENTS.SYSTEM_DESIGN_VIEWER;
      const completion = await openRouterClient.chat.completions.create({
        ...agent.settings,
        messages: [
          { role: 'system', content: agent.systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
      const result = (completion.choices?.[0]?.message?.content || '').trim();

      // Store for next iteration's improvement loop
      systemDesignHistory.set(effectiveRoomId, result);

      socket.emit('system_design_response', {
        text: result,
        blockId,
        timestamp: new Date().toISOString(),
        agent: agent.name,
        counter: next
      });
      console.log(`[SYSTEM_DESIGN] Iteration #${next} done for block ${blockId} (${result.length} chars)`);
    } catch (err) {
      console.error('[SYSTEM_DESIGN] Error:', err.message);
      socket.emit('system_design_response', {
        text: `System Design generation unavailable: ${err.message}`,
        blockId,
        timestamp: new Date().toISOString(),
        agent: 'System Design Viewer',
        isError: true
      });
    }
  });

  // Add endpoint to get current room context
  socket.on('get_room_context', (roomId) => {
    const context = roomContexts.get(roomId);
    if (context) {
      socket.emit('room_context', {
        roomId,
        meetingType: context.meetingType,
        participants: Array.from(context.participants),
        topics: Array.from(context.topics),
        projectsMentioned: Array.from(context.projectsMentioned),
        actionItems: context.actionItems,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Add endpoint to switch AI agents
  socket.on('switch_agent', (data) => {
    const { roomId, agentType } = data;
    console.log(`Switching to ${agentType} agent for room ${roomId}`);
    socket.emit('agent_switched', { agentType });
  });

  // Add endpoint to select document bucket for RAG
  socket.on('select_document_bucket', (data) => {
    const { roomId, bucket } = data; // bucket: 'n1', 'u1', or null for both
    
    // Use socket ID as fallback if roomId is empty
    const effectiveRoomId = roomId || socket.id;
    console.log(`[SERVER] Received select_document_bucket: bucket=${bucket}, roomId=${roomId || 'empty'}, effectiveRoomId=${effectiveRoomId}`);
    
    if (!roomContexts.has(effectiveRoomId)) {
      roomContexts.set(effectiveRoomId, {
        meetingType: null,
        participants: new Set(),
        topics: new Set(),
        projectsMentioned: new Set(),
        decisions: [],
        actionItems: [],
        tags: new Set(),
        selectedBucket: null
      });
    }
    const roomContext = roomContexts.get(effectiveRoomId);
    roomContext.selectedBucket = bucket;
    const bucketName = bucket === 'n1' 
      ? (process.env.GCS_BUCKET_N1 || 'syncscribe-n1')
      : bucket === 'u1'
      ? (process.env.GCS_BUCKET_U1 || 'syncscribe-u1')
      : 'both';
    console.log(`[OK] Document bucket set to ${bucketName} (${bucket || 'both'}) for room ${effectiveRoomId}`);
    console.log(`Room context now has selectedBucket: ${roomContext.selectedBucket}`);
    socket.emit('bucket_selected', { bucket, roomId: effectiveRoomId });
  });

  // Add endpoint to manage tags
  socket.on('add_custom_tag', async (data) => {
    const { category, name, metadata } = data;
    try {
      await tagService.addCustomTag(category, name, metadata);
      socket.emit('tag_added', { success: true, tag: `${category}:${name}` });
    } catch (error) {
      socket.emit('tag_error', { error: error.message });
    }
  });

  socket.on('get_tag_analytics', async (roomId) => {
    const context = roomContexts.get(roomId);
    if (context && context.tags) {
      const analytics = {
        currentTags: Array.from(context.tags),
        tagMetadata: Array.from(context.tags).map(tag => tagService.getTagMetadata(tag)),
        frequency: {}
      };
      
      // Count tag frequency in current session
      context.tags.forEach(tag => {
        analytics.frequency[tag] = (analytics.frequency[tag] || 0) + 1;
      });
      
      socket.emit('tag_analytics', analytics);
    }
  });
});

const startServer = (port) => {
  server.listen(port)
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is busy, trying ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error('Server error:', err);
      }
    })
    .on('listening', () => {
      console.log(`Server running on port ${port}`);
      console.log('Available AI Agents:', Object.keys(AI_AGENTS).join(', '));
    });
};

// Start the server
const PORT = process.env.PORT || 5002;
startServer(PORT);

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Cleaning up...');
  for (const [_, stream] of activeSessions.entries()) {
    if (stream) {
      try {
        if (typeof stream.finish === 'function') {
          stream.finish();
        } else if (typeof stream.destroy === 'function') {
          stream.destroy();
        }
      } catch (_) {}
    }
  }
  server.close(() => {
    process.exit(0);
  });
});