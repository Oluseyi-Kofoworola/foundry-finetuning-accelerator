/**
 * Acme Health - Configuration Management
 * 
 * Centralized configuration loading with validation using Zod.
 * Supports environment-based configuration with sensible defaults.
 */

import { config as dotenvConfig } from 'dotenv';
import { ConfigSchema, type AppConfig } from '../types/index.js';
import { logger } from './logger.js';

// Load environment variables
dotenvConfig();

/**
 * Parse boolean from environment variable
 */
const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
};

/**
 * Parse number from environment variable
 */
const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Parse array from comma-separated environment variable
 */
const parseArray = (value: string | undefined, defaultValue: string[]): string[] => {
  if (value === undefined) return defaultValue;
  return value.split(',').map(s => s.trim()).filter(Boolean);
};

/**
 * Load and validate configuration from environment
 */
export const loadConfig = (): AppConfig => {
  // Determine if Azure OpenAI should be used
  const useAzureOpenAI = !!process.env.AZURE_OPENAI_ENDPOINT || parseBoolean(process.env.USE_AZURE_OPENAI, false);
  // Determine if Assistants API should be used (multi-agent mode)
  const useAssistantsAPI = parseBoolean(process.env.USE_ASSISTANTS_API, false);
  
  const rawConfig = {
    port: parseNumber(process.env.PORT, 3001),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
    brand: {
      orgName: process.env.BRAND_ORG_NAME || 'Acme Health',
      shortName: process.env.BRAND_SHORT_NAME || 'Acme',
      productName: process.env.BRAND_PRODUCT_NAME || 'Acme Voice Agent',
      assistantName: process.env.BRAND_ASSISTANT_NAME || 'Acme Virtual Assistant',
      industry: process.env.BRAND_INDUSTRY || 'healthcare',
      supportPhone: process.env.BRAND_SUPPORT_PHONE || '',
      supportUrl: process.env.BRAND_SUPPORT_URL || '',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      realtimeModel: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2025-08-28',
      // Azure OpenAI configuration
      azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
      azureApiKey: process.env.AZURE_OPENAI_API_KEY || '',
      azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-realtime',
      // Separate deployment for Chat Completions (the realtime deployment
      // can't be used with /chat/completions). Defaults to 'gpt-4o' which
      // is what's deployed on the dev resource.
      azureChatDeployment: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
      azureApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-21',
      useAzure: useAzureOpenAI,
    },
    azure: {
      openaiEndpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
      useAssistants: useAssistantsAPI,
    },
    security: {
      enableAuditLogging: parseBoolean(process.env.ENABLE_AUDIT_LOGGING, true),
      auditLogRetentionDays: parseNumber(process.env.AUDIT_LOG_RETENTION_DAYS, 90),
      sessionTimeoutMs: parseNumber(process.env.SESSION_TIMEOUT_MS, 1800000),
      requireConsent: parseBoolean(process.env.REQUIRE_CONSENT, true),
      corsOrigins: parseArray(process.env.CORS_ORIGINS, ['http://localhost:5173', 'http://localhost:3000']),
    },
    demo: {
      useMockTools: parseBoolean(process.env.USE_MOCK_TOOLS, true),
      demoMode: parseBoolean(process.env.DEMO_MODE, true),
      defaultScenario: process.env.DEFAULT_SCENARIO || 'pbm-pharmacy-assistant',
    },
    features: {
      enableVad: parseBoolean(process.env.ENABLE_VAD, true),
      enableBargeIn: parseBoolean(process.env.ENABLE_BARGE_IN, true),
      enableTextFallback: parseBoolean(process.env.ENABLE_TEXT_FALLBACK, true),
      maxConversationDurationMins: parseNumber(process.env.MAX_CONVERSATION_DURATION_MINS, 30),
      turnDetectionType: (process.env.TURN_DETECTION_TYPE || 'semantic_vad') as 'semantic_vad' | 'server_vad',
      semanticVadEagerness: (process.env.SEMANTIC_VAD_EAGERNESS || 'medium') as 'low' | 'medium' | 'high' | 'auto',
      serverVadThreshold: parseFloat(process.env.SERVER_VAD_THRESHOLD || '0.5'),
      serverVadSilenceMs: parseNumber(process.env.SERVER_VAD_SILENCE_MS, 700),
      serverVadPrefixPaddingMs: parseNumber(process.env.SERVER_VAD_PREFIX_PADDING_MS, 300),
    },
    logging: {
      level: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
      format: (process.env.LOG_FORMAT || 'json') as 'json' | 'simple',
    },
  };

  // Validate configuration
  const result = ConfigSchema.safeParse(rawConfig);
  
  if (!result.success) {
    logger.error('Configuration validation failed', {
      errors: result.error.errors,
    });
    
    // In development, provide helpful error messages
    if (rawConfig.nodeEnv === 'development') {
      console.error('\n❌ Configuration Error:');
      result.error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      console.error('\nPlease check your .env file and ensure all required values are set.');
      console.error('See .env.example for reference.\n');
    }
    
    throw new Error('Invalid configuration');
  }

  // Warn if API key is missing in non-test environments
  const hasOpenAIKey = result.data.openai.apiKey;
  // Azure OpenAI can use either API key OR managed identity (no API key needed)
  const hasAzureConfig = result.data.openai.azureEndpoint && (result.data.openai.azureApiKey || result.data.openai.useAzure);
  
  if (!hasOpenAIKey && !hasAzureConfig && result.data.nodeEnv !== 'test') {
    logger.warn('Neither OpenAI API key nor Azure OpenAI configuration found - voice features will be unavailable');
  }

  logger.info('Configuration loaded successfully', {
    nodeEnv: result.data.nodeEnv,
    demoMode: result.data.demo.demoMode,
    useMockTools: result.data.demo.useMockTools,
    useAzureOpenAI: result.data.openai.useAzure,
  });

  return result.data;
};

// Singleton configuration instance
let configInstance: AppConfig | null = null;

/**
 * Get the configuration singleton
 */
export const getConfig = (): AppConfig => {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
};

/**
 * Reset configuration (useful for testing)
 */
export const resetConfig = (): void => {
  configInstance = null;
};

/**
 * Check if running in demo mode
 */
export const isDemoMode = (): boolean => {
  return getConfig().demo.demoMode;
};

/**
 * Check if mock tools should be used
 */
export const useMockTools = (): boolean => {
  return getConfig().demo.useMockTools;
};

/**
 * Check if audit logging is enabled
 */
export const isAuditEnabled = (): boolean => {
  return getConfig().security.enableAuditLogging;
};
