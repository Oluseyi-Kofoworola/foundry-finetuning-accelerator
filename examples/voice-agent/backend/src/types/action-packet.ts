/**
 * Acme Health — ActionPacket
 *
 * Structured unit-of-work produced by every voice/chat session.
 *
 * The ActionPacket is the staff-facing artifact of an agent interaction. It
 * captures (a) what the agent understood, (b) what evidence it used, (c) what
 * it proposes, and (d) what a human still needs to decide. It is the
 * cornerstone of governed handoff between the AI front door and the Acme
 * access center.
 *
 * Schema follows the "minimum action-packet" outline from the patient-access
 * voice agent reference design and the Acme operational handoff model.
 */

// =============================================================================
// IDENTITY CONFIDENCE TIERS
// =============================================================================

/**
 * Identity confidence level — drives the allowed action surface.
 *
 *  - unknown      : caller anonymous; only general public info allowed
 *  - channel      : caller ID / MyHealth SSO / device signal only
 *  - knowledge    : name + DOB + one non-sensitive factor verified
 *  - step_up      : MFA / push / SMS code completed
 */
export type IdentityConfidence = 'unknown' | 'channel' | 'knowledge' | 'step_up';

/**
 * Escalation reason codes — finite, auditable set.
 */
export type EscalationReasonCode =
  | 'clinical_question'
  | 'emergency_mentioned'
  | 'identity_ambiguous'
  | 'identity_failed'
  | 'proxy_relationship_unverified'
  | 'minor_account'
  | 'billing_dispute'
  | 'financial_hardship'
  | 'interpreter_requested'
  | 'tool_failure'
  | 'grounding_insufficient'
  | 'patient_requested_human'
  | 'prompt_injection_detected'
  | 'safety_filter_triggered'
  | 'out_of_scope_intent';

/**
 * Allowed workflow paths — Acme MHO front door intents.
 */
export type AllowedWorkflow =
  | 'answer_general_question'
  | 'confirm_appointment'
  | 'reschedule_appointment'
  | 'cancel_appointment'
  | 'lookup_prescription'
  | 'request_refill'
  | 'explain_benefits'
  | 'find_provider'
  | 'location_and_arrival_info'
  | 'language_preference_capture'
  | 'route_to_human';

/**
 * Detected intent (free text, but should map to AllowedWorkflow).
 */
export interface DetectedIntent {
  primary: AllowedWorkflow | string;
  secondary?: string[];
  confidenceScore?: number; // 0..1
}

/**
 * Grounding source citation — every factual answer must trace to one.
 */
export interface GroundingSource {
  /** e.g. "acme-mho-faq", "acme-locations", "acme-health-plus-benefits" */
  collection: string;
  /** Document id / URL within the collection */
  documentId: string;
  /** Optional excerpt that was used */
  excerpt?: string;
  /** Confidence score from retrieval */
  score?: number;
}

/**
 * Proposed system action — the agent never commits; it proposes.
 */
export interface ProposedSystemAction {
  /** e.g. "reschedule_appointment" */
  action: string;
  /** Parameters the human / governed backend would commit */
  parameters: Record<string, unknown>;
  /** Whether autonomous execution is allowed for this action at this tier */
  autonomousAllowed: boolean;
  /** If true, action was already committed via a governed tool */
  committed?: boolean;
  /** Confirmation reference if committed */
  confirmationRef?: string;
}

/**
 * Language and interpreter preferences captured during the call.
 */
export interface LanguagePreference {
  primary: string; // e.g. "en", "es", "zh-CN", "zh-HK"
  interpreterNeeded: boolean;
  interpreterRequestedFor?: string; // e.g. "American Sign Language", "Cantonese"
}

/**
 * Callback preference captured if a callback is the resolution path.
 */
export interface CallbackPreference {
  phoneNumber?: string; // masked for display
  preferredWindow?: string; // e.g. "weekdays 9am-12pm PT"
  topicSummary?: string;
}

/**
 * Safety signals observed during the session.
 */
export interface SafetySignals {
  promptInjectionDetected: boolean;
  jailbreakAttempt: boolean;
  contentSafetyTriggered: boolean;
  groundingFailures: number;
  clinicalRefusalCount: number;
}

/**
 * Evaluation scores attached to the packet (computed post-session or live).
 */
export interface EvaluationScores {
  groundedness?: number;       // 0..1, computed by Foundry evaluator
  relevance?: number;          // 0..1
  fluency?: number;            // 0..1
  toolCorrectness?: number;    // 0..1
  toolCallAccuracy?: number;   // 0..1
  intentResolutionAccuracy?: number; // 0..1
  taskAdherence?: number;      // 0..1
  safetyOverall?: number;      // 0..1
  notes?: string;
}

// =============================================================================
// ACTION PACKET
// =============================================================================

export interface ActionPacket {
  /** Unique session id (matches voice session) */
  sessionId: string;

  /** Tenant / facility (e.g. "acme-cpmc", "acme-alta-bates") */
  facility?: string;

  /** Scenario the session ran in */
  scenarioId: string;

  /** Identity tier reached at packet creation */
  identityConfidence: IdentityConfidence;

  /** Verification factors used (no PHI, no raw secrets) */
  verifiedFactors: Array<'name_dob' | 'mho_sso' | 'caller_id' | 'sms_otp' | 'push_otp' | 'staff_override'>;

  /** Detected intent for the session */
  detectedIntent: DetectedIntent;

  /** Workflow path the agent was allowed to take given identity + intent */
  allowedWorkflow: AllowedWorkflow;

  /** One-line staff summary */
  summary: string;

  /** What the patient is being asked to do next, if anything */
  requestedPatientAction?: string;

  /** What the agent proposes the system / staff do, if anything */
  proposedSystemAction?: ProposedSystemAction;

  /** If escalated, why */
  escalationReasonCode?: EscalationReasonCode;
  escalationNote?: string;

  /** Grounding sources cited during the session */
  groundingSources: GroundingSource[];

  /** Short transcript snippet supporting the handoff */
  transcriptSnippet?: string;

  /** Unresolved questions or known unknowns */
  unresolved: string[];

  /** Language preferences */
  languagePreference?: LanguagePreference;

  /** Callback preferences */
  callbackPreference?: CallbackPreference;

  /** Staff disposition (filled in by staff console; absent for in-flight packets) */
  staffDisposition?: {
    reviewedBy: string;
    reviewedAt: string; // ISO
    decision: 'accepted' | 'modified' | 'rejected' | 'needs_more_info';
    notes?: string;
  };

  /** Safety signals observed during the session */
  safety: SafetySignals;

  /** Evaluation scores, when available */
  evaluation?: EvaluationScores;

  /** Audit metadata */
  audit: {
    createdAt: string;       // ISO
    updatedAt: string;       // ISO
    agentRunId?: string;     // Foundry Agent run id, if applicable
    traceId?: string;        // OpenTelemetry trace id
    modelDeployment?: string;
    promptVersion?: string;
    groundingIndexVersion?: string;
  };
}

// =============================================================================
// FACTORY HELPERS
// =============================================================================

/**
 * Create a brand-new ActionPacket for a session with conservative defaults.
 */
export function createEmptyActionPacket(args: {
  sessionId: string;
  scenarioId: string;
  facility?: string;
  modelDeployment?: string;
  promptVersion?: string;
  groundingIndexVersion?: string;
}): ActionPacket {
  const nowIso = new Date().toISOString();
  return {
    sessionId: args.sessionId,
    scenarioId: args.scenarioId,
    facility: args.facility,
    identityConfidence: 'unknown',
    verifiedFactors: [],
    detectedIntent: { primary: 'answer_general_question', confidenceScore: 0 },
    allowedWorkflow: 'answer_general_question',
    summary: 'Session started — no action determined yet.',
    groundingSources: [],
    unresolved: [],
    safety: {
      promptInjectionDetected: false,
      jailbreakAttempt: false,
      contentSafetyTriggered: false,
      groundingFailures: 0,
      clinicalRefusalCount: 0,
    },
    audit: {
      createdAt: nowIso,
      updatedAt: nowIso,
      modelDeployment: args.modelDeployment,
      promptVersion: args.promptVersion,
      groundingIndexVersion: args.groundingIndexVersion,
    },
  };
}

/**
 * Maps an identity tier to the set of workflows it is allowed to execute.
 * This is the central authority for "who can do what" at each confidence level.
 */
export const ALLOWED_WORKFLOWS_BY_TIER: Record<IdentityConfidence, AllowedWorkflow[]> = {
  unknown: [
    'answer_general_question',
    'location_and_arrival_info',
    'language_preference_capture',
    'route_to_human',
  ],
  channel: [
    'answer_general_question',
    'location_and_arrival_info',
    'language_preference_capture',
    'find_provider',
    'route_to_human',
  ],
  knowledge: [
    'answer_general_question',
    'location_and_arrival_info',
    'language_preference_capture',
    'find_provider',
    'confirm_appointment',
    'lookup_prescription',
    'explain_benefits',
    'route_to_human',
  ],
  step_up: [
    'answer_general_question',
    'location_and_arrival_info',
    'language_preference_capture',
    'find_provider',
    'confirm_appointment',
    'reschedule_appointment',
    'cancel_appointment',
    'lookup_prescription',
    'request_refill',
    'explain_benefits',
    'route_to_human',
  ],
};

export function isWorkflowAllowedAtTier(
  workflow: AllowedWorkflow,
  tier: IdentityConfidence
): boolean {
  return ALLOWED_WORKFLOWS_BY_TIER[tier].includes(workflow);
}
