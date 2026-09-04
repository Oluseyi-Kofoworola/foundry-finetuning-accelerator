import { afterAll, describe, expect, test } from '@jest/globals';
import type { AuditLogger, ToolContext } from '../src/types/index.js';
import { sessionCache, CacheKeys } from '../src/services/cache.js';
import { ToolRegistry, createTool } from '../src/tools/registry.js';
import {
  sendMFACodeTool,
  verifyMFACodeTool,
} from '../src/tools/send-mfa-verification.js';
import { contentSafety } from '../src/services/content-safety.js';

const auditLogger: AuditLogger = {
  log: async () => undefined,
  getSessionLogs: async () => [],
};

function context(
  sessionId: string,
  allowedTools: readonly string[],
  memberId?: string
): ToolContext {
  return {
    sessionId,
    scenarioId: 'test-scenario',
    allowedTools,
    memberId,
    timestamp: new Date(),
    auditLogger,
  };
}

describe('clinical tool authorization', () => {
  afterAll(() => sessionCache.shutdown());

  test('keeps scenario tool allowlists isolated between sessions', async () => {
    const registry = new ToolRegistry();
    registry.register(createTool({
      name: 'tool_a',
      description: 'Scenario A tool',
      category: 'knowledge',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async () => ({ success: true }),
    }));

    const denied = await registry.execute('tool_a', {}, context('session-b', ['tool_b']));
    const allowed = await registry.execute('tool_a', {}, context('session-a', ['tool_a']));

    expect(denied.success).toBe(false);
    expect(allowed.success).toBe(true);
  });

  test('requires verified identity and current-session MFA for sensitive tools', async () => {
    const registry = new ToolRegistry();
    registry.register(createTool({
      name: 'patient_data',
      description: 'Sensitive patient data',
      category: 'patient',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async () => ({ success: true }),
    }));
    const ctx = context('sensitive-session', ['patient_data'], 'MEM-001');

    expect((await registry.execute('patient_data', {}, ctx)).error).toMatch(/identity/i);
    sessionCache.set(ctx.sessionId, 'identity', CacheKeys.identity('MEM-001'), { verified: true });
    expect((await registry.execute('patient_data', {}, ctx)).error).toMatch(/MFA/i);
    sessionCache.set(ctx.sessionId, 'mfa', CacheKeys.mfaStatus('MEM-001'), {
      verified: true,
      canProceed: true,
    });
    expect((await registry.execute('patient_data', {}, ctx)).success).toBe(true);
  });

  test('rejects the demo MFA code when no challenge exists', async () => {
    const result = await verifyMFACodeTool.handler(
      { memberId: 'MEM-001', code: '123456' },
      context('no-challenge', ['verify_mfa_code'], 'MEM-001')
    );

    expect(result.data).toMatchObject({ verified: false, canProceed: false });
  });

  test('binds MFA challenges to the issuing session and member', async () => {
    await sendMFACodeTool.handler(
      { memberId: 'MEM-001', action: 'view records' },
      context('issuing-session', ['send_mfa_code'], 'MEM-001')
    );

    const wrongSession = await verifyMFACodeTool.handler(
      { memberId: 'MEM-001', code: '123456' },
      context('other-session', ['verify_mfa_code'], 'MEM-001')
    );
    const issuingSession = await verifyMFACodeTool.handler(
      { memberId: 'MEM-001', code: '123456' },
      context('issuing-session', ['verify_mfa_code'], 'MEM-001')
    );

    expect(wrongSession.data).toMatchObject({ verified: false, canProceed: false });
    expect(issuingSession.data).toMatchObject({ verified: true, canProceed: true });
  });

  test('requires a matching one-time session confirmation before a write', async () => {
    const registry = new ToolRegistry();
    let writes = 0;
    registry.register(createTool({
      name: 'request_refill',
      description: 'Refill write',
      category: 'pharmacy',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async () => {
        writes += 1;
        return { success: true };
      },
    }));
    const issuing = context('write-session', ['request_refill'], 'MEM-001');
    const other = context('other-write-session', ['request_refill'], 'MEM-001');
    for (const ctx of [issuing, other]) {
      sessionCache.set(ctx.sessionId, 'identity', CacheKeys.identity('MEM-001'), { verified: true });
      sessionCache.set(ctx.sessionId, 'mfa', CacheKeys.mfaStatus('MEM-001'), {
        verified: true,
        canProceed: true,
      });
    }
    const action = { memberId: 'MEM-001', rxNumber: 'RX-1001' };

    const staged = await registry.execute('request_refill', action, issuing);
    const token = (staged.data as { confirmationToken: string }).confirmationToken;
    expect(writes).toBe(0);
    expect((await registry.execute('request_refill', { ...action, confirmationToken: token }, other)).success).toBe(false);
    expect((await registry.execute('request_refill', { ...action, confirmationToken: token }, issuing)).success).toBe(true);
    expect(writes).toBe(1);
    expect((await registry.execute('request_refill', { ...action, confirmationToken: token }, issuing)).success).toBe(false);
    expect(writes).toBe(1);
  });

  test('blocks local emergency and self-harm language for immediate escalation', async () => {
    const emergency = await contentSafety.screenUserInput(
      'emergency-session',
      'I have chest pain and cannot breathe'
    );
    const selfHarm = await contentSafety.screenUserInput(
      'self-harm-session',
      'I want to hurt myself'
    );

    expect(emergency).toMatchObject({ action: 'blocked', reason: 'unsafe_for_clinical_context' });
    expect(selfHarm).toMatchObject({ action: 'blocked', reason: 'unsafe_for_clinical_context' });
  });
});