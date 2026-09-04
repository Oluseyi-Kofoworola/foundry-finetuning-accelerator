/**
 * Acme Health - Medication Pricing Tool
 * 
 * Mock implementation for calculating medication prices.
 * Shows pricing based on plan type and pharmacy tier.
 */

import { createTool } from './registry.js';
import type { ToolResult, ToolContext } from '../types/index.js';

// =============================================================================
// MOCK PRICING DATA
// =============================================================================

interface DrugPricing {
  medicationName: string;
  tier: 1 | 2 | 3 | 4; // Formulary tier
  retailPrice: number;
  copays: {
    bronze: number;
    silver: number;
    gold: number;
    platinum: number;
  };
  mailOrderDiscount: number; // Percentage
  genericAvailable: boolean;
  genericName?: string;
  genericCopays?: {
    bronze: number;
    silver: number;
    gold: number;
    platinum: number;
  };
}

const DRUG_PRICING: Map<string, DrugPricing> = new Map([
  ['lisinopril', {
    medicationName: 'Lisinopril',
    tier: 1,
    retailPrice: 45.00,
    copays: { bronze: 15, silver: 10, gold: 5, platinum: 0 },
    mailOrderDiscount: 20,
    genericAvailable: false,
  }],
  ['metformin', {
    medicationName: 'Metformin',
    tier: 1,
    retailPrice: 35.00,
    copays: { bronze: 15, silver: 10, gold: 5, platinum: 0 },
    mailOrderDiscount: 20,
    genericAvailable: false,
  }],
  ['metformin er', {
    medicationName: 'Metformin ER',
    tier: 1,
    retailPrice: 42.00,
    copays: { bronze: 15, silver: 10, gold: 5, platinum: 0 },
    mailOrderDiscount: 20,
    genericAvailable: false,
  }],
  ['atorvastatin', {
    medicationName: 'Atorvastatin',
    tier: 1,
    retailPrice: 55.00,
    copays: { bronze: 15, silver: 10, gold: 5, platinum: 0 },
    mailOrderDiscount: 25,
    genericAvailable: false,
  }],
  ['lipitor', {
    medicationName: 'Lipitor',
    tier: 3,
    retailPrice: 285.00,
    copays: { bronze: 60, silver: 45, gold: 35, platinum: 20 },
    mailOrderDiscount: 15,
    genericAvailable: true,
    genericName: 'Atorvastatin',
    genericCopays: { bronze: 15, silver: 10, gold: 5, platinum: 0 },
  }],
  ['omeprazole', {
    medicationName: 'Omeprazole',
    tier: 1,
    retailPrice: 28.00,
    copays: { bronze: 10, silver: 5, gold: 0, platinum: 0 },
    mailOrderDiscount: 20,
    genericAvailable: false,
  }],
  ['amlodipine', {
    medicationName: 'Amlodipine',
    tier: 1,
    retailPrice: 38.00,
    copays: { bronze: 15, silver: 10, gold: 5, platinum: 0 },
    mailOrderDiscount: 20,
    genericAvailable: false,
  }],
  ['eliquis', {
    medicationName: 'Eliquis',
    tier: 4,
    retailPrice: 580.00,
    copays: { bronze: 150, silver: 100, gold: 75, platinum: 50 },
    mailOrderDiscount: 10,
    genericAvailable: false,
  }],
  ['humira', {
    medicationName: 'Humira',
    tier: 4,
    retailPrice: 6800.00,
    copays: { bronze: 500, silver: 350, gold: 200, platinum: 100 },
    mailOrderDiscount: 5,
    genericAvailable: false,
  }],
  ['ozempic', {
    medicationName: 'Ozempic',
    tier: 3,
    retailPrice: 935.00,
    copays: { bronze: 200, silver: 150, gold: 100, platinum: 75 },
    mailOrderDiscount: 10,
    genericAvailable: false,
  }],
]);

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface PricingResult {
  found: boolean;
  medicationName?: string;
  pricing?: {
    retailPrice: number;
    yourCopay: number;
    tier: number;
    tierDescription: string;
    mailOrderPrice?: number;
    savings?: number;
  };
  genericAlternative?: {
    name: string;
    copay: number;
    potentialSavings: number;
  };
  message?: string;
}

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export const calculateMedicationPriceTool = createTool<
  {
    medicationName: string;
    planType: 'bronze' | 'silver' | 'gold' | 'platinum';
    quantity?: number;
    useMailOrder?: boolean;
  },
  PricingResult
>({
  name: 'calculate_medication_price',
  description: `Calculate the price of a medication based on the member's plan type.
  Shows copay amounts, formulary tier, and potential savings with mail order or generic alternatives.
  Useful for helping members understand their medication costs.`,
  category: 'pricing',
  parameters: {
    type: 'object',
    properties: {
      medicationName: {
        type: 'string',
        description: 'The name of the medication to price',
      },
      planType: {
        type: 'string',
        enum: ['bronze', 'silver', 'gold', 'platinum'],
        description: "The member's plan type",
      },
      quantity: {
        type: 'number',
        description: 'Quantity (default: 30 day supply)',
      },
      useMailOrder: {
        type: 'boolean',
        description: 'Calculate mail order pricing (90-day supply)',
      },
    },
    required: ['medicationName', 'planType'],
  },
  handler: async (args, context): Promise<ToolResult<PricingResult>> => {
    await new Promise(resolve => setTimeout(resolve, 250));

    const { medicationName, planType, quantity = 30, useMailOrder = false } = args;

    // Normalize medication name for lookup
    const normalizedName = medicationName.toLowerCase().trim();
    const drugInfo = DRUG_PRICING.get(normalizedName);

    if (!drugInfo) {
      return {
        success: true,
        data: {
          found: false,
          message: `Medication "${medicationName}" not found in our formulary. Please verify the medication name or contact your pharmacist for assistance.`,
        },
      };
    }

    // Get tier description
    const tierDescriptions = {
      1: 'Preferred Generic',
      2: 'Non-Preferred Generic',
      3: 'Preferred Brand',
      4: 'Specialty',
    };

    // Calculate pricing
    const baseCopay = drugInfo.copays[planType];
    let finalCopay = baseCopay;
    let mailOrderPrice: number | undefined;
    let savings: number | undefined;

    if (useMailOrder) {
      // Mail order is 3 months supply with discount
      const threeMonthCopay = baseCopay * 3;
      const discount = threeMonthCopay * (drugInfo.mailOrderDiscount / 100);
      mailOrderPrice = threeMonthCopay - discount;
      savings = (baseCopay * 3) - mailOrderPrice;
    }

    // Check for generic alternative
    let genericAlternative: PricingResult['genericAlternative'];
    if (drugInfo.genericAvailable && drugInfo.genericName && drugInfo.genericCopays) {
      const genericCopay = drugInfo.genericCopays[planType];
      genericAlternative = {
        name: drugInfo.genericName,
        copay: genericCopay,
        potentialSavings: baseCopay - genericCopay,
      };
    }

    return {
      success: true,
      data: {
        found: true,
        medicationName: drugInfo.medicationName,
        pricing: {
          retailPrice: drugInfo.retailPrice,
          yourCopay: finalCopay,
          tier: drugInfo.tier,
          tierDescription: tierDescriptions[drugInfo.tier],
          mailOrderPrice,
          savings,
        },
        genericAlternative,
      },
    };
  },
  isMocked: true,
  version: '1.0.0',
});
