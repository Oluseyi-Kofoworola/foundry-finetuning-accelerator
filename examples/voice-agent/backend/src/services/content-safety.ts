/**
 * Acme Health — Azure AI Content Safety & Prompt Shields
 *
 * Front-line guard for all user input and tool/grounding output.
 *
 * Capabilities demonstrated:
 *   • Prompt Shields (jailbreak + indirect prompt injection)
 *   • Content Safety text moderation (hate / sexual / self-harm / violence)
 *   • PHI screening hook (regex-based at minimum; replace with Presidio /
 *     Azure Health De-identification in production)
 *
 * Behavior:
 *   • If `AZURE_CONTENT_SAFETY_ENDPOINT` is not configured, the service runs
 *     in degraded mode and only applies the local PHI regex screen + a
 *     hard refusal for known jailbreak phrases. The agent should still
 *     escalate on any "blocked" outcome.
 */

import { logger } from '../utils/logger.js';
import { foundryTracing } from './foundry-tracing.js';

// =============================================================================
// TYPES
// =============================================================================

export type SafetyCategory = 'Hate' | 'SelfHarm' | 'Sexual' | 'Violence';

export interface SafetyResult {
  action: 'allowed' | 'redacted' | 'blocked';
  reason?:
    | 'prompt_injection'
    | 'jailbreak'
    | 'content_safety'
    | 'phi_detected'
    | 'unsafe_for_clinical_context';
  detail?: string;
  /** If `redacted`, this is the redacted variant safe to forward to the model */
  redactedText?: string;
  /** Severity per category (0..7 in Azure scale) */
  severities?: Partial<Record<SafetyCategory, number>>;
}

// =============================================================================
// LOCAL FALLBACK PATTERNS
// =============================================================================

const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore (?:all|previous|the) (?:instructions|prompt)/i,
  /you are now (?:a )?(?:dan|developer mode|jailbroken)/i,
  /pretend you (?:are|have no)/i,
  /reveal (?:the |your )?(?:system )?prompt/i,
  /print your instructions/i,
  /from now on you/i,
];

const CLINICAL_REQUEST_PATTERNS: RegExp[] = [
  /should i (?:go to|call) (?:the )?(?:er|hospital|911)/i,
  /am i having (?:a )?(?:heart attack|stroke|allergic reaction)/i,
  /can you diagnose/i,
  /what (?:medication|drug) should i take/i,
];

const PHI_PATTERNS: RegExp[] = [
  // US SSN
  /\b\d{3}-\d{2}-\d{4}\b/,
  // Credit card-ish
  /\b\d{13,19}\b/,
  // Email
  /\b[\w.-]+@[\w-]+\.[\w.-]+\b/i,
  // Phone (US)
  /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
];

// =============================================================================
// CONFIG
// =============================================================================

interface ContentSafetyConfig {
  endpoint?: string;
  apiKey?: string;
  promptShieldEnabled: boolean;
  contentSafetyEnabled: boolean;
  blockThreshold: number; // 0..7
}

function loadConfig(): ContentSafetyConfig {
  return {
    endpoint: process.env.AZURE_CONTENT_SAFETY_ENDPOINT,
    apiKey: process.env.AZURE_CONTENT_SAFETY_API_KEY,
    promptShieldEnabled: (process.env.PROMPT_SHIELD_ENABLED || 'true') === 'true',
    contentSafetyEnabled: (process.env.CONTENT_SAFETY_ENABLED || 'true') === 'true',
    blockThreshold: Number(process.env.CONTENT_SAFETY_BLOCK_SEVERITY || 4),
  };
}

// =============================================================================
// SERVICE
// =============================================================================

class ContentSafetyService {
  private config: ContentSafetyConfig = loadConfig();

  /**
   * Screen a user utterance before it reaches the model.
   * Order: jailbreak → content-safety → PHI → clinical-context heuristic.
   */
  async screenUserInput(sessionId: string, text: string): Promise<SafetyResult> {
    if (!text || !text.trim()) return { action: 'allowed' };

    // 1. Jailbreak (cheap regex first; then Prompt Shield API if configured)
    if (JAILBREAK_PATTERNS.some((re) => re.test(text))) {
      foundryTracing.recordSafetyEvent({
        sessionId,
        kind: 'jailbreak',
        severity: 'high',
        action: 'blocked',
        detail: 'local-regex',
      });
      return {
        action: 'blocked',
        reason: 'jailbreak',
        detail: 'Local jailbreak pattern matched',
      };
    }

    if (this.config.promptShieldEnabled && this.config.endpoint) {
      const shield = await this.callPromptShield(sessionId, text);
      if (shield.action !== 'allowed') return shield;
    }

    // 2. Content safety
    if (this.config.contentSafetyEnabled && this.config.endpoint) {
      const cs = await this.callContentSafety(sessionId, text);
      if (cs.action !== 'allowed') return cs;
    }

    // 3. PHI redaction (don't block — redact and emit signal)
    const redacted = this.redactPhi(text);
    if (redacted !== text) {
      foundryTracing.recordSafetyEvent({
        sessionId,
        kind: 'pii_redaction',
        severity: 'low',
        action: 'redacted',
      });
      return { action: 'redacted', reason: 'phi_detected', redactedText: redacted };
    }

    // 4. Clinical-context heuristic — surface so scenario can choose to escalate.
    if (CLINICAL_REQUEST_PATTERNS.some((re) => re.test(text))) {
      foundryTracing.recordSafetyEvent({
        sessionId,
        kind: 'content_safety',
        severity: 'medium',
        action: 'blocked',
        detail: 'clinical-request',
      });
      return {
        action: 'blocked',
        reason: 'unsafe_for_clinical_context',
        detail:
          'Caller appears to be asking for clinical advice — administrative agent must escalate.',
      };
    }

    return { action: 'allowed' };
  }

  /**
   * Screen retrieved grounding content before injecting into the prompt.
   * This is the indirect-prompt-injection defense.
   */
  async screenGroundingContent(sessionId: string, text: string): Promise<SafetyResult> {
    if (!text) return { action: 'allowed' };

    // Look for "instructions in the document" style injections
    if (
      /(?:ignore previous|disregard the|new instructions|system:\s*)/i.test(text) ||
      /reveal (?:the )?(?:system )?prompt/i.test(text)
    ) {
      foundryTracing.recordSafetyEvent({
        sessionId,
        kind: 'prompt_shield',
        severity: 'high',
        action: 'blocked',
        detail: 'indirect-injection-in-grounding',
      });
      return {
        action: 'blocked',
        reason: 'prompt_injection',
        detail: 'Indirect prompt injection detected in retrieved content',
      };
    }
    return { action: 'allowed' };
  }

  // ---------------------------------------------------------------------------
  // Azure REST calls
  // ---------------------------------------------------------------------------

  private async callPromptShield(sessionId: string, text: string): Promise<SafetyResult> {
    try {
      const url = `${this.config.endpoint}/contentsafety/text:shieldPrompt?api-version=2024-09-01`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ userPrompt: text }),
      });
      if (!res.ok) return { action: 'allowed' }; // fail-open w/ tracing
      const data = (await res.json()) as {
        userPromptAnalysis?: { attackDetected?: boolean };
      };
      if (data.userPromptAnalysis?.attackDetected) {
        foundryTracing.recordSafetyEvent({
          sessionId,
          kind: 'prompt_shield',
          severity: 'high',
          action: 'blocked',
          detail: 'azure-prompt-shield',
        });
        return { action: 'blocked', reason: 'prompt_injection' };
      }
      return { action: 'allowed' };
    } catch (err) {
      logger.warn('[content-safety] prompt-shield call failed', {
        error: (err as Error).message,
      });
      return { action: 'allowed' };
    }
  }

  private async callContentSafety(sessionId: string, text: string): Promise<SafetyResult> {
    try {
      const url = `${this.config.endpoint}/contentsafety/text:analyze?api-version=2024-09-01`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          text,
          categories: ['Hate', 'SelfHarm', 'Sexual', 'Violence'],
          outputType: 'FourSeverityLevels',
        }),
      });
      if (!res.ok) return { action: 'allowed' };
      const data = (await res.json()) as {
        categoriesAnalysis: Array<{ category: SafetyCategory; severity: number }>;
      };
      const severities: Partial<Record<SafetyCategory, number>> = {};
      let maxSev = 0;
      let worstCat: SafetyCategory | undefined;
      for (const c of data.categoriesAnalysis || []) {
        severities[c.category] = c.severity;
        if (c.severity > maxSev) {
          maxSev = c.severity;
          worstCat = c.category;
        }
      }
      if (maxSev >= this.config.blockThreshold) {
        foundryTracing.recordSafetyEvent({
          sessionId,
          kind: 'content_safety',
          severity: maxSev >= 6 ? 'high' : 'medium',
          action: 'blocked',
          detail: worstCat,
        });
        return { action: 'blocked', reason: 'content_safety', severities, detail: worstCat };
      }
      return { action: 'allowed', severities };
    } catch (err) {
      logger.warn('[content-safety] content-safety call failed', {
        error: (err as Error).message,
      });
      return { action: 'allowed' };
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) h['Ocp-Apim-Subscription-Key'] = this.config.apiKey;
    return h;
  }

  // ---------------------------------------------------------------------------
  // PHI redaction
  // ---------------------------------------------------------------------------

  redactPhi(text: string): string {
    let out = text;
    for (const re of PHI_PATTERNS) {
      out = out.replace(re, '[REDACTED]');
    }
    return out;
  }
}

export const contentSafety = new ContentSafetyService();
