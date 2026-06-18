/**
 * Acme Health - Prescription Refill Request Tool
 * 
 * Mock implementation for requesting prescription refills.
 * REQUIRES MFA verification before processing refills.
 */

import { createTool } from './registry.js';
import type { ToolResult, ToolContext } from '../types/index.js';
import { sessionCache, CacheKeys } from '../services/cache.js';

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface RefillResult {
  success: boolean;
  message: string;
  refillDetails?: {
    rxNumber: string;
    medicationName: string;
    status: 'approved' | 'pending_approval' | 'requires_renewal' | 'too_soon';
    estimatedReadyDate?: string;
    confirmationNumber?: string;
    pharmacyName?: string;
    pharmacyPhone?: string;
  };
  requiresAction?: {
    action: string;
    reason: string;
    contactInfo?: string;
  };
}

// Simulated prescription data for refill validation
const REFILL_ELIGIBLE_RX = new Map([
  ['RX-78901234', {
    medicationName: 'Lisinopril 10mg',
    refillsRemaining: 5,
    lastFilledDate: new Date('2025-12-15'),
    daysSupply: 30,
    pharmacyName: "Acme Health Pharmacy - Chesterfield",
    pharmacyPhone: '(314) 555-0123',
  }],
  ['RX-78901235', {
    medicationName: 'Metformin ER 500mg',
    refillsRemaining: 3,
    lastFilledDate: new Date('2025-12-20'),
    daysSupply: 30,
    pharmacyName: "Acme Health Pharmacy - Chesterfield",
    pharmacyPhone: '(314) 555-0123',
  }],
  ['RX-89012345', {
    medicationName: 'Atorvastatin 20mg',
    refillsRemaining: 2,
    lastFilledDate: new Date('2025-11-01'),
    daysSupply: 90,
    pharmacyName: "Acme Health Pharmacy - Bethlehem",
    pharmacyPhone: '(610) 555-0456',
  }],
  ['RX-90123456', {
    medicationName: 'Omeprazole 20mg',
    refillsRemaining: 0,
    lastFilledDate: new Date('2025-12-01'),
    daysSupply: 30,
    pharmacyName: "Acme Health Pharmacy - Houston",
    pharmacyPhone: '(713) 555-0789',
  }],
  ['RX-90123457', {
    medicationName: 'Amlodipine 5mg',
    refillsRemaining: 11,
    lastFilledDate: new Date('2025-12-28'),
    daysSupply: 30,
    pharmacyName: 'CVS Pharmacy #4521',
    pharmacyPhone: '(713) 555-0321',
  }],
]);

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export const requestRefillTool = createTool<
  {
    rxNumber: string;
    memberId: string;
    urgencyLevel?: 'standard' | 'urgent';
    deliveryPreference?: 'pickup' | 'delivery' | 'mail_order';
  },
  RefillResult
>({
  name: 'request_refill',
  description: `Request a refill for an existing prescription.
  REQUIRES MFA VERIFICATION FIRST - call send_mfa_code then verify_mfa_code before calling this.
  Checks refill eligibility, remaining refills, and timing.
  Can specify urgency level and delivery preference.
  Member must be MFA verified and prescription must be active.`,
  category: 'pharmacy',
  parameters: {
    type: 'object',
    properties: {
      rxNumber: {
        type: 'string',
        description: 'The prescription number to refill',
      },
      memberId: {
        type: 'string',
        description: 'The verified member ID',
      },
      urgencyLevel: {
        type: 'string',
        enum: ['standard', 'urgent'],
        description: "Urgency level - 'urgent' for expedited processing",
      },
      deliveryPreference: {
        type: 'string',
        enum: ['pickup', 'delivery', 'mail_order'],
        description: 'How the member wants to receive the medication',
      },
    },
    required: ['rxNumber', 'memberId'],
  },
  handler: async (args, context): Promise<ToolResult<RefillResult>> => {
    const { rxNumber, memberId, urgencyLevel = 'standard', deliveryPreference = 'pickup' } = args;
    const sessionId = context?.sessionId || 'default';

    // =========================================================================
    // CRITICAL: CHECK MFA VERIFICATION BEFORE PROCESSING REFILL
    // =========================================================================
    const mfaStatus = sessionCache.get<{ verified: boolean; canProceed: boolean }>(
      sessionId, 
      'mfa', 
      CacheKeys.mfaStatus(memberId)
    );
    
    if (!mfaStatus || !mfaStatus.verified || !mfaStatus.canProceed) {
      return {
        success: false,
        error: 'MFA verification required. For security, prescription refills require MFA verification. Please call send_mfa_code first to receive a verification code, then call verify_mfa_code with the code. The demo code is 123456.',
      };
    }
    // =========================================================================

    await new Promise(resolve => setTimeout(resolve, 500));

    // Look up prescription
    const rxInfo = REFILL_ELIGIBLE_RX.get(rxNumber);

    if (!rxInfo) {
      return {
        success: true,
        data: {
          success: false,
          message: `Prescription ${rxNumber} was not found. Please verify the prescription number.`,
          requiresAction: {
            action: 'verify_rx_number',
            reason: 'Prescription not found in system',
          },
        },
      };
    }

    // Check if too soon to refill (must be within 7 days of running out)
    const now = new Date();
    const lastFilled = rxInfo.lastFilledDate;
    const daysSinceLastFill = Math.floor((now.getTime() - lastFilled.getTime()) / (1000 * 60 * 60 * 24));
    const daysUntilRefillEligible = rxInfo.daysSupply - 7 - daysSinceLastFill;

    if (daysUntilRefillEligible > 0) {
      const eligibleDate = new Date(now);
      eligibleDate.setDate(eligibleDate.getDate() + daysUntilRefillEligible);

      return {
        success: true,
        data: {
          success: false,
          message: `It's too soon to refill ${rxInfo.medicationName}. You'll be eligible for a refill on ${eligibleDate.toLocaleDateString()}.`,
          refillDetails: {
            rxNumber,
            medicationName: rxInfo.medicationName,
            status: 'too_soon',
          },
        },
      };
    }

    // Check refills remaining
    if (rxInfo.refillsRemaining === 0) {
      return {
        success: true,
        data: {
          success: false,
          message: `${rxInfo.medicationName} has no refills remaining. A new prescription is needed from your doctor.`,
          refillDetails: {
            rxNumber,
            medicationName: rxInfo.medicationName,
            status: 'requires_renewal',
          },
          requiresAction: {
            action: 'contact_prescriber',
            reason: 'No refills remaining - prescription renewal required',
            contactInfo: 'Please contact your prescribing physician to request a new prescription.',
          },
        },
      };
    }

    // Process the refill request
    const confirmationNumber = `REF-${Date.now().toString(36).toUpperCase()}`;
    
    // Calculate ready time based on urgency and delivery preference
    let readyDate = new Date(now);
    if (deliveryPreference === 'mail_order') {
      readyDate.setDate(readyDate.getDate() + (urgencyLevel === 'urgent' ? 3 : 5));
    } else if (deliveryPreference === 'delivery') {
      readyDate.setDate(readyDate.getDate() + (urgencyLevel === 'urgent' ? 1 : 2));
    } else {
      // Pickup
      if (urgencyLevel === 'urgent') {
        readyDate.setHours(readyDate.getHours() + 2);
      } else {
        readyDate.setHours(readyDate.getHours() + 4);
      }
    }

    const readyTimeStr = deliveryPreference === 'pickup'
      ? `Today by ${readyDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : readyDate.toLocaleDateString();

    return {
      success: true,
      data: {
        success: true,
        message: `Your refill request for ${rxInfo.medicationName} has been submitted successfully.`,
        refillDetails: {
          rxNumber,
          medicationName: rxInfo.medicationName,
          status: 'approved',
          estimatedReadyDate: readyTimeStr,
          confirmationNumber,
          pharmacyName: rxInfo.pharmacyName,
          pharmacyPhone: rxInfo.pharmacyPhone,
        },
      },
    };
  },
  isMocked: true,
  version: '1.0.0',
});
