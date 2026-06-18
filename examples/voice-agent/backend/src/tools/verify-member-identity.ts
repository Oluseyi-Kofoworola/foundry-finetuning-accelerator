/**
 * Acme Health - Identity Verification Tool
 * 
 * Mock implementation for member identity verification.
 * In production, this would integrate with the actual member database.
 */

import { createTool } from './registry.js';
import type { ToolResult, ToolContext } from '../types/index.js';
import { sessionCache, CacheKeys } from '../services/cache.js';

// =============================================================================
// MOCK DATA
// =============================================================================

/**
 * Mock member database for demo purposes
 * All data is synthetic - no real PHI
 * 4 Patient Profiles for Demo Testing
 */
const MOCK_MEMBERS = new Map([
  // Patient 1: Sarah Johnson - 38-year-old with Type 2 Diabetes & Hypertension
  ['MEM-001', {
    memberId: 'MEM-001',
    firstName: 'Sarah',
    lastName: 'Johnson',
    dateOfBirth: '1987-06-15',
    lastFourSSN: '4532',
    zipCode: '63017',
    planType: 'gold' as const,
    state: 'MO',
    isActive: true,
  }],
  // Patient 2: Robert (Bob) Martinez - 62-year-old with Heart Disease
  ['MEM-002', {
    memberId: 'MEM-002',
    firstName: 'Robert',
    lastName: 'Martinez',
    dateOfBirth: '1963-11-22',
    lastFourSSN: '7891',
    zipCode: '18015',
    planType: 'platinum' as const,
    state: 'PA',
    isActive: true,
  }],
  // Patient 3: Emily Chen - 28-year-old with Asthma & Anxiety
  ['MEM-003', {
    memberId: 'MEM-003',
    firstName: 'Emily',
    lastName: 'Chen',
    dateOfBirth: '1997-09-03',
    lastFourSSN: '2345',
    zipCode: '77001',
    planType: 'silver' as const,
    state: 'TX',
    isActive: true,
  }],
  // Patient 4: James (Jim) Wilson - 72-year-old with COPD & Arthritis
  ['MEM-004', {
    memberId: 'MEM-004',
    firstName: 'James',
    lastName: 'Wilson',
    dateOfBirth: '1953-03-28',
    lastFourSSN: '6789',
    zipCode: '63101',
    planType: 'platinum' as const,
    state: 'MO',
    isActive: true,
  }],
]);

// Common nickname → legal-first-name map. Callers almost always introduce
// themselves by nickname ("Bob", "Jim"), but our records store the legal
// name ("Robert", "James"). This lets the strict match succeed without us
// having to duplicate the records.
const NICKNAME_TO_LEGAL: Record<string, string> = {
  bob: 'robert', bobby: 'robert', rob: 'robert', robbie: 'robert',
  bill: 'william', billy: 'william', will: 'william', willy: 'william',
  jim: 'james', jimmy: 'james', jamie: 'james',
  mike: 'michael', mikey: 'michael',
  dave: 'david', davey: 'david',
  tom: 'thomas', tommy: 'thomas',
  rick: 'richard', ricky: 'richard', dick: 'richard',
  steve: 'steven', stevie: 'steven',
  chuck: 'charles', charlie: 'charles',
  joe: 'joseph', joey: 'joseph',
  ed: 'edward', eddie: 'edward',
  liz: 'elizabeth', beth: 'elizabeth', betty: 'elizabeth', betsy: 'elizabeth',
  kate: 'katherine', katie: 'katherine', kathy: 'katherine',
  meg: 'margaret', maggie: 'margaret', peggy: 'margaret',
  sue: 'susan', susie: 'susan',
  jen: 'jennifer', jenny: 'jennifer',
  em: 'emily', emmy: 'emily',
  abby: 'abigail',
  ally: 'allison', alli: 'allison',
};

function expandNickname(name: string | undefined): string | undefined {
  if (!name) return name;
  const lower = name.toLowerCase().trim();
  return NICKNAME_TO_LEGAL[lower] ?? lower;
}

// =============================================================================
// VERIFICATION RESULT TYPES
// =============================================================================

export interface VerificationResult {
  verified: boolean;
  memberId?: string;
  preferredName?: string;
  planType?: 'gold' | 'silver' | 'bronze' | 'platinum';
  state?: string;
  failureReason?: string;
  attemptsRemaining?: number;
}

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export const verifyMemberIdentityTool = createTool<
  {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    dateOfBirth: string;
    lastFourSSN?: string;
    zipCode?: string;
    memberId?: string;
  },
  VerificationResult
>({
  name: 'verify_member_identity',
  description: `Verify a member's identity using their personal information.
  Requires date of birth plus either (firstName + lastName) OR fullName.
  Additional fields (last 4 SSN, zip code, or member ID) increase verification confidence.
  Returns verification status and non-PHI member context if successful.`,
  category: 'identity',
  parameters: {
    type: 'object',
    properties: {
      firstName: {
        type: 'string',
        description: "Member's first name (use this OR fullName)",
      },
      lastName: {
        type: 'string',
        description: "Member's last name (use this OR fullName)",
      },
      fullName: {
        type: 'string',
        description: "Member's full name as a single string (use this if firstName/lastName aren't separately available, e.g. 'Sarah Johnson')",
      },
      dateOfBirth: {
        type: 'string',
        description: "Member's date of birth in YYYY-MM-DD format",
      },
      lastFourSSN: {
        type: 'string',
        description: 'Last 4 digits of SSN (optional, increases confidence)',
      },
      zipCode: {
        type: 'string',
        description: "Member's zip code (optional, increases confidence)",
      },
      memberId: {
        type: 'string',
        description: 'Member ID if known (optional, fastest verification)',
      },
    },
    required: ['dateOfBirth'],
  },
  handler: async (args, context): Promise<ToolResult<VerificationResult>> => {
    // Accept either {firstName, lastName} or {fullName}. The realtime model
    // often produces fullName even when the schema names the two parts —
    // splitting here keeps the tool resilient and stops it crashing on
    // undefined firstName.
    let { firstName, lastName } = args;
    const { fullName, dateOfBirth, lastFourSSN, zipCode, memberId } = args;
    if ((!firstName || !lastName) && fullName) {
      const parts = fullName.trim().split(/\s+/);
      if (parts.length >= 2) {
        firstName = firstName || parts[0];
        lastName = lastName || parts.slice(1).join(' ');
      } else if (parts.length === 1) {
        firstName = firstName || parts[0];
      }
    }
    if (!firstName || !lastName) {
      return {
        success: true,
        data: {
          verified: false,
          failureReason: 'I need both first and last name to verify your identity. Could you give them to me separately?',
          attemptsRemaining: 3,
        },
      };
    }
    const sessionId = context?.sessionId || 'default';

    // ==========================================================================
    // STRICT DOB VALIDATION - Parse and normalize the date
    // ==========================================================================
    const normalizeDate = (dateStr: string): string | null => {
      if (!dateStr) return null;

      // Strip ordinal suffixes the user / voice transcript will produce:
      //   "November 22nd, 1963", "1st of June 1987", "March 3rd 2000".
      // Doing this once up front lets the simpler regex set still match.
      const cleaned = dateStr
        .replace(/(\d+)(st|nd|rd|th)\b/gi, '$1')
        .replace(/\bof\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Try multiple date formats
      const formats = [
        // YYYY-MM-DD
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
        // MM/DD/YYYY
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        // Month DD, YYYY (e.g., "November 22, 1963")
        /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/,
        // DD Month YYYY (e.g., "22 November 1963")
        /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/,
      ];

      const monthNames: Record<string, number> = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12,
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12
      };

      // Try YYYY-MM-DD format
      let match = cleaned.match(formats[0]);
      if (match) {
        const [, year, month, day] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }

      // Try MM/DD/YYYY format
      match = cleaned.match(formats[1]);
      if (match) {
        const [, month, day, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }

      // Try "Month DD, YYYY" format
      match = cleaned.match(formats[2]);
      if (match) {
        const [, monthName, day, year] = match;
        const monthNum = monthNames[monthName.toLowerCase()];
        if (monthNum) {
          return `${year}-${monthNum.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }

      // Try "DD Month YYYY" format
      match = cleaned.match(formats[3]);
      if (match) {
        const [, day, monthName, year] = match;
        const monthNum = monthNames[monthName.toLowerCase()];
        if (monthNum) {
          return `${year}-${monthNum.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }

      return null;
    };

    const providedDOB = normalizeDate(dateOfBirth);
    if (!providedDOB) {
      return {
        success: true,
        data: {
          verified: false,
          failureReason: 'Invalid date format. Please provide date of birth in format: Month Day, Year (e.g., November 22, 1963)',
          attemptsRemaining: 2,
        },
      };
    }

    // Check cache first for faster response
    if (memberId) {
      const cachedIdentity = sessionCache.get<VerificationResult>(
        sessionId, 
        'identity', 
        CacheKeys.identity(memberId)
      );
      if (cachedIdentity && cachedIdentity.verified) {
        console.log(`[Cache] Identity HIT for ${memberId}`);
        return { success: true, data: cachedIdentity };
      }
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Normalize memberId case and expand nicknames before any comparison.
    const normalizedMemberId = memberId ? memberId.toUpperCase().trim() : undefined;
    const normalizedFirst = expandNickname(firstName);
    const normalizedLast = lastName?.toLowerCase().trim();

    // Diagnostic log so we can see EXACTLY what the model sent vs. what we
    // expect, when callers report "couldn't verify" in the demo transcript.
    console.log('[verify_member_identity] attempt', {
      received: { firstName, lastName, fullName, dateOfBirth, lastFourSSN, zipCode, memberId },
      normalized: { firstName: normalizedFirst, lastName: normalizedLast, dob: providedDOB, memberId: normalizedMemberId },
    });

    // If member ID is provided, try direct lookup
    if (normalizedMemberId) {
      const member = MOCK_MEMBERS.get(normalizedMemberId);
      if (member &&
          member.firstName.toLowerCase() === normalizedFirst &&
          member.lastName.toLowerCase() === normalizedLast) {
        const result: VerificationResult = {
          verified: true,
          memberId: member.memberId,
          preferredName: member.firstName,
          planType: member.planType,
          state: member.state,
        };
        // Cache successful verification
        sessionCache.set(sessionId, 'identity', CacheKeys.identity(member.memberId), result);
        return { success: true, data: result };
      }
    }

    // Search by name and DOB - STRICT MATCHING (with nickname expansion)
    for (const member of MOCK_MEMBERS.values()) {
      const nameMatch =
        member.firstName.toLowerCase() === normalizedFirst &&
        member.lastName.toLowerCase() === normalizedLast;
      
      // STRICT DOB match using normalized dates
      const memberNormalizedDOB = normalizeDate(member.dateOfBirth);
      const dobMatch = memberNormalizedDOB === providedDOB;

      // If name matches but DOB doesn't, give specific feedback
      if (nameMatch && !dobMatch) {
        return {
          success: true,
          data: {
            verified: false,
            failureReason: 'The date of birth provided does not match our records. Please verify and try again with your correct date of birth.',
            attemptsRemaining: 2,
          },
        };
      }

      if (nameMatch && dobMatch) {
        // Additional verification if provided
        if (lastFourSSN && member.lastFourSSN !== lastFourSSN) {
          return {
            success: true,
            data: {
              verified: false,
              failureReason: 'SSN verification failed. The last 4 digits do not match our records.',
              attemptsRemaining: 2,
            },
          };
        }

        if (zipCode && member.zipCode !== zipCode) {
          return {
            success: true,
            data: {
              verified: false,
              failureReason: 'Address verification failed',
              attemptsRemaining: 2,
            },
          };
        }

        // Verification successful
        const result: VerificationResult = {
          verified: true,
          memberId: member.memberId,
          preferredName: member.firstName,
          planType: member.planType,
          state: member.state,
        };
        // Cache successful verification
        sessionCache.set(sessionId, 'identity', CacheKeys.identity(member.memberId), result);
        return { success: true, data: result };
      }
    }

    // No match found
    return {
      success: true,
      data: {
        verified: false,
        failureReason: 'Member not found with provided information',
        attemptsRemaining: 2,
      },
    };
  },
  isMocked: true,
  version: '1.0.0',
});
