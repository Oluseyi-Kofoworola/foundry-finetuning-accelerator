/**
 * Acme Health - Logging Utility
 * 
 * Enterprise-grade logging with Winston for structured logging,
 * audit trail support, and compliance-ready formatting.
 */

import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import type { AuditLogEntry, AuditLogger, AuditEventType } from '../types/index.js';

// =============================================================================
// WINSTON CONFIGURATION
// =============================================================================

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

/**
 * Custom format for development console output
 */
const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

/**
 * Create the main application logger
 */
export const createLogger = (config: { level: string; format: string }) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: isProduction
        ? combine(timestamp(), json())
        : combine(colorize(), timestamp({ format: 'HH:mm:ss' }), devFormat),
    }),
  ];

  // Add file transport in production
  if (isProduction) {
    transports.push(
      new winston.transports.File({
        filename: process.env.LOG_FILE_PATH || './logs/app.log',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        format: combine(timestamp(), json()),
      })
    );
  }

  return winston.createLogger({
    level: config.level,
    format: combine(
      errors({ stack: true }),
      timestamp(),
      json()
    ),
    transports,
    defaultMeta: {
      service: 'acme-voice-agent',
      version: process.env.npm_package_version || '1.0.0',
    },
  });
};

// Default logger instance
export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.LOG_FORMAT || 'json',
});

// =============================================================================
// AUDIT LOGGER IMPLEMENTATION
// =============================================================================

/**
 * In-memory audit log storage for demo purposes
 * In production, this would be replaced with a proper database or log aggregation service
 */
class InMemoryAuditStore {
  private logs: Map<string, AuditLogEntry[]> = new Map();
  private allLogs: AuditLogEntry[] = [];
  private maxLogsPerSession = 1000;
  private maxTotalLogs = 10000;

  add(entry: AuditLogEntry): void {
    // Add to session-specific logs
    const sessionLogs = this.logs.get(entry.sessionId) || [];
    sessionLogs.push(entry);
    
    // Trim if exceeds max
    if (sessionLogs.length > this.maxLogsPerSession) {
      sessionLogs.shift();
    }
    
    this.logs.set(entry.sessionId, sessionLogs);
    
    // Add to all logs
    this.allLogs.push(entry);
    if (this.allLogs.length > this.maxTotalLogs) {
      this.allLogs.shift();
    }
  }

  getBySession(sessionId: string): AuditLogEntry[] {
    return this.logs.get(sessionId) || [];
  }

  getAll(): AuditLogEntry[] {
    return [...this.allLogs];
  }

  clear(sessionId?: string): void {
    if (sessionId) {
      this.logs.delete(sessionId);
    } else {
      this.logs.clear();
      this.allLogs = [];
    }
  }
}

const auditStore = new InMemoryAuditStore();

/**
 * Create an audit logger for a specific context
 */
export const createAuditLogger = (): AuditLogger => {
  const auditFileTransport = new winston.transports.File({
    filename: process.env.AUDIT_LOG_PATH || './logs/audit.log',
    maxsize: 50 * 1024 * 1024, // 50MB
    maxFiles: 10,
    format: combine(timestamp(), json()),
  });

  const auditWinstonLogger = winston.createLogger({
    level: 'info',
    format: combine(timestamp(), json()),
    transports: [auditFileTransport],
    defaultMeta: {
      service: 'acme-voice-agent-audit',
    },
  });

  return {
    async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
      const fullEntry: AuditLogEntry = {
        ...entry,
        id: uuidv4(),
        timestamp: new Date(),
      };

      // Store in memory for quick access
      auditStore.add(fullEntry);

      // Log to file for persistence
      auditWinstonLogger.info('audit_event', {
        ...fullEntry,
        timestamp: fullEntry.timestamp.toISOString(),
      });

      // Also log to main logger in development for visibility
      if (process.env.NODE_ENV !== 'production') {
        logger.debug(`[AUDIT] ${entry.eventType}`, {
          sessionId: entry.sessionId,
          outcome: entry.outcome,
          metadata: entry.metadata,
        });
      }
    },

    async getSessionLogs(sessionId: string): Promise<AuditLogEntry[]> {
      return auditStore.getBySession(sessionId);
    },
  };
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a child logger with additional context
 */
export const createChildLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};

/**
 * Log a tool call for audit purposes
 */
export const logToolCall = async (
  auditLogger: AuditLogger,
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: { success: boolean; error?: string },
  durationMs: number
): Promise<void> => {
  await auditLogger.log({
    sessionId,
    eventType: result.success ? 'tool_called' : 'tool_failed',
    eventData: {
      toolName,
      arguments: sanitizeForAudit(args),
      success: result.success,
      error: result.error,
    },
    actor: { type: 'agent' },
    outcome: result.success ? 'success' : 'failure',
    metadata: {
      toolName,
      duration: durationMs,
    },
  });
};

/**
 * Sanitize data for audit logging - remove any potential PHI
 * This is a safety measure to prevent accidental PHI logging
 */
const sanitizeForAudit = (data: Record<string, unknown>): Record<string, unknown> => {
  const sensitiveKeys = [
    'ssn', 'social_security', 'dob', 'date_of_birth', 'birth_date',
    'address', 'phone', 'email', 'medical_record', 'mrn',
    'diagnosis', 'condition', 'treatment', 'medication_history',
  ];

  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForAudit(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Format error for logging
 */
export const formatError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { error: String(error) };
};
