/**
 * Acme Health - Prescription Lookup Tool
 * 
 * Mock implementation for looking up member prescriptions.
 * Returns demo-safe data without real PHI.
 */

import { createTool } from './registry.js';
import type { ToolResult, ToolContext } from '../types/index.js';
import { sessionCache, CacheKeys } from '../services/cache.js';

// =============================================================================
// MOCK DATA - PRESCRIPTIONS FOR 4 PATIENT PROFILES
// =============================================================================

interface MockPrescription {
  rxNumber: string;
  medicationName: string;
  genericName: string;
  strength: string;
  form: string;
  quantity: number;
  daysSupply: number;
  refillsRemaining: number;
  lastFilledDate: string;
  nextRefillDate: string;
  prescribingDoctor: string;
  pharmacy: {
    name: string;
    address: string;
    phone: string;
  };
  status: 'active' | 'expired' | 'discontinued' | 'on_hold';
  instructions: string;
  indication: string;
}

const MOCK_PRESCRIPTIONS: Map<string, MockPrescription[]> = new Map([
  // SARAH JOHNSON (MEM-001) - Type 2 Diabetes & Hypertension
  ['MEM-001', [
    {
      rxNumber: 'RX-78901234',
      medicationName: 'Lisinopril',
      genericName: 'Lisinopril',
      strength: '10mg',
      form: 'tablet',
      quantity: 30,
      daysSupply: 30,
      refillsRemaining: 5,
      lastFilledDate: '2025-12-15',
      nextRefillDate: '2026-01-14',
      prescribingDoctor: 'Dr. Patricia Williams',
      pharmacy: {
        name: "Acme Health Pharmacy - Chesterfield",
        address: '14377 Woodlake Dr, Chesterfield, MO 63017',
        phone: '(314) 555-0123',
      },
      status: 'active',
      instructions: 'Take one tablet by mouth once daily in the morning',
      indication: 'High blood pressure management',
    },
    {
      rxNumber: 'RX-78901235',
      medicationName: 'Metformin ER',
      genericName: 'Metformin Extended Release',
      strength: '500mg',
      form: 'tablet',
      quantity: 60,
      daysSupply: 30,
      refillsRemaining: 3,
      lastFilledDate: '2025-12-20',
      nextRefillDate: '2026-01-19',
      prescribingDoctor: 'Dr. Patricia Williams',
      pharmacy: {
        name: "Acme Health Pharmacy - Chesterfield",
        address: '14377 Woodlake Dr, Chesterfield, MO 63017',
        phone: '(314) 555-0123',
      },
      status: 'active',
      instructions: 'Take one tablet by mouth twice daily with meals',
      indication: 'Type 2 diabetes blood sugar control',
    },
    {
      rxNumber: 'RX-78901236',
      medicationName: 'Jardiance',
      genericName: 'Empagliflozin',
      strength: '10mg',
      form: 'tablet',
      quantity: 30,
      daysSupply: 30,
      refillsRemaining: 2,
      lastFilledDate: '2025-12-20',
      nextRefillDate: '2026-01-19',
      prescribingDoctor: 'Dr. Patricia Williams',
      pharmacy: {
        name: "Acme Health Pharmacy - Chesterfield",
        address: '14377 Woodlake Dr, Chesterfield, MO 63017',
        phone: '(314) 555-0123',
      },
      status: 'active',
      instructions: 'Take one tablet by mouth once daily in the morning',
      indication: 'Type 2 diabetes with cardiovascular protection',
    },
  ]],
  
  // ROBERT MARTINEZ (MEM-002) - Cardiovascular Disease & High Cholesterol
  ['MEM-002', [
    {
      rxNumber: 'RX-89012345',
      medicationName: 'Atorvastatin',
      genericName: 'Atorvastatin Calcium',
      strength: '40mg',
      form: 'tablet',
      quantity: 90,
      daysSupply: 90,
      refillsRemaining: 2,
      lastFilledDate: '2025-11-01',
      nextRefillDate: '2026-01-30',
      prescribingDoctor: 'Dr. James Chen',
      pharmacy: {
        name: "Acme Health Pharmacy - Bethlehem",
        address: '801 Ostrum St, Bethlehem, PA 18015',
        phone: '(610) 555-0456',
      },
      status: 'active',
      instructions: 'Take one tablet by mouth once daily at bedtime',
      indication: 'High cholesterol and cardiovascular protection',
    },
    {
      rxNumber: 'RX-89012346',
      medicationName: 'Eliquis',
      genericName: 'Apixaban',
      strength: '5mg',
      form: 'tablet',
      quantity: 60,
      daysSupply: 30,
      refillsRemaining: 4,
      lastFilledDate: '2026-01-05',
      nextRefillDate: '2026-02-04',
      prescribingDoctor: 'Dr. James Chen',
      pharmacy: {
        name: "Acme Health Pharmacy - Bethlehem",
        address: '801 Ostrum St, Bethlehem, PA 18015',
        phone: '(610) 555-0456',
      },
      status: 'active',
      instructions: 'Take one tablet by mouth twice daily with or without food',
      indication: 'Blood thinner for atrial fibrillation',
    },
    {
      rxNumber: 'RX-89012347',
      medicationName: 'Metoprolol Succinate ER',
      genericName: 'Metoprolol Succinate Extended Release',
      strength: '50mg',
      form: 'tablet',
      quantity: 30,
      daysSupply: 30,
      refillsRemaining: 5,
      lastFilledDate: '2026-01-05',
      nextRefillDate: '2026-02-04',
      prescribingDoctor: 'Dr. James Chen',
      pharmacy: {
        name: "Acme Health Pharmacy - Bethlehem",
        address: '801 Ostrum St, Bethlehem, PA 18015',
        phone: '(610) 555-0456',
      },
      status: 'active',
      instructions: 'Take one tablet by mouth once daily. Do not crush or chew.',
      indication: 'Heart rate control for atrial fibrillation',
    },
    {
      rxNumber: 'RX-89012348',
      medicationName: 'Nitroglycerin SL',
      genericName: 'Nitroglycerin Sublingual',
      strength: '0.4mg',
      form: 'sublingual tablet',
      quantity: 25,
      daysSupply: 90,
      refillsRemaining: 3,
      lastFilledDate: '2025-12-01',
      nextRefillDate: '2026-03-01',
      prescribingDoctor: 'Dr. James Chen',
      pharmacy: {
        name: "Acme Health Pharmacy - Bethlehem",
        address: '801 Ostrum St, Bethlehem, PA 18015',
        phone: '(610) 555-0456',
      },
      status: 'active',
      instructions: 'Place one tablet under tongue at first sign of chest pain. May repeat every 5 minutes up to 3 doses. Call 911 if pain persists.',
      indication: 'Chest pain relief (angina)',
    },
  ]],
  
  // EMILY CHEN (MEM-003) - Asthma & Anxiety
  ['MEM-003', [
    {
      rxNumber: 'RX-90123456',
      medicationName: 'Symbicort',
      genericName: 'Budesonide/Formoterol',
      strength: '160/4.5mcg',
      form: 'inhaler',
      quantity: 1,
      daysSupply: 30,
      refillsRemaining: 3,
      lastFilledDate: '2025-12-20',
      nextRefillDate: '2026-01-19',
      prescribingDoctor: 'Dr. Jennifer Lee',
      pharmacy: {
        name: "Acme Health Pharmacy - Houston",
        address: '6624 Fannin St, Houston, TX 77030',
        phone: '(713) 555-0789',
      },
      status: 'active',
      instructions: 'Inhale 2 puffs by mouth twice daily. Rinse mouth after use.',
      indication: 'Asthma maintenance therapy',
    },
    {
      rxNumber: 'RX-90123457',
      medicationName: 'ProAir HFA',
      genericName: 'Albuterol Sulfate',
      strength: '90mcg',
      form: 'inhaler',
      quantity: 1,
      daysSupply: 30,
      refillsRemaining: 1,
      lastFilledDate: '2025-12-10',
      nextRefillDate: '2026-01-09',
      prescribingDoctor: 'Dr. Jennifer Lee',
      pharmacy: {
        name: "Acme Health Pharmacy - Houston",
        address: '6624 Fannin St, Houston, TX 77030',
        phone: '(713) 555-0789',
      },
      status: 'active',
      instructions: 'Inhale 1-2 puffs every 4-6 hours as needed for shortness of breath or wheezing',
      indication: 'Rescue inhaler for asthma attacks',
    },
    {
      rxNumber: 'RX-90123458',
      medicationName: 'Lexapro',
      genericName: 'Escitalopram',
      strength: '10mg',
      form: 'tablet',
      quantity: 30,
      daysSupply: 30,
      refillsRemaining: 5,
      lastFilledDate: '2026-01-10',
      nextRefillDate: '2026-02-09',
      prescribingDoctor: 'Dr. Amanda Foster',
      pharmacy: {
        name: "Acme Health Pharmacy - Houston",
        address: '6624 Fannin St, Houston, TX 77030',
        phone: '(713) 555-0789',
      },
      status: 'active',
      instructions: 'Take one tablet by mouth once daily in the morning',
      indication: 'Generalized anxiety disorder',
    },
    {
      rxNumber: 'RX-90123459',
      medicationName: 'Zyrtec',
      genericName: 'Cetirizine',
      strength: '10mg',
      form: 'tablet',
      quantity: 30,
      daysSupply: 30,
      refillsRemaining: 6,
      lastFilledDate: '2026-01-05',
      nextRefillDate: '2026-02-04',
      prescribingDoctor: 'Dr. Jennifer Lee',
      pharmacy: {
        name: "Acme Health Pharmacy - Houston",
        address: '6624 Fannin St, Houston, TX 77030',
        phone: '(713) 555-0789',
      },
      status: 'active',
      instructions: 'Take one tablet by mouth once daily',
      indication: 'Seasonal allergies',
    },
  ]],
  
  // JAMES WILSON (MEM-004) - COPD & Arthritis
  ['MEM-004', [
    {
      rxNumber: 'RX-01234567',
      medicationName: 'Spiriva Respimat',
      genericName: 'Tiotropium Bromide',
      strength: '2.5mcg',
      form: 'inhaler',
      quantity: 1,
      daysSupply: 30,
      refillsRemaining: 4,
      lastFilledDate: '2026-01-08',
      nextRefillDate: '2026-02-07',
      prescribingDoctor: 'Dr. Michael Brown',
      pharmacy: {
        name: "Acme Health Pharmacy - Chesterfield",
        address: '14377 Woodlake Dr, Chesterfield, MO 63017',
        phone: '(314) 555-0123',
      },
      status: 'active',
      instructions: 'Inhale 2 puffs by mouth once daily at the same time each day',
      indication: 'COPD maintenance therapy',
    },
    {
      rxNumber: 'RX-01234568',
      medicationName: 'Breo Ellipta',
      genericName: 'Fluticasone/Vilanterol',
      strength: '100/25mcg',
      form: 'inhaler',
      quantity: 1,
      daysSupply: 30,
      refillsRemaining: 3,
      lastFilledDate: '2026-01-08',
      nextRefillDate: '2026-02-07',
      prescribingDoctor: 'Dr. Michael Brown',
      pharmacy: {
        name: "Acme Health Pharmacy - Chesterfield",
        address: '14377 Woodlake Dr, Chesterfield, MO 63017',
        phone: '(314) 555-0123',
      },
      status: 'active',
      instructions: 'Inhale 1 puff by mouth once daily. Rinse mouth after use.',
      indication: 'COPD long-term treatment',
    },
    {
      rxNumber: 'RX-01234569',
      medicationName: 'Tylenol Arthritis',
      genericName: 'Acetaminophen Extended Release',
      strength: '650mg',
      form: 'tablet',
      quantity: 100,
      daysSupply: 30,
      refillsRemaining: 6,
      lastFilledDate: '2026-01-10',
      nextRefillDate: '2026-02-09',
      prescribingDoctor: 'Dr. Susan Taylor',
      pharmacy: {
        name: "Acme Health Pharmacy - Chesterfield",
        address: '14377 Woodlake Dr, Chesterfield, MO 63017',
        phone: '(314) 555-0123',
      },
      status: 'active',
      instructions: 'Take 2 tablets by mouth every 8 hours as needed for pain. Do not exceed 6 tablets in 24 hours.',
      indication: 'Arthritis pain relief',
    },
    {
      rxNumber: 'RX-01234570',
      medicationName: 'Flomax',
      genericName: 'Tamsulosin',
      strength: '0.4mg',
      form: 'capsule',
      quantity: 30,
      daysSupply: 30,
      refillsRemaining: 5,
      lastFilledDate: '2026-01-10',
      nextRefillDate: '2026-02-09',
      prescribingDoctor: 'Dr. David Kim',
      pharmacy: {
        name: "Acme Health Pharmacy - Chesterfield",
        address: '14377 Woodlake Dr, Chesterfield, MO 63017',
        phone: '(314) 555-0123',
      },
      status: 'active',
      instructions: 'Take one capsule by mouth once daily 30 minutes after the same meal each day',
      indication: 'Benign prostatic hyperplasia (enlarged prostate)',
    },
    {
      rxNumber: 'RX-01234571',
      medicationName: 'Prednisone',
      genericName: 'Prednisone',
      strength: '10mg',
      form: 'tablet',
      quantity: 21,
      daysSupply: 7,
      refillsRemaining: 0,
      lastFilledDate: '2026-01-15',
      nextRefillDate: '2026-01-22',
      prescribingDoctor: 'Dr. Michael Brown',
      pharmacy: {
        name: "Acme Health Pharmacy - Chesterfield",
        address: '14377 Woodlake Dr, Chesterfield, MO 63017',
        phone: '(314) 555-0123',
      },
      status: 'active',
      instructions: 'Take as directed: 3 tablets daily for 3 days, then 2 tablets daily for 2 days, then 1 tablet daily for 2 days.',
      indication: 'COPD exacerbation treatment',
    },
  ]],
]);

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface PrescriptionLookupResult {
  found: boolean;
  prescriptions?: Array<{
    rxNumber: string;
    medicationName: string;
    strength: string;
    form: string;
    quantity: number;
    daysSupply: number;
    refillsRemaining: number;
    nextRefillDate: string;
    pharmacyName: string;
    status: string;
    canRequestRefill: boolean;
  }>;
  message?: string;
}

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export const lookupPrescriptionsTool = createTool<
  {
    memberId: string;
    medicationName?: string;
    activeOnly?: boolean;
  },
  PrescriptionLookupResult
>({
  name: 'lookup_prescriptions',
  description: `Look up prescriptions for a verified member. 
  IMPORTANT: MFA verification is REQUIRED before viewing prescription details.
  Call send_mfa_code first, then verify_mfa_code with the code provided by the member.
  Can optionally filter by medication name or show only active prescriptions.
  Returns a list of prescriptions with refill eligibility information.
  Member must be verified via MFA before calling this tool.`,
  category: 'prescriptions',
  parameters: {
    type: 'object',
    properties: {
      memberId: {
        type: 'string',
        description: 'The verified member ID',
      },
      medicationName: {
        type: 'string',
        description: 'Optional: Filter by medication name (partial match supported)',
      },
      activeOnly: {
        type: 'boolean',
        description: 'Optional: If true, only return active prescriptions (default: true)',
      },
    },
    required: ['memberId'],
  },
  handler: async (args, context): Promise<ToolResult<PrescriptionLookupResult>> => {
    const { memberId, medicationName, activeOnly = true } = args;
    const sessionId = context?.sessionId || 'default';

    // =========================================================================
    // CRITICAL: CHECK MFA VERIFICATION BEFORE RETURNING ANY PII
    // =========================================================================
    const mfaStatus = sessionCache.get<{ verified: boolean; canProceed: boolean }>(
      sessionId, 
      'mfa', 
      CacheKeys.mfaStatus(memberId)
    );
    
    if (!mfaStatus || !mfaStatus.verified || !mfaStatus.canProceed) {
      return {
        success: false,
        error: 'MFA verification required. For security, please verify your identity first by calling send_mfa_code to receive a verification code, then call verify_mfa_code with the code. The demo code is 123456.',
      };
    }
    // =========================================================================

    const cacheKey = `${CacheKeys.prescriptions(memberId)}:${medicationName || 'all'}:${activeOnly}`;

    // Check cache first for instant response
    const cachedPrescriptions = sessionCache.get<PrescriptionLookupResult>(
      sessionId, 
      'prescriptions', 
      cacheKey
    );
    if (cachedPrescriptions && cachedPrescriptions.found) {
      console.log(`[Cache] Prescriptions HIT for ${memberId}`);
      return { success: true, data: cachedPrescriptions };
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));

    const memberPrescriptions = MOCK_PRESCRIPTIONS.get(memberId);

    if (!memberPrescriptions || memberPrescriptions.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          message: 'No prescriptions found for this member.',
        },
      };
    }

    let filtered = memberPrescriptions;

    // Filter by active status
    if (activeOnly) {
      filtered = filtered.filter(rx => rx.status === 'active');
    }

    // Filter by medication name
    if (medicationName) {
      const searchTerm = medicationName.toLowerCase();
      filtered = filtered.filter(
        rx =>
          rx.medicationName.toLowerCase().includes(searchTerm) ||
          rx.genericName.toLowerCase().includes(searchTerm)
      );
    }

    if (filtered.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          message: medicationName
            ? `No prescriptions found matching "${medicationName}".`
            : 'No active prescriptions found for this member.',
        },
      };
    }

    // Map to safe response format
    const today = new Date();
    const prescriptions = filtered.map(rx => {
      const nextRefillDate = new Date(rx.nextRefillDate);
      const canRequestRefill = rx.refillsRemaining > 0 && nextRefillDate <= today;

      return {
        rxNumber: rx.rxNumber,
        medicationName: rx.medicationName,
        strength: rx.strength,
        form: rx.form,
        quantity: rx.quantity,
        daysSupply: rx.daysSupply,
        refillsRemaining: rx.refillsRemaining,
        nextRefillDate: rx.nextRefillDate,
        pharmacyName: rx.pharmacy.name,
        status: rx.status,
        canRequestRefill,
      };
    });

    const result: PrescriptionLookupResult = {
      found: true,
      prescriptions,
    };

    // Cache the result for fast subsequent access
    sessionCache.set(sessionId, 'prescriptions', cacheKey, result);

    return { success: true, data: result };
  },
  isMocked: true,
  version: '1.0.0',
});
