/**
 * Acme Health - Patient Context Retrieval Tool
 * 
 * Mock implementation for retrieving demo-safe patient context.
 * NO PHI - all data is synthetic for demonstration purposes.
 */

import { createTool } from './registry.js';
import type { ToolResult, ToolContext } from '../types/index.js';
import { sessionCache, CacheKeys } from '../services/cache.js';

// =============================================================================
// MOCK PATIENT CONTEXT DATA - 4 DEMO PROFILES
// =============================================================================

interface MedicalCondition {
  condition: string;
  diagnosis: string;
  diagnosedDate: string;
  severity: 'mild' | 'moderate' | 'severe' | 'controlled';
  treatingPhysician: string;
}

interface PatientContext {
  memberId: string;
  demographics: {
    firstName: string;
    lastName: string;
    preferredName: string;
    dateOfBirth: string;
    age: number;
    gender: string;
    ageRange: string;
    preferredLanguage: string;
    communicationPreference: 'phone' | 'email' | 'text' | 'mail';
    address: {
      street: string;
      city: string;
      state: string;
      zip: string;
    };
    phone: string;
    email: string;
  };
  medicalHistory: {
    conditions: MedicalCondition[];
    allergies: string[];
    bloodType?: string;
    height?: string;
    weight?: string;
  };
  planInfo: {
    planType: 'gold' | 'silver' | 'bronze' | 'platinum';
    planName: string;
    effectiveDate: string;
    pcpAssigned: boolean;
    pcpName?: string;
    copay: {
      primaryCare: number;
      specialist: number;
      emergency: number;
      genericDrug: number;
      brandDrug: number;
    };
  };
  preferences: {
    preferredPharmacy?: string;
    mailOrderEnrolled: boolean;
    autoRefillEnabled: boolean;
    genericPreferred: boolean;
  };
  recentActivity: {
    lastCallDate?: string;
    lastCallReason?: string;
    lastVisitDate?: string;
    lastVisitReason?: string;
    openCases?: number;
    recentRefills?: number;
  };
  alerts: Array<{
    type: 'info' | 'warning' | 'action_required';
    message: string;
  }>;
}

// =============================================================================
// 4 DEMO PATIENT PROFILES
// =============================================================================

const MOCK_PATIENT_CONTEXTS: Map<string, PatientContext> = new Map([
  // PROFILE 1: Sarah Johnson - 38, Type 2 Diabetes & Hypertension
  ['MEM-001', {
    memberId: 'MEM-001',
    demographics: {
      firstName: 'Sarah',
      lastName: 'Johnson',
      preferredName: 'Sarah',
      dateOfBirth: '1987-06-15',
      age: 38,
      gender: 'Female',
      ageRange: '35-44',
      preferredLanguage: 'English',
      communicationPreference: 'text',
      address: {
        street: '1234 Oak Lane',
        city: 'Chesterfield',
        state: 'MO',
        zip: '63017',
      },
      phone: '(314) 555-1234',
      email: 'sarah.johnson@email.com',
    },
    medicalHistory: {
      conditions: [
        {
          condition: 'Type 2 Diabetes Mellitus',
          diagnosis: 'E11.9 - Type 2 diabetes mellitus without complications',
          diagnosedDate: '2022-03-15',
          severity: 'controlled',
          treatingPhysician: 'Dr. Patricia Williams',
        },
        {
          condition: 'Essential Hypertension',
          diagnosis: 'I10 - Essential (primary) hypertension',
          diagnosedDate: '2021-08-20',
          severity: 'controlled',
          treatingPhysician: 'Dr. Patricia Williams',
        },
      ],
      allergies: ['Penicillin', 'Sulfa drugs'],
      bloodType: 'A+',
      height: '5\'6"',
      weight: '165 lbs',
    },
    planInfo: {
      planType: 'gold',
      planName: "Acme Health Gold PPO",
      effectiveDate: '2025-01-01',
      pcpAssigned: true,
      pcpName: 'Dr. Patricia Williams',
      copay: {
        primaryCare: 25,
        specialist: 40,
        emergency: 150,
        genericDrug: 10,
        brandDrug: 35,
      },
    },
    preferences: {
      preferredPharmacy: "Acme Health Pharmacy - Chesterfield",
      mailOrderEnrolled: true,
      autoRefillEnabled: true,
      genericPreferred: true,
    },
    recentActivity: {
      lastCallDate: '2026-01-10',
      lastCallReason: 'Prescription refill inquiry',
      lastVisitDate: '2025-12-15',
      lastVisitReason: 'Quarterly diabetes checkup',
      openCases: 0,
      recentRefills: 2,
    },
    alerts: [
      { type: 'info', message: 'Annual wellness visit due in February 2026' },
      { type: 'info', message: 'A1C test scheduled for January 30, 2026' },
    ],
  }],

  // PROFILE 2: Robert Martinez - 62, Cardiovascular Disease & High Cholesterol
  ['MEM-002', {
    memberId: 'MEM-002',
    demographics: {
      firstName: 'Robert',
      lastName: 'Martinez',
      preferredName: 'Bob',
      dateOfBirth: '1963-11-22',
      age: 62,
      gender: 'Male',
      ageRange: '55-64',
      preferredLanguage: 'English',
      communicationPreference: 'phone',
      address: {
        street: '567 Maple Street',
        city: 'Bethlehem',
        state: 'PA',
        zip: '18015',
      },
      phone: '(610) 555-5678',
      email: 'bob.martinez@email.com',
    },
    medicalHistory: {
      conditions: [
        {
          condition: 'Coronary Artery Disease',
          diagnosis: 'I25.10 - Atherosclerotic heart disease of native coronary artery',
          diagnosedDate: '2020-06-10',
          severity: 'moderate',
          treatingPhysician: 'Dr. James Chen',
        },
        {
          condition: 'Hyperlipidemia',
          diagnosis: 'E78.5 - Hyperlipidemia, unspecified',
          diagnosedDate: '2018-02-28',
          severity: 'controlled',
          treatingPhysician: 'Dr. Robert Martinez',
        },
        {
          condition: 'Atrial Fibrillation',
          diagnosis: 'I48.91 - Unspecified atrial fibrillation',
          diagnosedDate: '2021-09-15',
          severity: 'controlled',
          treatingPhysician: 'Dr. James Chen',
        },
      ],
      allergies: ['Aspirin', 'Iodine contrast dye'],
      bloodType: 'O-',
      height: '5\'10"',
      weight: '195 lbs',
    },
    planInfo: {
      planType: 'platinum',
      planName: "Acme Health Platinum Premier",
      effectiveDate: '2024-07-01',
      pcpAssigned: true,
      pcpName: 'Dr. Robert Martinez',
      copay: {
        primaryCare: 15,
        specialist: 25,
        emergency: 100,
        genericDrug: 5,
        brandDrug: 25,
      },
    },
    preferences: {
      preferredPharmacy: "Acme Health Pharmacy - Bethlehem",
      mailOrderEnrolled: true,
      autoRefillEnabled: true,
      genericPreferred: false,
    },
    recentActivity: {
      lastCallDate: '2026-01-05',
      lastCallReason: 'Benefits inquiry for cardiac rehab',
      lastVisitDate: '2025-12-20',
      lastVisitReason: 'Cardiology follow-up',
      openCases: 0,
      recentRefills: 3,
    },
    alerts: [
      { type: 'warning', message: 'Blood thinner medication requires INR monitoring' },
      { type: 'info', message: 'Cardiac stress test scheduled for February 2026' },
    ],
  }],

  // PROFILE 3: Emily Chen - 28, Asthma & Anxiety
  ['MEM-003', {
    memberId: 'MEM-003',
    demographics: {
      firstName: 'Emily',
      lastName: 'Chen',
      preferredName: 'Emily',
      dateOfBirth: '1997-09-03',
      age: 28,
      gender: 'Female',
      ageRange: '25-34',
      preferredLanguage: 'English',
      communicationPreference: 'email',
      address: {
        street: '890 Pine Avenue, Apt 4B',
        city: 'Houston',
        state: 'TX',
        zip: '77001',
      },
      phone: '(713) 555-9012',
      email: 'emily.chen@email.com',
    },
    medicalHistory: {
      conditions: [
        {
          condition: 'Persistent Asthma',
          diagnosis: 'J45.30 - Mild persistent asthma, uncomplicated',
          diagnosedDate: '2015-04-12',
          severity: 'mild',
          treatingPhysician: 'Dr. Jennifer Lee',
        },
        {
          condition: 'Generalized Anxiety Disorder',
          diagnosis: 'F41.1 - Generalized anxiety disorder',
          diagnosedDate: '2022-08-05',
          severity: 'moderate',
          treatingPhysician: 'Dr. Amanda Foster',
        },
        {
          condition: 'Seasonal Allergies',
          diagnosis: 'J30.2 - Other seasonal allergic rhinitis',
          diagnosedDate: '2010-05-01',
          severity: 'mild',
          treatingPhysician: 'Dr. Jennifer Lee',
        },
      ],
      allergies: ['Latex', 'Tree nuts'],
      bloodType: 'B+',
      height: '5\'4"',
      weight: '125 lbs',
    },
    planInfo: {
      planType: 'silver',
      planName: "Acme Health Silver HMO",
      effectiveDate: '2025-01-01',
      pcpAssigned: true,
      pcpName: 'Dr. Jennifer Lee',
      copay: {
        primaryCare: 30,
        specialist: 50,
        emergency: 200,
        genericDrug: 15,
        brandDrug: 45,
      },
    },
    preferences: {
      preferredPharmacy: "Acme Health Pharmacy - Houston",
      mailOrderEnrolled: false,
      autoRefillEnabled: false,
      genericPreferred: true,
    },
    recentActivity: {
      lastCallDate: '2026-01-20',
      lastCallReason: 'Refill request for inhaler',
      lastVisitDate: '2026-01-10',
      lastVisitReason: 'Anxiety medication follow-up',
      openCases: 1,
      recentRefills: 2,
    },
    alerts: [
      { type: 'action_required', message: 'Rescue inhaler prescription expires in 15 days - renewal needed' },
      { type: 'info', message: 'Mental health check-in scheduled for February 5, 2026' },
    ],
  }],

  // PROFILE 4: James Wilson - 72, COPD & Arthritis
  ['MEM-004', {
    memberId: 'MEM-004',
    demographics: {
      firstName: 'James',
      lastName: 'Wilson',
      preferredName: 'Jim',
      dateOfBirth: '1953-03-28',
      age: 72,
      gender: 'Male',
      ageRange: '65+',
      preferredLanguage: 'English',
      communicationPreference: 'phone',
      address: {
        street: '456 Sunset Boulevard',
        city: 'St. Louis',
        state: 'MO',
        zip: '63101',
      },
      phone: '(314) 555-3456',
      email: 'james.wilson@email.com',
    },
    medicalHistory: {
      conditions: [
        {
          condition: 'Chronic Obstructive Pulmonary Disease (COPD)',
          diagnosis: 'J44.1 - Chronic obstructive pulmonary disease with acute exacerbation',
          diagnosedDate: '2018-11-20',
          severity: 'moderate',
          treatingPhysician: 'Dr. Michael Brown',
        },
        {
          condition: 'Osteoarthritis',
          diagnosis: 'M19.90 - Primary osteoarthritis, unspecified site',
          diagnosedDate: '2016-06-15',
          severity: 'moderate',
          treatingPhysician: 'Dr. Susan Taylor',
        },
        {
          condition: 'Chronic Kidney Disease Stage 3',
          diagnosis: 'N18.3 - Chronic kidney disease, stage 3',
          diagnosedDate: '2023-04-10',
          severity: 'moderate',
          treatingPhysician: 'Dr. Michael Brown',
        },
        {
          condition: 'Benign Prostatic Hyperplasia',
          diagnosis: 'N40.0 - Benign prostatic hyperplasia without lower urinary tract symptoms',
          diagnosedDate: '2020-02-14',
          severity: 'mild',
          treatingPhysician: 'Dr. David Kim',
        },
      ],
      allergies: ['Codeine', 'NSAIDs'],
      bloodType: 'AB+',
      height: '5\'9"',
      weight: '180 lbs',
    },
    planInfo: {
      planType: 'platinum',
      planName: "Acme Health Medicare Advantage Platinum",
      effectiveDate: '2023-01-01',
      pcpAssigned: true,
      pcpName: 'Dr. Michael Brown',
      copay: {
        primaryCare: 0,
        specialist: 20,
        emergency: 90,
        genericDrug: 0,
        brandDrug: 20,
      },
    },
    preferences: {
      preferredPharmacy: "Acme Health Pharmacy - Chesterfield",
      mailOrderEnrolled: true,
      autoRefillEnabled: true,
      genericPreferred: true,
    },
    recentActivity: {
      lastCallDate: '2026-01-15',
      lastCallReason: 'Questions about new arthritis medication',
      lastVisitDate: '2026-01-08',
      lastVisitReason: 'COPD management and pulmonary function test',
      openCases: 0,
      recentRefills: 4,
    },
    alerts: [
      { type: 'warning', message: 'Kidney function requires medication dosage adjustments - consult pharmacist' },
      { type: 'info', message: 'Annual Medicare wellness visit completed January 2026' },
      { type: 'action_required', message: 'Flu shot recommended - not yet received this season' },
    ],
  }],
]);

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface PatientContextResult {
  found: boolean;
  context?: {
    preferredName: string;
    planType: string;
    planName: string;
    pcpName?: string;
    preferredPharmacy?: string;
    communicationPreference: string;
    mailOrderEnrolled: boolean;
    alerts: Array<{
      type: string;
      message: string;
    }>;
  };
  message?: string;
}

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export const retrievePatientContextTool = createTool<
  {
    memberId: string;
  },
  PatientContextResult
>({
  name: 'retrieve_patient_context',
  description: `Retrieve non-PHI patient context for personalized service.
  Returns preferences, plan information, and relevant alerts.
  Helps provide personalized assistance without accessing protected health information.
  Member must be verified before calling this tool.`,
  category: 'patient',
  parameters: {
    type: 'object',
    properties: {
      memberId: {
        type: 'string',
        description: 'The verified member ID',
      },
    },
    required: ['memberId'],
  },
  handler: async (args, context): Promise<ToolResult<PatientContextResult>> => {
    await new Promise(resolve => setTimeout(resolve, 200));

    const { memberId } = args;
    const sessionId = context?.sessionId;

    // ========================================================================
    // MFA VERIFICATION CHECK - Required for patient context (contains PII)
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
          error: 'MFA verification required. For security, accessing patient context requires MFA verification. Please ask the member to verify their identity with the MFA code sent to their registered phone or email first.',
        };
      }
    }

    const patientContext = MOCK_PATIENT_CONTEXTS.get(memberId);

    if (!patientContext) {
      return {
        success: true,
        data: {
          found: false,
          message: 'Patient context not available. Basic service can still be provided.',
        },
      };
    }

    return {
      success: true,
      data: {
        found: true,
        context: {
          preferredName: patientContext.demographics.preferredName,
          planType: patientContext.planInfo.planType,
          planName: patientContext.planInfo.planName,
          pcpName: patientContext.planInfo.pcpName,
          preferredPharmacy: patientContext.preferences.preferredPharmacy,
          communicationPreference: patientContext.demographics.communicationPreference,
          mailOrderEnrolled: patientContext.preferences.mailOrderEnrolled,
          alerts: patientContext.alerts,
        },
      },
    };
  },
  isMocked: true,
  version: '1.0.0',
});
