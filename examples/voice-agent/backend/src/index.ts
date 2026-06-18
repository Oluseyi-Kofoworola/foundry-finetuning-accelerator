/**
 * Acme Health - Voice Agent Backend Server
 * 
 * Main entry point for the voice agent backend.
 * Provides REST API and WebSocket endpoints.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { logger } from './utils/logger.js';
import { getConfig, loadConfig } from './utils/config.js';
import { registerAllTools, toolRegistry } from './tools/index.js';
import { registerBuiltInScenarios, scenarioEngine } from './scenarios/index.js';
import { sessionManager, sessionCache, assistantsService } from './services/index.js';
import { chatService } from './services/chat.js';
import { chatAIService } from './services/chat-ai.js';
import { VoiceAgentWebSocketServer } from './middleware/websocket.js';
import { upload, processUploadedFile, cleanupOldFiles } from './middleware/upload.js';
import { mintEphemeralSession, executeToolForSession } from './services/realtime-webrtc.js';
import { foundryTracing } from './services/foundry-tracing.js';
import { ACME_GOLDEN_SET } from './services/foundry-evaluations.js';
import { SCENARIO_COLLECTIONS } from './services/foundry-knowledge.js';
import type { ApiResponse, HealthCheckResponse } from './types/index.js';

// =============================================================================
// APPLICATION SETUP
// =============================================================================

async function main() {
  // Load configuration
  const config = loadConfig();

  // Initialize express app
  const app = express();

  // Response compression for better performance
  app.use(compression());

  // Request timing middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (duration > 1000) {
        logger.warn('Slow request detected', {
          method: req.method,
          path: req.path,
          duration: `${duration}ms`,
        });
      }
    });
    next();
  });

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
  }));

  // CORS configuration
  app.use(cors({
    origin: config.security.corsOrigins,
    credentials: true,
  }));

  // Body parsing with limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Cache control middleware for static responses
  app.use((req, res, next) => {
    // Add cache headers for GET requests to scenarios and tools
    if (req.method === 'GET' && (req.path.includes('/api/scenarios') || req.path.includes('/api/tools'))) {
      res.set('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
    }
    next();
  });

  // =============================================================================
  // REST API ENDPOINTS
  // =============================================================================

  /**
   * Health check endpoint
   */
  app.get('/health', (req, res) => {
    const stats = sessionManager.getStats();
    const memUsage = process.memoryUsage();

    // Check if either OpenAI or Azure OpenAI is configured
    const hasOpenAIConfig = config.openai.useAzure 
      ? !!(config.openai.azureEndpoint && config.openai.azureApiKey)
      : !!config.openai.apiKey;

    const response: ApiResponse<HealthCheckResponse> = {
      success: true,
      data: {
        status: 'healthy',
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        checks: {
          openai: hasOpenAIConfig,
          memory: {
            used: memUsage.heapUsed,
            total: memUsage.heapTotal,
          },
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    // Don't cache health check
    res.set('Cache-Control', 'no-store');
    res.json(response);
  });

  /**
   * Get available scenarios
   */
  app.get('/api/scenarios', (req, res) => {
    const scenarios = scenarioEngine.getScenarioList();

    const response: ApiResponse = {
      success: true,
      data: { scenarios },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    res.json(response);
  });

  /**
   * Get scenario details
   */
  app.get('/api/scenarios/:id', (req, res) => {
    const scenario = scenarioEngine.get(req.params.id);

    if (!scenario) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'SCENARIO_NOT_FOUND',
          message: `Scenario '${req.params.id}' not found`,
        },
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        conversationStarters: scenario.conversationStarters,
        metadata: scenario.metadata,
        enabledTools: scenario.enabledTools,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    return res.json(response);
  });

  /**
   * Get available tools
   */
  app.get('/api/tools', (req, res) => {
    const tools = toolRegistry.getSummary();

    const response: ApiResponse = {
      success: true,
      data: { tools },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    res.json(response);
  });

  /**
   * Get session statistics
   */
  app.get('/api/stats', (req, res) => {
    const stats = sessionManager.getStats();
    const cacheStats = sessionCache.getStats();

    const response: ApiResponse = {
      success: true,
      data: { 
        stats,
        cache: cacheStats,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    res.json(response);
  });

  // =============================================================================
  // FOUNDRY INSPECTION ENDPOINT
  // =============================================================================

  /**
   * Surfaces the runtime state of the Foundry capability map: which services
   * are configured, what scenario→knowledge-collection scoping is in effect,
   * and the full ACME_GOLDEN_SET that the evaluator will score against.
   * Used by the demo UI and by reviewers to confirm that tracing,
   * content-safety, knowledge, and evals are actually wired.
   */
  app.get('/api/foundry/status', (req, res) => {
    const response: ApiResponse = {
      success: true,
      data: {
        tracing: {
          appInsightsConfigured: !!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
          mode: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
            ? 'opentelemetry-or-log-based'
            : 'log-based',
        },
        knowledge: {
          aiSearchConfigured: !!process.env.AZURE_SEARCH_ENDPOINT,
          endpoint: process.env.AZURE_SEARCH_ENDPOINT ? 'configured' : 'unset',
          defaultIndex: process.env.AZURE_SEARCH_INDEX || 'acme-knowledge',
          scenarioCollections: SCENARIO_COLLECTIONS,
        },
        contentSafety: {
          configured: !!process.env.CONTENT_SAFETY_ENDPOINT,
          promptShieldEnabled: (process.env.PROMPT_SHIELD_ENABLED || 'true') === 'true',
          contentSafetyEnabled: (process.env.CONTENT_SAFETY_ENABLED || 'true') === 'true',
          // Local fallback patterns are always on; useful info for demos.
          localPatternsActive: true,
        },
        evaluations: {
          goldenCaseCount: ACME_GOLDEN_SET.length,
          cases: ACME_GOLDEN_SET.map((c) => ({
            id: c.id,
            scenarioId: c.scenarioId,
            description: c.description,
            mustEscalate: !!c.expect.mustEscalate,
            requiresGrounding: !!c.expect.requiresGrounding,
          })),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'none',
      },
    };
    res.json(response);
  });

  // =============================================================================
  // CHAT API ENDPOINTS
  // =============================================================================

  /**
   * Create a new chat session
   */
  app.post('/api/chat/sessions', (req, res) => {
    const { scenarioId } = req.body;
    const session = chatService.createSession(scenarioId);

    const response: ApiResponse = {
      success: true,
      data: { session },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    res.status(201).json(response);
  });

  /**
   * Get chat session
   */
  app.get('/api/chat/sessions/:sessionId', (req, res) => {
    const session = chatService.getSession(req.params.sessionId);

    if (!session) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `Chat session '${req.params.sessionId}' not found`,
        },
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: { session },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    return res.json(response);
  });

  /**
   * Get chat messages
   */
  app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const messages = chatService.getMessages(req.params.sessionId, limit);

    const response: ApiResponse = {
      success: true,
      data: { messages },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    res.json(response);
  });

  /**
   * Send a chat message (with optional file attachments)
   */
  app.post('/api/chat/sessions/:sessionId/messages', upload.array('files', 5), async (req, res) => {
    const { sessionId } = req.params;
    const { content } = req.body;
    const files = req.files as Express.Multer.File[] || [];

    const session = chatService.getSession(sessionId);
    if (!session) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `Chat session '${sessionId}' not found`,
        },
      };
      return res.status(404).json(response);
    }

    // Get base URL for file URLs
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // Process uploaded files
    const uploadedFiles = files.map((f) => processUploadedFile(f, baseUrl));

    // Add user message
    const userMessage = chatService.addMessage(sessionId, 'user', content || '', uploadedFiles);

    // Generate AI response using the chat AI service
    const conversationHistory = chatService.getMessages(sessionId).map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));
    
    const aiResponse = await chatAIService.generateResponse(
      sessionId,
      content || '',
      conversationHistory.slice(0, -1) // Exclude the message we just added
    );
    const assistantMessage = chatService.addMessage(sessionId, 'assistant', aiResponse);

    const response: ApiResponse = {
      success: true,
      data: {
        userMessage,
        assistantMessage,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    return res.status(201).json(response);
  });

  // =============================================================================
  // REALTIME WEBRTC TRANSPORT
  // =============================================================================
  // Browser opens a direct WebRTC peer to Azure OpenAI. Backend stays
  // authoritative for: (1) minting the short-lived ephemeral key, and
  // (2) executing tool calls so PHI never leaves the server.

  /**
   * Mint an ephemeral realtime session for the browser to use as the SDP
   * bearer. Also returns the deployment, region endpoint, and the full
   * session.update payload the browser should send on the data channel.
   */
  app.post('/api/realtime/session', async (req, res) => {
    try {
      const { scenarioId } = req.body as { scenarioId?: string };

      // Resolution chain: explicit body → currently-active → demo default
      // → first registered. The chain matters because nothing is "active"
      // on a fresh server, so without a fallback the first WebRTC connect
      // 400s with SCENARIO_NOT_FOUND.
      let scenario = scenarioId ? scenarioEngine.get(scenarioId) : undefined;
      if (!scenario) scenario = scenarioEngine.getActive() ?? undefined;
      if (!scenario) {
        const fallbackId = config.demo.defaultScenario;
        scenario = scenarioEngine.get(fallbackId) ?? scenarioEngine.getAll()[0];
      }

      if (!scenario) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'SCENARIO_NOT_FOUND',
            message: `Unknown scenario: ${scenarioId ?? '(none active)'}`,
          },
        });
      }

      // Make this the active scenario going forward so subsequent connects
      // and chat sessions inherit the operator's pick.
      try { scenarioEngine.activate(scenario.id); } catch { /* already active */ }

      const session = await sessionManager.create(scenario.id);
      const minted = await mintEphemeralSession(session.id, scenario);

      const response: ApiResponse = {
        success: true,
        data: {
          sessionId: minted.sessionId,
          clientSecret: minted.clientSecret,
          expiresAt: minted.expiresAt,
          deployment: minted.deployment,
          webrtcUrl: minted.webrtcUrl,
          sessionConfig: minted.sessionConfig,
          scenario: {
            id: scenario.id,
            name: scenario.name,
            conversationStarters: scenario.conversationStarters ?? [],
            requiresConsent: config.security.requireConsent,
            consentMessage: config.security.requireConsent
              ? 'This call may be recorded for quality and security. Continue?'
              : undefined,
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: (req.headers['x-request-id'] as string) || 'none',
        },
      };

      return res.status(201).json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mint realtime session';
      logger.error('Realtime session mint failed', { error: message });
      return res.status(500).json({
        success: false,
        error: { code: 'REALTIME_MINT_FAILED', message },
      });
    }
  });

  /**
   * Execute a tool call on behalf of an active realtime session. Browser
   * posts the function_call_arguments.done payload here; we run it through
   * the existing tool registry (with audit logging + member context
   * propagation) and return the raw JSON the browser will hand back to the
   * model on the data channel.
   */
  app.post('/api/realtime/tool', async (req, res) => {
    const { sessionId, name, arguments: argsRaw } = req.body as {
      sessionId?: string;
      name?: string;
      arguments?: unknown;
    };

    if (!sessionId || !name) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'sessionId and name are required.' },
      });
    }

    let args: Record<string, unknown> = {};
    if (typeof argsRaw === 'string') {
      try { args = JSON.parse(argsRaw); } catch { args = {}; }
    } else if (argsRaw && typeof argsRaw === 'object') {
      args = argsRaw as Record<string, unknown>;
    }

    const result = await executeToolForSession(sessionId, name, args);
    return res.status(200).json({ success: true, data: result });
  });

  /**
   * Upload files
   */
  app.post('/api/files', upload.array('files', 5), (req, res) => {
    const files = req.files as Express.Multer.File[] || [];
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const uploadedFiles = files.map((f) => processUploadedFile(f, baseUrl));

    const response: ApiResponse = {
      success: true,
      data: { files: uploadedFiles },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    res.status(201).json(response);
  });

  /**
   * Get/serve uploaded file
   */
  app.get('/api/files/:filename', (req, res) => {
    const uploadsDir = process.env.UPLOADS_DIR || '/tmp/uploads';
    const filePath = path.join(uploadsDir, req.params.filename);

    // Security: prevent directory traversal
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'File not found' },
      });
    }

    return res.sendFile(filePath);
  });

  /**
   * API information
   */
  app.get('/api', (req, res) => {
    const response: ApiResponse = {
      success: true,
      data: {
        name: `${config.brand.productName} API`,
        version: process.env.npm_package_version || '1.0.0',
        description: `Enterprise-grade ${config.brand.industry} voice agent backend`,
        endpoints: {
          health: '/health',
          scenarios: '/api/scenarios',
          tools: '/api/tools',
          stats: '/api/stats',
          chat: '/api/chat/sessions',
          files: '/api/files',
          websocket: '/ws',
        },
        demoMode: config.demo.demoMode,
        mockToolsEnabled: config.demo.useMockTools,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    res.json(response);
  });

  // =============================================================================
  // ASSISTANTS API ENDPOINTS (Multi-Agent Mode)
  // =============================================================================

  /**
   * Initialize Assistants API service
   */
  if (config.azure?.useAssistants) {
    logger.info('Initializing Assistants API for multi-agent mode...');
    await assistantsService.initialize();
  }

  /**
   * Get available agents
   */
  app.get('/api/agents', (req, res) => {
    const agents = assistantsService.getAgents();
    
    const response: ApiResponse = {
      success: true,
      data: {
        available: assistantsService.isReady(),
        agents: agents ? Object.entries(agents).map(([key, agent]) => ({
          key,
          name: agent.name,
          tools_count: agent.tools_count,
        })) : [],
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'none',
      },
    };

    res.json(response);
  });

  /**
   * Chat with the multi-agent system
   */
  app.post('/api/agents/chat', async (req, res) => {
    const { sessionId, message, memberId, verified } = req.body;

    if (!sessionId || !message) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'sessionId and message are required',
        },
      };
      return res.status(400).json(response);
    }

    if (!assistantsService.isReady()) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Assistants API is not initialized. Set USE_ASSISTANTS_API=true and ensure agent-ids.json exists.',
        },
      };
      return res.status(503).json(response);
    }

    try {
      const reply = await assistantsService.chat(sessionId, message, {
        memberId,
        verified: verified === true,
      });

      const response: ApiResponse = {
        success: true,
        data: {
          sessionId,
          message: reply,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'none',
        },
      };

      return res.json(response);
    } catch (error) {
      logger.error('Assistants chat error', { sessionId, error });
      
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'CHAT_ERROR',
          message: error instanceof Error ? error.message : 'Chat failed',
        },
      };
      return res.status(500).json(response);
    }
  });

  /**
   * Clear agent session/thread
   */
  app.delete('/api/agents/sessions/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    try {
      await assistantsService.clearSession(sessionId);
      
      const response: ApiResponse = {
        success: true,
        data: { sessionId, cleared: true },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'none',
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to clear session', { sessionId, error });
      
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'CLEAR_SESSION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to clear session',
        },
      };
      res.status(500).json(response);
    }
  });

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================

  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
    });

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: config.nodeEnv === 'production' 
          ? 'An internal error occurred'
          : err.message,
      },
    };

    res.status(500).json(response);
  });

  // =============================================================================
  // SERVER STARTUP
  // =============================================================================

  // Create HTTP server
  const server = createServer(app);

  // Initialize WebSocket server
  const wsServer = new VoiceAgentWebSocketServer(server);

  // Register tools and scenarios
  registerAllTools();
  registerBuiltInScenarios();

  // Initialize Foundry tracing (App Insights bridge) before accepting traffic.
  // No-op when APPLICATIONINSIGHTS_CONNECTION_STRING is unset.
  await foundryTracing.initialize();

  // Start server
  server.listen(config.port, config.host, () => {
    logger.info(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   ${config.brand.productName} - Backend
║                                                                  ║
║   Server running at: http://${config.host}:${config.port}                       ║
║   WebSocket endpoint: ws://${config.host}:${config.port}/ws                     ║
║                                                                  ║
║   Mode: ${config.demo.demoMode ? 'DEMO' : 'PRODUCTION'}                                              ║
║   Mock Tools: ${config.demo.useMockTools ? 'ENABLED' : 'DISABLED'}                                       ║
║                                                                  ║
║   Scenarios: ${scenarioEngine.getAll().length} registered                                    ║
║   Tools: ${toolRegistry.getAll().length} registered                                        ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    wsServer.stop();
    sessionManager.stop();

    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Periodic cleanup of old files and sessions
  setInterval(() => {
    cleanupOldFiles();
    chatService.cleanupOldSessions();
  }, 60 * 60 * 1000); // Every hour
}

/**
 * Generate a mock response for demo purposes
 */
function generateMockResponse(content: string, files: { isImage: boolean; originalName: string }[]): string {
  const hasImages = files.some((f) => f.isImage);
  const hasFiles = files.some((f) => !f.isImage);

  if (hasImages && hasFiles) {
    return `I've received your message along with ${files.length} attachment(s). I can see you've shared both images and documents. In a production environment, I would analyze these files and provide relevant healthcare information. How can I help you with these documents?`;
  } else if (hasImages) {
    const imageCount = files.filter((f) => f.isImage).length;
    return `Thank you for sharing ${imageCount > 1 ? 'these images' : 'this image'}. I can see the file${imageCount > 1 ? 's' : ''} you've uploaded. In a production environment with vision capabilities enabled, I would be able to analyze medical images, prescription labels, or insurance cards. Is there something specific you'd like me to help you with regarding ${imageCount > 1 ? 'these images' : 'this image'}?`;
  } else if (hasFiles) {
    const fileNames = files.map((f) => f.originalName).join(', ');
    return `I've received your document${files.length > 1 ? 's' : ''}: ${fileNames}. In a production environment, I would process these files to extract relevant healthcare information. How would you like me to help you with ${files.length > 1 ? 'these documents' : 'this document'}?`;
  }

  // Text-only responses
  const lowerContent = content?.toLowerCase() || '';
  
  if (lowerContent.includes('prescription') || lowerContent.includes('medication')) {
    return "I can help you with prescription-related inquiries. You can ask me about:\n\n• Looking up your current prescriptions\n• Checking medication prices and coverage\n• Requesting prescription refills\n• Transferring prescriptions to a different pharmacy\n\nWhat would you like to know about your prescriptions?";
  }
  
  if (lowerContent.includes('doctor') || lowerContent.includes('provider') || lowerContent.includes('appointment')) {
    return "I can help you find healthcare providers in your network. Would you like me to search for:\n\n• Primary care physicians\n• Specialists (please specify the type)\n• Urgent care facilities\n• Hospitals\n\nPlease let me know your preferences and I can provide you with options in your area.";
  }
  
  if (lowerContent.includes('insurance') || lowerContent.includes('coverage') || lowerContent.includes('benefits')) {
    return "I can help you understand your insurance coverage. Here are some things I can assist with:\n\n• Verifying your member information\n• Checking coverage for specific services\n• Finding in-network providers\n• Understanding your copays and deductibles\n\nWhat specific coverage information would you like to know?";
  }
  
  if (lowerContent.includes('upload') || lowerContent.includes('attach') || lowerContent.includes('file') || lowerContent.includes('image')) {
    return "You can upload files and images by clicking the attachment button (📎) next to the message input. I can accept:\n\n• Images (JPEG, PNG, GIF, WebP)\n• Documents (PDF, Word, Excel)\n• Text files (TXT, CSV)\n\nOnce uploaded, I'll help you with any healthcare-related questions about the content.";
  }

  return `Hello! I'm your ${getConfig().brand.assistantName}. I can help you with:\n\n• **Prescription Services** - Look up, refill, or transfer prescriptions\n• **Provider Search** - Find in-network doctors and specialists\n• **Insurance Information** - Check your coverage and benefits\n• **Document Analysis** - Upload images or files for assistance\n\nHow may I assist you today?`;
}

// Run the server
main().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});
