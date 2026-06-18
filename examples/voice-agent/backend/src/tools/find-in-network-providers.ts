/**
 * Acme Health - In-Network Provider Finder Tool
 * 
 * Mock implementation for finding in-network healthcare providers.
 * Returns demo-safe provider information.
 */

import { createTool } from './registry.js';
import type { ToolResult, ToolContext } from '../types/index.js';

// =============================================================================
// MOCK DATA
// =============================================================================

interface MockProvider {
  providerId: string;
  name: string;
  specialty: string;
  facility: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  phone: string;
  acceptingNewPatients: boolean;
  languages: string[];
  rating: number;
  networkTier: 'preferred' | 'standard' | 'out-of-network';
  nextAvailableAppointment?: string;
}

const MOCK_PROVIDERS: MockProvider[] = [
  // Missouri providers
  {
    providerId: 'PROV-001',
    name: 'Dr. Patricia Williams, MD',
    specialty: 'Internal Medicine',
    facility: "Acme Health Hospital - Chesterfield",
    address: {
      street: '14377 Woodlake Dr',
      city: 'Chesterfield',
      state: 'MO',
      zipCode: '63017',
    },
    phone: '(314) 205-6060',
    acceptingNewPatients: true,
    languages: ['English', 'Spanish'],
    rating: 4.8,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-01-27',
  },
  {
    providerId: 'PROV-002',
    name: 'Dr. James Thompson, DO',
    specialty: 'Family Medicine',
    facility: "Acme Health Hospital - Creve Coeur",
    address: {
      street: '12345 Olive Blvd',
      city: 'Creve Coeur',
      state: 'MO',
      zipCode: '63141',
    },
    phone: '(314) 205-6061',
    acceptingNewPatients: true,
    languages: ['English'],
    rating: 4.6,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-01-25',
  },
  {
    providerId: 'PROV-003',
    name: 'Dr. Sarah Kim, MD',
    specialty: 'Cardiology',
    facility: "Acme Health Heart & Vascular Center",
    address: {
      street: '232 S Woods Mill Rd',
      city: 'Chesterfield',
      state: 'MO',
      zipCode: '63017',
    },
    phone: '(314) 205-6100',
    acceptingNewPatients: true,
    languages: ['English', 'Korean'],
    rating: 4.9,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-02-01',
  },
  // Pennsylvania providers - Lehigh Valley area (ZIP 18xxx)
  {
    providerId: 'PROV-004',
    name: 'Dr. Robert Martinez, MD',
    specialty: 'Internal Medicine',
    facility: "Acme Health University Hospital - Bethlehem",
    address: {
      street: '801 Ostrum St',
      city: 'Bethlehem',
      state: 'PA',
      zipCode: '18015',
    },
    phone: '(610) 954-4000',
    acceptingNewPatients: true,
    languages: ['English', 'Spanish', 'Portuguese'],
    rating: 4.7,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-01-28',
  },
  {
    providerId: 'PROV-005',
    name: 'Dr. Emily Foster, MD',
    specialty: 'Endocrinology',
    facility: "Acme Health Diabetes Center",
    address: {
      street: '1736 Hamilton St',
      city: 'Allentown',
      state: 'PA',
      zipCode: '18104',
    },
    phone: '(610) 628-8000',
    acceptingNewPatients: true,
    languages: ['English'],
    rating: 4.8,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-02-03',
  },
  // Pennsylvania - Pocono area (ZIP 186xx including 18610)
  {
    providerId: 'PROV-010',
    name: 'Dr. Michael Chen, MD',
    specialty: 'Family Medicine',
    facility: "Acme Health Monroe Campus",
    address: {
      street: '100 Medical Center Drive',
      city: 'Stroudsburg',
      state: 'PA',
      zipCode: '18360',
    },
    phone: '(570) 476-3000',
    acceptingNewPatients: true,
    languages: ['English', 'Mandarin'],
    rating: 4.7,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-01-26',
  },
  {
    providerId: 'PROV-011',
    name: 'Dr. Amanda Richards, MD',
    specialty: 'Cardiology',
    facility: "Acme Health Heart Center - Pocono",
    address: {
      street: '250 Healthcare Way',
      city: 'East Stroudsburg',
      state: 'PA',
      zipCode: '18301',
    },
    phone: '(570) 476-3100',
    acceptingNewPatients: true,
    languages: ['English', 'Spanish'],
    rating: 4.8,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-01-29',
  },
  {
    providerId: 'PROV-012',
    name: 'Dr. David Park, DO',
    specialty: 'Internal Medicine',
    facility: "Acme Health Medical Associates - Tannersville",
    address: {
      street: '481 Route 611',
      city: 'Tannersville',
      state: 'PA',
      zipCode: '18372',
    },
    phone: '(570) 629-2000',
    acceptingNewPatients: true,
    languages: ['English'],
    rating: 4.6,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-01-25',
  },
  {
    providerId: 'PROV-013',
    name: 'Dr. Lisa Hernandez, MD',
    specialty: 'Family Medicine',
    facility: "Acme Health Family Practice - Blakeslee",
    address: {
      street: '5545 Route 115',
      city: 'Blakeslee',
      state: 'PA',
      zipCode: '18610',
    },
    phone: '(570) 646-3500',
    acceptingNewPatients: true,
    languages: ['English', 'Spanish'],
    rating: 4.9,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-01-27',
  },
  {
    providerId: 'PROV-014',
    name: "Dr. Kevin O'Brien, MD",
    specialty: 'Cardiology',
    facility: "Acme Health Cardiology - Blakeslee",
    address: {
      street: '5545 Route 115',
      city: 'Blakeslee',
      state: 'PA',
      zipCode: '18610',
    },
    phone: '(570) 646-3510',
    acceptingNewPatients: true,
    languages: ['English'],
    rating: 4.7,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-01-30',
  },
  // Urgent Care facilities - Pocono area (ZIP 186xx)
  {
    providerId: 'UC-001',
    name: 'Pocono Urgent Care Center',
    specialty: 'Urgent Care',
    facility: "Acme Health Urgent Care - Blakeslee",
    address: {
      street: '5550 Route 115',
      city: 'Blakeslee',
      state: 'PA',
      zipCode: '18610',
    },
    phone: '(570) 646-4000',
    acceptingNewPatients: true,
    languages: ['English', 'Spanish'],
    rating: 4.6,
    networkTier: 'preferred',
    nextAvailableAppointment: 'Walk-ins Welcome',
  },
  {
    providerId: 'UC-002',
    name: 'Stroudsburg Urgent Care',
    specialty: 'Urgent Care',
    facility: "Acme Health Urgent Care - Stroudsburg",
    address: {
      street: '120 Gateway Center Drive',
      city: 'Stroudsburg',
      state: 'PA',
      zipCode: '18360',
    },
    phone: '(570) 476-4200',
    acceptingNewPatients: true,
    languages: ['English', 'Spanish'],
    rating: 4.7,
    networkTier: 'preferred',
    nextAvailableAppointment: 'Walk-ins Welcome',
  },
  {
    providerId: 'UC-003',
    name: 'East Stroudsburg Urgent Care',
    specialty: 'Urgent Care',
    facility: "Acme Health Urgent Care - East Stroudsburg",
    address: {
      street: '300 Plaza Court',
      city: 'East Stroudsburg',
      state: 'PA',
      zipCode: '18301',
    },
    phone: '(570) 421-8500',
    acceptingNewPatients: true,
    languages: ['English'],
    rating: 4.5,
    networkTier: 'preferred',
    nextAvailableAppointment: 'Walk-ins Welcome',
  },
  {
    providerId: 'UC-004',
    name: 'Mount Pocono Urgent Care',
    specialty: 'Urgent Care',
    facility: "Acme Health Urgent Care - Mount Pocono",
    address: {
      street: '581 Route 940',
      city: 'Mount Pocono',
      state: 'PA',
      zipCode: '18344',
    },
    phone: '(570) 839-7100',
    acceptingNewPatients: true,
    languages: ['English', 'Spanish'],
    rating: 4.8,
    networkTier: 'preferred',
    nextAvailableAppointment: 'Walk-ins Welcome',
  },
  // Pharmacies - Pocono area
  {
    providerId: 'PHARM-001',
    name: "Acme Health Pharmacy - Blakeslee",
    specialty: 'Pharmacy',
    facility: "Acme Health Pharmacy",
    address: {
      street: '5545 Route 115',
      city: 'Blakeslee',
      state: 'PA',
      zipCode: '18610',
    },
    phone: '(570) 646-3600',
    acceptingNewPatients: true,
    languages: ['English'],
    rating: 4.7,
    networkTier: 'preferred',
    nextAvailableAppointment: 'Open 8AM-8PM',
  },
  {
    providerId: 'PHARM-002',
    name: 'CVS Pharmacy - Stroudsburg',
    specialty: 'Pharmacy',
    facility: 'CVS Pharmacy',
    address: {
      street: '100 N 9th St',
      city: 'Stroudsburg',
      state: 'PA',
      zipCode: '18360',
    },
    phone: '(570) 421-5500',
    acceptingNewPatients: true,
    languages: ['English', 'Spanish'],
    rating: 4.4,
    networkTier: 'standard',
    nextAvailableAppointment: 'Open 24 Hours',
  },
  // Texas providers
  {
    providerId: 'PROV-006',
    name: 'Dr. Jennifer Lee, MD',
    specialty: 'Internal Medicine',
    facility: "Acme Health The Woodlands Hospital",
    address: {
      street: '17200 Acme Health Way',
      city: 'The Woodlands',
      state: 'TX',
      zipCode: '77384',
    },
    phone: '(936) 266-2000',
    acceptingNewPatients: true,
    languages: ['English', 'Mandarin'],
    rating: 4.9,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-01-24',
  },
  {
    providerId: 'PROV-007',
    name: 'Dr. Michael Brown, MD',
    specialty: 'Gastroenterology',
    facility: 'Baylor Acme Health Medical Center',
    address: {
      street: '6720 Bertner Ave',
      city: 'Houston',
      state: 'TX',
      zipCode: '77030',
    },
    phone: '(832) 355-1000',
    acceptingNewPatients: true,
    languages: ['English', 'Spanish'],
    rating: 4.7,
    networkTier: 'preferred',
    nextAvailableAppointment: '2026-01-30',
  },
];

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface ProviderSearchResult {
  found: boolean;
  providers?: Array<{
    providerId: string;
    name: string;
    specialty: string;
    facility: string;
    city: string;
    state: string;
    phone: string;
    acceptingNewPatients: boolean;
    rating: number;
    networkTier: string;
    nextAvailableAppointment?: string;
    estimatedDistance?: string;
  }>;
  totalCount?: number;
  message?: string;
  /** Filters that were dropped to find any match. */
  relaxedFilters?: string[];
  /** Human-readable hint to the model when filters were relaxed. */
  fallbackNote?: string;
}

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export const findInNetworkProvidersTool = createTool<
  {
    specialty?: string;
    state?: string;
    zipCode?: string;
    acceptingNewPatients?: boolean;
    limit?: number;
  },
  ProviderSearchResult
>({
  name: 'find_in_network_providers',
  description: `Find in-network healthcare providers based on specialty, location, and availability.
  Returns a list of providers with contact information and appointment availability.
  Useful for helping members find doctors, specialists, or facilities in their network.`,
  category: 'providers',
  parameters: {
    type: 'object',
    properties: {
      specialty: {
        type: 'string',
        description: 'Medical specialty to search for (e.g., "Cardiology", "Internal Medicine", "Family Medicine")',
      },
      state: {
        type: 'string',
        description: "State abbreviation (e.g., 'MO', 'PA', 'TX')",
      },
      zipCode: {
        type: 'string',
        description: 'ZIP code for proximity search',
      },
      acceptingNewPatients: {
        type: 'boolean',
        description: 'Only show providers accepting new patients',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
    },
    required: [],
  },
  handler: async (args, context): Promise<ToolResult<ProviderSearchResult>> => {
    await new Promise(resolve => setTimeout(resolve, 400));

    const { specialty, state, zipCode, acceptingNewPatients, limit = 5 } = args;

    // -----------------------------------------------------------------------
    // Specialty synonym expansion. Voice callers say "primary care", "PCP",
    // "family doctor", "regular doctor", "GP" — none of which match the
    // literal specialty strings ("Internal Medicine", "Family Medicine")
    // stored on each MockProvider. Expand to a set of accepted matches so
    // the filter actually returns results.
    // -----------------------------------------------------------------------
    const SPECIALTY_SYNONYMS: Record<string, string[]> = {
      'primary care': ['internal medicine', 'family medicine'],
      'pcp': ['internal medicine', 'family medicine'],
      'general practice': ['internal medicine', 'family medicine'],
      'general practitioner': ['internal medicine', 'family medicine'],
      'gp': ['internal medicine', 'family medicine'],
      'family doctor': ['family medicine'],
      'family physician': ['family medicine'],
      'regular doctor': ['internal medicine', 'family medicine'],
      'main doctor': ['internal medicine', 'family medicine'],
      'internist': ['internal medicine'],
      'heart doctor': ['cardiology'],
      'cardiologist': ['cardiology'],
      'lung doctor': ['pulmonology'],
      'mental health': ['psychiatry', 'psychology', 'behavioral health'],
      'therapist': ['psychiatry', 'psychology', 'behavioral health'],
      'stomach doctor': ['gastroenterology'],
      'er': ['urgent care', 'emergency'],
      'emergency room': ['urgent care', 'emergency'],
    };

    const expandSpecialty = (raw: string): string[] => {
      const lower = raw.toLowerCase().trim();
      return SPECIALTY_SYNONYMS[lower] ?? [lower];
    };

    const matchesSpecialty = (providerSpecialty: string, search: string): boolean => {
      const targets = expandSpecialty(search);
      const lower = providerSpecialty.toLowerCase();
      return targets.some((t) => lower.includes(t));
    };

    // Build a filter chain so we can relax constraints when nothing matches.
    type Filter = (p: MockProvider) => boolean;
    const filters: Array<{ label: string; required: boolean; fn: Filter }> = [];

    if (specialty) {
      filters.push({
        label: `specialty=${specialty}`,
        required: true, // never drop specialty — it changes the meaning
        fn: (p) => matchesSpecialty(p.specialty, specialty),
      });
    }
    if (state) {
      filters.push({
        label: `state=${state}`,
        required: false,
        fn: (p) => p.address.state.toLowerCase() === state.toLowerCase(),
      });
    }
    if (zipCode) {
      const zipPrefix = zipCode.substring(0, 2);
      filters.push({
        label: `zipPrefix=${zipPrefix}`,
        required: false,
        fn: (p) => p.address.zipCode.startsWith(zipPrefix),
      });
    }
    if (acceptingNewPatients === true) {
      filters.push({
        label: 'acceptingNewPatients',
        required: false,
        fn: (p) => p.acceptingNewPatients,
      });
    }

    const applyFilters = (active: typeof filters): MockProvider[] =>
      MOCK_PROVIDERS.filter((p) => active.every((f) => f.fn(p)));

    let active = [...filters];
    let filtered = applyFilters(active);
    const droppedFilters: string[] = [];

    // Progressive relaxation: drop optional filters one at a time from the
    // most-restrictive (zip) toward the least, until we have results.
    while (filtered.length === 0 && active.some((f) => !f.required)) {
      const idx = active.findIndex((f) => !f.required);
      if (idx === -1) break;
      droppedFilters.push(active[idx]!.label);
      active = active.filter((_, i) => i !== idx);
      filtered = applyFilters(active);
    }

    if (filtered.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          message: `No in-network providers found matching ${specialty ? `specialty "${specialty}"` : 'those criteria'}. Try a related specialty or remove the specialty filter to see options near the caller.`,
        },
      };
    }

    // Sort by rating and limit results
    filtered.sort((a, b) => b.rating - a.rating);
    const limited = filtered.slice(0, limit);

    const providers = limited.map(p => ({
      providerId: p.providerId,
      name: p.name,
      specialty: p.specialty,
      facility: p.facility,
      city: p.address.city,
      state: p.address.state,
      phone: p.phone,
      acceptingNewPatients: p.acceptingNewPatients,
      rating: p.rating,
      networkTier: p.networkTier,
      nextAvailableAppointment: p.nextAvailableAppointment,
      estimatedDistance: zipCode ? `${Math.floor(Math.random() * 15) + 1} miles` : undefined,
    }));

    return {
      success: true,
      data: {
        found: true,
        providers,
        totalCount: filtered.length,
        ...(droppedFilters.length > 0 && {
          relaxedFilters: droppedFilters,
          fallbackNote: `Couldn't find an exact match, so I broadened the search (dropped: ${droppedFilters.join(', ')}). Tell the caller you widened the search.`,
        }),
      },
    };
  },
  isMocked: true,
  version: '1.0.0',
});
