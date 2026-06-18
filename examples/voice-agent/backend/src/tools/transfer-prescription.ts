/**
 * Acme Health - Prescription Transfer Tool
 * 
 * Mock implementation for transferring prescriptions between pharmacies.
 */

import { createTool } from './registry.js';
import type { ToolResult, ToolContext } from '../types/index.js';
import { sessionCache, CacheKeys } from '../services/cache.js';

// =============================================================================
// MOCK PHARMACY DATA
// =============================================================================

interface Pharmacy {
  pharmacyId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  isStLukesPharmacy: boolean;
  acceptsTransfers: boolean;
}

const MOCK_PHARMACIES: Map<string, Pharmacy> = new Map([
  ['PHARM-001', {
    pharmacyId: 'PHARM-001',
    name: "Acme Health Pharmacy - Chesterfield",
    address: '14377 Woodlake Dr',
    city: 'Chesterfield',
    state: 'MO',
    zipCode: '63017',
    phone: '(314) 555-0123',
    isStLukesPharmacy: true,
    acceptsTransfers: true,
  }],
  ['PHARM-002', {
    pharmacyId: 'PHARM-002',
    name: "Acme Health Pharmacy - Bethlehem",
    address: '801 Ostrum St',
    city: 'Bethlehem',
    state: 'PA',
    zipCode: '18015',
    phone: '(610) 555-0456',
    isStLukesPharmacy: true,
    acceptsTransfers: true,
  }],
  ['PHARM-003', {
    pharmacyId: 'PHARM-003',
    name: "Acme Health Pharmacy - Houston",
    address: '6720 Bertner Ave',
    city: 'Houston',
    state: 'TX',
    zipCode: '77030',
    phone: '(713) 555-0789',
    isStLukesPharmacy: true,
    acceptsTransfers: true,
  }],
  ['PHARM-CVS-001', {
    pharmacyId: 'PHARM-CVS-001',
    name: 'CVS Pharmacy #4521',
    address: '2001 Hermann Dr',
    city: 'Houston',
    state: 'TX',
    zipCode: '77004',
    phone: '(713) 555-0321',
    isStLukesPharmacy: false,
    acceptsTransfers: true,
  }],
  ['PHARM-WAL-001', {
    pharmacyId: 'PHARM-WAL-001',
    name: 'Walgreens #12345',
    address: '100 Main St',
    city: 'Chesterfield',
    state: 'MO',
    zipCode: '63017',
    phone: '(314) 555-9876',
    isStLukesPharmacy: false,
    acceptsTransfers: true,
  }],
]);

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface TransferResult {
  success: boolean;
  transferId?: string;
  message: string;
  details?: {
    rxNumber: string;
    medicationName: string;
    fromPharmacy: string;
    toPharmacy: string;
    estimatedReadyTime: string;
    confirmationNumber: string;
  };
  requiresAction?: {
    action: string;
    reason: string;
  };
}

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export const transferPrescriptionTool = createTool<
  {
    rxNumber: string;
    memberId: string;
    toPharmacyId?: string;
    toPharmacyName?: string;
    toPharmacyZipCode?: string;
  },
  TransferResult
>({
  name: 'transfer_prescription',
  description: `Transfer a prescription from one pharmacy to another.
  Can specify the destination pharmacy by ID, name, or zip code.
  Returns transfer confirmation with estimated ready time.
  Member must be verified and the prescription must be active.`,
  category: 'pharmacy',
  parameters: {
    type: 'object',
    properties: {
      rxNumber: {
        type: 'string',
        description: 'The prescription number to transfer',
      },
      memberId: {
        type: 'string',
        description: 'The verified member ID',
      },
      toPharmacyId: {
        type: 'string',
        description: 'Destination pharmacy ID (if known)',
      },
      toPharmacyName: {
        type: 'string',
        description: 'Destination pharmacy name (partial match supported)',
      },
      toPharmacyZipCode: {
        type: 'string',
        description: 'Destination pharmacy zip code (to find nearest)',
      },
    },
    required: ['rxNumber', 'memberId'],
  },
  handler: async (args, context): Promise<ToolResult<TransferResult>> => {
    await new Promise(resolve => setTimeout(resolve, 600));

    const { rxNumber, memberId, toPharmacyId, toPharmacyName, toPharmacyZipCode } = args;
    const sessionId = context?.sessionId;

    // ========================================================================
    // MFA VERIFICATION CHECK - Required for prescription transfers (PII)
    // ========================================================================
    if (sessionId && memberId) {
      const mfaStatus = sessionCache.get<{ verified: boolean; canProceed: boolean }>(
        sessionId,
        'mfa',
        CacheKeys.mfaStatus(memberId)
      );

      if (!mfaStatus || !mfaStatus.verified || !mfaStatus.canProceed) {
        return {
          success: false,
          error: 'MFA verification required. For security, prescription transfers require MFA verification. Please ask the member to verify their identity with the MFA code sent to their registered phone or email first.',
        };
      }
    }

    // Validate prescription exists (simplified check)
    if (!rxNumber.startsWith('RX-')) {
      return {
        success: true,
        data: {
          success: false,
          message: 'Invalid prescription number format. Please verify the RX number.',
        },
      };
    }

    // Find destination pharmacy
    let destinationPharmacy: Pharmacy | undefined;

    if (toPharmacyId) {
      destinationPharmacy = MOCK_PHARMACIES.get(toPharmacyId);
    } else if (toPharmacyName) {
      const searchName = toPharmacyName.toLowerCase();
      destinationPharmacy = Array.from(MOCK_PHARMACIES.values()).find(p =>
        p.name.toLowerCase().includes(searchName)
      );
    } else if (toPharmacyZipCode) {
      // Find Acme Health pharmacy in that zip code, or nearest
      destinationPharmacy = Array.from(MOCK_PHARMACIES.values()).find(
        p => p.zipCode === toPharmacyZipCode && p.isStLukesPharmacy
      );
      if (!destinationPharmacy) {
        destinationPharmacy = Array.from(MOCK_PHARMACIES.values()).find(
          p => p.zipCode.startsWith(toPharmacyZipCode.substring(0, 3))
        );
      }
    }

    if (!destinationPharmacy) {
      return {
        success: true,
        data: {
          success: false,
          message: 'Could not find the destination pharmacy. Please provide more details or contact member services.',
          requiresAction: {
            action: 'provide_pharmacy_details',
            reason: 'Need pharmacy name, ID, or zip code to process transfer',
          },
        },
      };
    }

    if (!destinationPharmacy.acceptsTransfers) {
      return {
        success: true,
        data: {
          success: false,
          message: `${destinationPharmacy.name} is not currently accepting prescription transfers. Please choose a different pharmacy.`,
        },
      };
    }

    // Generate transfer confirmation
    const transferId = `TRF-${Date.now().toString(36).toUpperCase()}`;
    const confirmationNumber = `CONF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    // Estimate ready time (next business day if after 2pm, same day otherwise)
    const now = new Date();
    const hour = now.getHours();
    const readyDate = new Date(now);
    if (hour >= 14) {
      readyDate.setDate(readyDate.getDate() + 1);
    }
    const estimatedReadyTime = `${readyDate.toLocaleDateString()} by 2:00 PM`;

    return {
      success: true,
      data: {
        success: true,
        transferId,
        message: `Your prescription transfer has been initiated successfully.`,
        details: {
          rxNumber,
          medicationName: 'Prescription', // Would be looked up in real implementation
          fromPharmacy: 'Current Pharmacy',
          toPharmacy: destinationPharmacy.name,
          estimatedReadyTime,
          confirmationNumber,
        },
      },
    };
  },
  isMocked: true,
  version: '1.0.0',
});
