/**
 * Acme Health - MFA Verification Tool
 * 
 * Mock implementation for sending and verifying MFA codes.
 * Used for sensitive operations like prescription changes, 
 * accessing full medical records, or making account changes.
 */

import { createTool } from './registry.js';
import type { ToolResult, ToolContext } from '../types/index.js';
import { sessionCache, CacheKeys } from '../services/cache.js';

// =============================================================================
// MOCK MFA DATA
// =============================================================================

interface MemberMFAInfo {
  memberId: string;
  phone: string;
  phoneLast4: string;
  email: string;
  preferredMethod: 'sms' | 'call' | 'email';
}

const MOCK_MFA_INFO: Map<string, MemberMFAInfo> = new Map([
  ['MEM-001', {
    memberId: 'MEM-001',
    phone: '(314) 555-1234',
    phoneLast4: '1234',
    email: 'sarah.johnson@email.com',
    preferredMethod: 'sms',
  }],
  ['MEM-002', {
    memberId: 'MEM-002',
    phone: '(610) 555-5678',
    phoneLast4: '5678',
    email: 'bob.martinez@email.com',
    preferredMethod: 'call',
  }],
  ['MEM-003', {
    memberId: 'MEM-003',
    phone: '(713) 555-9012',
    phoneLast4: '9012',
    email: 'emily.chen@email.com',
    preferredMethod: 'sms',
  }],
  ['MEM-004', {
    memberId: 'MEM-004',
    phone: '(602) 555-3456',
    phoneLast4: '3456',
    email: 'jim.wilson@email.com',
    preferredMethod: 'call',
  }],
]);

// Store pending MFA codes (in production, this would be in a secure cache/database)
const pendingMFACodes: Map<string, { code: string; expiresAt: Date; action: string }> = new Map();

// Demo code that always works
const DEMO_CODE = '123456';

// =============================================================================
// SEND MFA CODE TOOL
// =============================================================================

export interface SendMFAResult {
  sent: boolean;
  method: 'sms' | 'call' | 'email';
  destination: string; // Masked phone/email
  expiresInMinutes: number;
  message: string;
}

export const sendMFACodeTool = createTool<
  {
    memberId: string;
    action: string;
    method?: 'sms' | 'call' | 'email';
  },
  SendMFAResult
>({
  name: 'send_mfa_code',
  description: `Send a multi-factor authentication code to verify the member's identity for sensitive operations.
  Use this tool AFTER initial identity verification for actions like:
  - Requesting prescription refills
  - Viewing detailed medical records
  - Making account changes
  - Scheduling appointments
  - Accessing billing information
  
  The code will be sent to the member's phone on file. For demo purposes, the code is always 123456.`,
  category: 'identity',
  parameters: {
    type: 'object',
    properties: {
      memberId: {
        type: 'string',
        description: 'The verified member ID',
      },
      action: {
        type: 'string',
        description: 'Description of the action requiring MFA (e.g., "prescription refill", "view medical records")',
      },
      method: {
        type: 'string',
        enum: ['sms', 'call', 'email'],
        description: 'Preferred delivery method. Defaults to member preference if not specified.',
      },
    },
    required: ['memberId', 'action'],
  },
  handler: async (args, context): Promise<ToolResult<SendMFAResult>> => {
    await new Promise(resolve => setTimeout(resolve, 500));

    const { memberId: rawMemberId, action, method } = args;
    // Normalize memberId so `mem-001`, `MEM-001`, or `  MEM-001 ` all hit
    // the same record. Voice transcripts are unreliable about case.
    const memberId = (rawMemberId || '').trim().toUpperCase();
    const mfaInfo = MOCK_MFA_INFO.get(memberId);

    if (!mfaInfo) {
      return {
        success: false,
        error: `Member ID "${rawMemberId}" not found. Verify the caller's identity first so you have the correct member ID (format: MEM-XXX).`,
      };
    }

    const deliveryMethod = method || mfaInfo.preferredMethod;
    
    // Generate code (demo always uses 123456)
    const code = DEMO_CODE;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store the pending code
    pendingMFACodes.set(memberId, { code, expiresAt, action });

    // Determine masked destination
    let destination: string;
    if (deliveryMethod === 'email') {
      const [user, domain] = mfaInfo.email.split('@');
      destination = `${user.substring(0, 2)}***@${domain}`;
    } else {
      destination = `(***) ***-${mfaInfo.phoneLast4}`;
    }

    return {
      success: true,
      data: {
        sent: true,
        method: deliveryMethod,
        destination,
        expiresInMinutes: 10,
        message: `A 6-digit verification code has been sent to ${destination}. Please wait for the member to tell you the code they received. The code expires in 10 minutes.`,
      },
    };
  },
  isMocked: true,
  version: '1.0.0',
});

// =============================================================================
// VERIFY MFA CODE TOOL
// =============================================================================

export interface VerifyMFAResult {
  verified: boolean;
  action?: string;
  message: string;
  canProceed: boolean;
}

export const verifyMFACodeTool = createTool<
  {
    memberId: string;
    code: string;
  },
  VerifyMFAResult
>({
  name: 'verify_mfa_code',
  description: `Verify the MFA code provided by the member. 
  Call this after the member provides the 6-digit code sent to their phone.
  For demo purposes, the code 123456 always works.
  Once verified, you can proceed with the sensitive action.`,
  category: 'identity',
  parameters: {
    type: 'object',
    properties: {
      memberId: {
        type: 'string',
        description: 'The member ID',
      },
      code: {
        type: 'string',
        description: 'The 6-digit verification code provided by the member',
      },
    },
    required: ['memberId', 'code'],
  },
  handler: async (args, context): Promise<ToolResult<VerifyMFAResult>> => {
    const { memberId: rawMemberId, code } = args;
    const memberId = (rawMemberId || '').trim().toUpperCase();
    const sessionId = context?.sessionId || 'default';

    // Check if already verified in this session (cache hit = instant)
    const cachedMFA = sessionCache.get<VerifyMFAResult>(
      sessionId, 
      'mfa', 
      CacheKeys.mfaStatus(memberId)
    );
    if (cachedMFA && cachedMFA.verified && cachedMFA.canProceed) {
      console.log(`[Cache] MFA verification HIT for ${memberId}`);
      return { success: true, data: cachedMFA };
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    const pending = pendingMFACodes.get(memberId);

    // Demo mode: 123456 always works
    if (code === DEMO_CODE) {
      const action = pending?.action || 'requested action';
      pendingMFACodes.delete(memberId);
      
      const result: VerifyMFAResult = {
        verified: true,
        action,
        message: `Verification successful! The member's identity has been confirmed via MFA. You may now proceed with: ${action}`,
        canProceed: true,
      };
      
      // Cache MFA verification status
      sessionCache.set(sessionId, 'mfa', CacheKeys.mfaStatus(memberId), result);
      
      return { success: true, data: result };
    }

    // Check if there's a pending code
    if (!pending) {
      return {
        success: true,
        data: {
          verified: false,
          message: 'No verification code was sent or it has expired. Please send a new code.',
          canProceed: false,
        },
      };
    }

    // Check expiration
    if (new Date() > pending.expiresAt) {
      pendingMFACodes.delete(memberId);
      return {
        success: true,
        data: {
          verified: false,
          message: 'The verification code has expired. Please request a new code.',
          canProceed: false,
        },
      };
    }

    // Check code
    if (pending.code !== code) {
      return {
        success: true,
        data: {
          verified: false,
          message: 'Invalid verification code. Please try again or request a new code.',
          canProceed: false,
        },
      };
    }

    // Success
    const action = pending.action;
    pendingMFACodes.delete(memberId);

    return {
      success: true,
      data: {
        verified: true,
        action,
        message: `Verification successful! You may now proceed with: ${action}`,
        canProceed: true,
      },
    };
  },
  isMocked: true,
  version: '1.0.0',
});
