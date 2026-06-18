/**
 * Acme Health - Session Manager
 * 
 * Manages voice agent sessions with proper lifecycle,
 * timeout handling, and state management.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  SessionState,
  SessionStatus,
  ConversationTurn,
  MemberContext,
  AuditLogger,
} from '../types/index.js';
import type {
  ActionPacket,
  IdentityConfidence,
  EscalationReasonCode,
  AllowedWorkflow,
  GroundingSource,
  ProposedSystemAction,
  SafetySignals,
  EvaluationScores,
} from '../types/action-packet.js';
import { createEmptyActionPacket } from '../types/action-packet.js';
import { logger, createAuditLogger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';
import { foundryTracing } from './foundry-tracing.js';
import { ACME_GOLDEN_SET, evaluatePacket } from './foundry-evaluations.js';

// =============================================================================
// SESSION MANAGER
// =============================================================================

export class SessionManager {
  private sessions: Map<string, SessionState> = new Map();
  private auditLogger: AuditLogger;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.auditLogger = createAuditLogger();
    this.startCleanupInterval();
  }

  /**
   * Create a new session
   */
  async create(scenarioId: string, userId?: string): Promise<SessionState> {
    const config = getConfig();
    const sessionId = uuidv4();
    const now = new Date();

    const session: SessionState = {
      id: sessionId,
      scenarioId,
      startedAt: now,
      lastActivityAt: now,
      consentGiven: !config.security.requireConsent, // Auto-consent if not required
      turnCount: 0,
      toolCallCount: 0,
      conversationHistory: [],
      status: config.security.requireConsent ? 'pending_consent' : 'active',
      actionPacket: createEmptyActionPacket({
        sessionId,
        scenarioId,
        modelDeployment: process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT || 'gpt-4o-realtime-preview',
        promptVersion: process.env.ACME_PROMPT_VERSION || 'v1.0.0',
        facility: process.env.ACME_FACILITY || 'acme-mho',
      }),
    };

    this.sessions.set(sessionId, session);

    // Audit log session creation
    await this.auditLogger.log({
      sessionId,
      eventType: 'session_started',
      eventData: {
        scenarioId,
        userId,
        requiresConsent: config.security.requireConsent,
      },
      actor: { type: 'system' },
      outcome: 'success',
      metadata: { scenarioId },
    });

    logger.info(`Created session: ${sessionId}`, { scenarioId, userId });
    return session;
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Check if session has timed out
      const config = getConfig();
      const elapsed = Date.now() - session.lastActivityAt.getTime();
      if (elapsed > config.security.sessionTimeoutMs) {
        logger.info(`Session ${sessionId} timed out`);
        session.status = 'ended';
      }
    }
    return session;
  }

  /**
   * Update session activity timestamp
   */
  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }

  /**
   * Record consent given for a session
   */
  async recordConsent(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.consentGiven = true;
    session.status = 'active';

    await this.auditLogger.log({
      sessionId,
      eventType: 'consent_given',
      eventData: { consentTimestamp: new Date().toISOString() },
      actor: { type: 'user' },
      outcome: 'success',
    });

    logger.info(`Consent recorded for session: ${sessionId}`);
    return true;
  }

  /**
   * Set member context after verification
   */
  setMemberContext(sessionId: string, context: MemberContext): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.memberContext = context;
      logger.debug(`Member context set for session: ${sessionId}`, {
        memberId: context.memberId,
      });
    }
  }

  /**
   * Add a conversation turn to history
   */
  addTurn(sessionId: string, turn: Omit<ConversationTurn, 'id' | 'timestamp'>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const fullTurn: ConversationTurn = {
      ...turn,
      id: uuidv4(),
      timestamp: new Date(),
    };

    session.conversationHistory.push(fullTurn);
    session.turnCount++;
    session.lastActivityAt = new Date();

    // Keep history bounded to prevent memory issues
    const maxHistory = 50;
    if (session.conversationHistory.length > maxHistory) {
      session.conversationHistory = session.conversationHistory.slice(-maxHistory);
    }
  }

  /**
   * Increment tool call count
   */
  incrementToolCalls(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.toolCallCount++;
    }
  }

  /**
   * Switch scenario for a session
   */
  async switchScenario(sessionId: string, newScenarioId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const oldScenarioId = session.scenarioId;
    session.scenarioId = newScenarioId;
    session.turnCount = 0;
    session.conversationHistory = [];

    await this.auditLogger.log({
      sessionId,
      eventType: 'scenario_switched',
      eventData: {
        fromScenario: oldScenarioId,
        toScenario: newScenarioId,
      },
      actor: { type: 'user' },
      outcome: 'success',
      metadata: { scenarioId: newScenarioId },
    });

    logger.info(`Scenario switched for session: ${sessionId}`, {
      from: oldScenarioId,
      to: newScenarioId,
    });

    return true;
  }

  /**
   * End a session
   */
  async end(sessionId: string, reason: string = 'normal'): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'ended';

    const duration = Date.now() - session.startedAt.getTime();

    // Finalize the ActionPacket and emit it to traces
    if (session.actionPacket) {
      session.actionPacket.audit.updatedAt = new Date().toISOString();
      if (session.actionPacket.summary === 'Session started — no action determined yet.') {
        session.actionPacket.summary = `Session ended (${reason}) after ${session.turnCount} turns, ${session.toolCallCount} tool calls.`;
      }
      // Best-effort runtime evaluation: if any golden case for this scenario
      // matches the detected intent, score the packet and attach the result.
      // This is the same evaluator the offline batch uses, so demo viewers
      // see real eval output without having to run the batch.
      try {
        const candidates = ACME_GOLDEN_SET.filter(
          (c) => c.scenarioId === session.actionPacket!.scenarioId,
        );
        const detectedIntent = session.actionPacket.detectedIntent.primary;
        const match =
          candidates.find((c) => c.expect.detectedIntentPrimary === detectedIntent) ||
          candidates[0];
        if (match) {
          session.actionPacket.evaluation = evaluatePacket(session.actionPacket, match);
          logger.info('Foundry eval attached to ActionPacket', {
            sessionId,
            goldenCase: match.id,
            taskAdherence: session.actionPacket.evaluation.taskAdherence,
            notes: session.actionPacket.evaluation.notes,
          });
        }
      } catch (err) {
        logger.warn('Foundry eval at session end failed (non-fatal)', {
          sessionId,
          error: (err as Error).message,
        });
      }
      foundryTracing.emitActionPacket(session.actionPacket);
    }

    await this.auditLogger.log({
      sessionId,
      eventType: 'session_ended',
      eventData: {
        reason,
        duration,
        turnCount: session.turnCount,
        toolCallCount: session.toolCallCount,
      },
      actor: { type: 'system' },
      outcome: 'success',
      metadata: {
        scenarioId: session.scenarioId,
        duration,
      },
    });

    logger.info(`Session ended: ${sessionId}`, {
      reason,
      duration,
      turnCount: session.turnCount,
    });

    // Don't delete immediately - allow for potential reconnection
    // Cleanup will happen via interval
  }

  /**
   * Get the audit logger for a session
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  // ===========================================================================
  // ActionPacket helpers (Foundry staff-facing structured outcome)
  // ===========================================================================

  /** Mutate the session's ActionPacket through a callback. */
  updateActionPacket(sessionId: string, fn: (p: ActionPacket) => void): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.actionPacket) return;
    fn(session.actionPacket);
    session.actionPacket.audit.updatedAt = new Date().toISOString();
  }

  setIdentityConfidence(sessionId: string, confidence: IdentityConfidence): void {
    this.updateActionPacket(sessionId, (p) => {
      p.identityConfidence = confidence;
    });
  }

  addVerifiedFactor(
    sessionId: string,
    factor: 'name_dob' | 'mho_sso' | 'caller_id' | 'sms_otp' | 'push_otp' | 'staff_override'
  ): void {
    this.updateActionPacket(sessionId, (p) => {
      if (!p.verifiedFactors.includes(factor)) p.verifiedFactors.push(factor);
    });
  }

  setIntent(
    sessionId: string,
    primary: AllowedWorkflow | string,
    confidenceScore = 0.8,
    secondary?: string[]
  ): void {
    this.updateActionPacket(sessionId, (p) => {
      p.detectedIntent = { primary, confidenceScore, secondary };
    });
  }

  setAllowedWorkflow(sessionId: string, workflow: AllowedWorkflow): void {
    this.updateActionPacket(sessionId, (p) => {
      p.allowedWorkflow = workflow;
    });
  }

  setSummary(sessionId: string, summary: string): void {
    this.updateActionPacket(sessionId, (p) => {
      p.summary = summary;
    });
  }

  addGroundingSource(sessionId: string, source: GroundingSource): void {
    this.updateActionPacket(sessionId, (p) => {
      const exists = p.groundingSources.some(
        (g) => g.documentId === source.documentId && g.collection === source.collection
      );
      if (!exists) p.groundingSources.push(source);
    });
  }

  setProposedSystemAction(sessionId: string, action: ProposedSystemAction): void {
    this.updateActionPacket(sessionId, (p) => {
      p.proposedSystemAction = action;
    });
  }

  addUnresolved(sessionId: string, item: string): void {
    this.updateActionPacket(sessionId, (p) => {
      if (!p.unresolved.includes(item)) p.unresolved.push(item);
    });
  }

  recordSafetySignal(sessionId: string, signal: Partial<SafetySignals>): void {
    this.updateActionPacket(sessionId, (p) => {
      p.safety = { ...p.safety, ...signal };
    });
  }

  setEscalation(sessionId: string, code: EscalationReasonCode, note?: string): void {
    this.updateActionPacket(sessionId, (p) => {
      p.escalationReasonCode = code;
      p.escalationNote = note;
    });
  }

  setEvaluationScores(sessionId: string, scores: EvaluationScores): void {
    this.updateActionPacket(sessionId, (p) => {
      p.evaluation = scores;
    });
  }

  getActionPacket(sessionId: string): ActionPacket | undefined {
    return this.sessions.get(sessionId)?.actionPacket;
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    averageTurns: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const activeSessions = sessions.filter(s => s.status === 'active');
    const totalTurns = sessions.reduce((sum, s) => sum + s.turnCount, 0);

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      averageTurns: sessions.length > 0 ? totalTurns / sessions.length : 0,
    };
  }

  /**
   * Start the cleanup interval for expired sessions
   */
  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up expired sessions
   */
  private cleanup(): void {
    const config = getConfig();
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      const elapsed = now - session.lastActivityAt.getTime();
      
      // Remove sessions that have been inactive for 2x the timeout
      if (elapsed > config.security.sessionTimeoutMs * 2) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired sessions`);
    }
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
