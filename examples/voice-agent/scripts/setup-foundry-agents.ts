/**
 * Acme Health - AI Foundry Agent Setup
 * 
 * This script creates the multi-agent system in Azure AI Foundry
 * Run AFTER deploying the Bicep infrastructure
 * 
 * Usage: npx ts-node scripts/setup-foundry-agents.ts
 */

import { DefaultAzureCredential } from '@azure/identity';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface Config {
  projectConnectionString: string;
  subscriptionId: string;
  resourceGroup: string;
  projectName: string;
  location: string;
}

function getConfig(): Config {
  const connectionString = process.env.AI_PROJECT_CONNECTION_STRING || '';
  
  if (!connectionString) {
    console.error('❌ AI_PROJECT_CONNECTION_STRING not set');
    console.error('   Run the Bicep deployment first, then set:');
    console.error('   $env:AI_PROJECT_CONNECTION_STRING = "<connection-string>"');
    process.exit(1);
  }
  
  const parts = connectionString.split(';');
  return {
    projectConnectionString: connectionString,
    location: parts[0]?.replace('.api.azureml.ms', '') || 'eastus',
    subscriptionId: parts[1] || '',
    resourceGroup: parts[2] || '',
    projectName: parts[3] || ''
  };
}

// ============================================================================
// TOOL DEFINITIONS (Matching existing backend tools)
// ============================================================================

const tools = {
  verify_member_identity: {
    type: 'function' as const,
    function: {
      name: 'verify_member_identity',
      description: 'Verify a healthcare member\'s identity using member ID, date of birth, and ZIP code. Required before accessing any PHI.',
      parameters: {
        type: 'object',
        properties: {
          memberId: { 
            type: 'string', 
            description: 'Member ID (e.g., MEM-001, MEM-002)' 
          },
          dateOfBirth: { 
            type: 'string', 
            description: 'Date of birth in MM/DD/YYYY format' 
          },
          zipCode: { 
            type: 'string', 
            description: '5-digit ZIP code' 
          }
        },
        required: ['memberId', 'dateOfBirth', 'zipCode']
      }
    }
  },
  
  send_mfa_code: {
    type: 'function' as const,
    function: {
      name: 'send_mfa_code',
      description: 'Send a multi-factor authentication code to the member\'s registered contact method',
      parameters: {
        type: 'object',
        properties: {
          memberId: { type: 'string', description: 'The member\'s ID' },
          method: { 
            type: 'string', 
            enum: ['sms', 'email', 'voice'],
            description: 'Delivery method for the verification code'
          }
        },
        required: ['memberId', 'method']
      }
    }
  },
  
  verify_mfa_code: {
    type: 'function' as const,
    function: {
      name: 'verify_mfa_code',
      description: 'Verify the MFA code entered by the member',
      parameters: {
        type: 'object',
        properties: {
          memberId: { type: 'string', description: 'The member\'s ID' },
          code: { type: 'string', description: 'The 6-digit verification code' }
        },
        required: ['memberId', 'code']
      }
    }
  },
  
  lookup_prescriptions: {
    type: 'function' as const,
    function: {
      name: 'lookup_prescriptions',
      description: 'Look up active and historical prescriptions for a verified member',
      parameters: {
        type: 'object',
        properties: {
          memberId: { type: 'string', description: 'The verified member\'s ID' },
          includeHistory: { 
            type: 'boolean', 
            description: 'Include filled/expired prescriptions (default: false)' 
          }
        },
        required: ['memberId']
      }
    }
  },
  
  calculate_medication_price: {
    type: 'function' as const,
    function: {
      name: 'calculate_medication_price',
      description: 'Calculate the member\'s copay/cost for a medication based on their plan and formulary tier',
      parameters: {
        type: 'object',
        properties: {
          memberId: { type: 'string', description: 'The member\'s ID' },
          medicationName: { type: 'string', description: 'Name of the medication' },
          quantity: { 
            type: 'integer', 
            description: 'Days supply (typically 30 or 90)' 
          },
          pharmacyType: { 
            type: 'string', 
            enum: ['retail', 'mail_order'],
            description: 'Type of pharmacy (mail order often has lower costs)'
          }
        },
        required: ['memberId', 'medicationName', 'quantity']
      }
    }
  },
  
  transfer_prescription: {
    type: 'function' as const,
    function: {
      name: 'transfer_prescription',
      description: 'Transfer a prescription from one pharmacy to another',
      parameters: {
        type: 'object',
        properties: {
          prescriptionId: { type: 'string', description: 'The prescription ID to transfer' },
          sourcePharmacy: { type: 'string', description: 'Current pharmacy name and location' },
          destinationPharmacy: { type: 'string', description: 'Target pharmacy name and location' },
          memberId: { type: 'string', description: 'The member\'s ID' }
        },
        required: ['prescriptionId', 'sourcePharmacy', 'destinationPharmacy', 'memberId']
      }
    }
  },
  
  request_refill: {
    type: 'function' as const,
    function: {
      name: 'request_refill',
      description: 'Request a prescription refill',
      parameters: {
        type: 'object',
        properties: {
          prescriptionId: { type: 'string', description: 'The prescription ID to refill' },
          memberId: { type: 'string', description: 'The member\'s ID' },
          pharmacyId: { type: 'string', description: 'Preferred pharmacy ID (optional)' },
          rushDelivery: { type: 'boolean', description: 'Request expedited processing' }
        },
        required: ['prescriptionId', 'memberId']
      }
    }
  },
  
  find_in_network_providers: {
    type: 'function' as const,
    function: {
      name: 'find_in_network_providers',
      description: 'Search for healthcare providers within the member\'s insurance network',
      parameters: {
        type: 'object',
        properties: {
          specialty: { 
            type: 'string', 
            description: 'Medical specialty (e.g., "Cardiology", "Primary Care", "Dermatology")' 
          },
          zipCode: { type: 'string', description: 'ZIP code for location-based search' },
          radiusMiles: { 
            type: 'integer', 
            description: 'Search radius in miles (default: 25)' 
          },
          acceptingNewPatients: { 
            type: 'boolean', 
            description: 'Filter for providers accepting new patients' 
          }
        },
        required: ['specialty', 'zipCode']
      }
    }
  },
  
  retrieve_patient_context: {
    type: 'function' as const,
    function: {
      name: 'retrieve_patient_context',
      description: 'Retrieve patient context and summary for clinical staff (provider-facing)',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'The patient\'s ID' },
          providerId: { type: 'string', description: 'The requesting provider\'s ID' },
          accessLevel: { 
            type: 'string', 
            enum: ['basic', 'clinical', 'full'],
            description: 'Level of detail requested'
          }
        },
        required: ['patientId', 'providerId']
      }
    }
  },
  
  get_full_medical_records: {
    type: 'function' as const,
    function: {
      name: 'get_full_medical_records',
      description: 'Retrieve comprehensive medical records for a patient (provider-facing, requires authorization)',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'The patient\'s ID' },
          providerId: { type: 'string', description: 'The requesting provider\'s ID' },
          sections: { 
            type: 'array',
            items: { 
              type: 'string',
              enum: ['demographics', 'medications', 'allergies', 'diagnoses', 'procedures', 'labs', 'vitals', 'notes']
            },
            description: 'Specific sections to retrieve (empty = all)'
          }
        },
        required: ['patientId', 'providerId']
      }
    }
  },
  
  schedule_appointment: {
    type: 'function' as const,
    function: {
      name: 'schedule_appointment',
      description: 'Schedule a patient appointment with a provider',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'The patient\'s ID' },
          providerId: { type: 'string', description: 'The provider\'s ID' },
          appointmentType: { 
            type: 'string', 
            enum: ['new_patient', 'follow_up', 'urgent', 'telehealth'],
            description: 'Type of appointment'
          },
          preferredDate: { type: 'string', description: 'Preferred date (YYYY-MM-DD)' },
          preferredTime: { 
            type: 'string', 
            enum: ['morning', 'afternoon', 'evening'],
            description: 'Preferred time of day'
          },
          reason: { type: 'string', description: 'Reason for visit' }
        },
        required: ['patientId', 'providerId', 'appointmentType']
      }
    }
  },
  
  log_action_audit_event: {
    type: 'function' as const,
    function: {
      name: 'log_action_audit_event',
      description: 'Log an action for HIPAA audit trail and compliance tracking',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'The action performed' },
          memberId: { type: 'string', description: 'The member/patient involved' },
          agentId: { type: 'string', description: 'The agent that performed the action' },
          details: { type: 'object', description: 'Additional action details' },
          outcome: { 
            type: 'string', 
            enum: ['success', 'failure', 'pending'],
            description: 'Result of the action'
          }
        },
        required: ['action', 'agentId', 'outcome']
      }
    }
  }
};

// ============================================================================
// AGENT CONFIGURATIONS
// ============================================================================

interface AgentConfig {
  name: string;
  displayName: string;
  description: string;
  instructions: string;
  tools: any[];
}

const agentConfigs: AgentConfig[] = [
  {
    name: 'acme-health-coordinator',
    displayName: 'Acme Health Health Coordinator',
    description: 'Main orchestrator that routes healthcare requests to specialized agents',
    instructions: `You are the Acme Health Coordinator, the primary AI assistant for healthcare operations.

## Your Role
You are the first point of contact for all callers. Your job is to:
1. Greet callers warmly and professionally
2. Verify their identity before accessing any health information
3. Understand their needs and route to the appropriate specialist
4. Handle general inquiries directly when possible

## Routing Guidelines
Route to the appropriate specialist based on the caller's needs:

**PBM Pharmacy Specialist** - For:
- Prescription questions or refills
- Medication pricing and copays
- Pharmacy transfers
- Formulary and drug coverage

**Health Plan Concierge** - For:
- Benefits and coverage questions
- Finding in-network providers
- Understanding deductibles and copays
- Claims and EOB questions

**Provider Assistant** - For (clinical staff only):
- Patient record access
- Scheduling appointments
- Clinical information lookup

## Identity Verification (REQUIRED)
Before accessing ANY personal health information, you MUST verify identity:
1. Ask for Member ID
2. Ask for Date of Birth
3. Ask for ZIP code
4. Use verify_member_identity tool
5. Only proceed if verification succeeds

## Prohibited Topics - NEVER Discuss:
- Medical diagnoses or treatment recommendations
- Drug interactions or side effects (refer to pharmacist)
- Legal advice
- Competitor insurance comparisons

## Conversation Style
- Warm, empathetic, and professional
- Use plain language, not medical jargon
- Confirm understanding before taking actions
- Always offer to help with anything else`,
    tools: [
      tools.verify_member_identity,
      tools.send_mfa_code,
      tools.verify_mfa_code,
      tools.log_action_audit_event
    ]
  },
  
  {
    name: 'pbm-pharmacy-agent',
    displayName: 'PBM Pharmacy Assistant',
    description: 'Specialist for prescription, medication, and pharmacy-related requests',
    instructions: `You are a PBM (Pharmacy Benefit Manager) specialist for Acme Health.

## Your Expertise
You handle all pharmacy and medication-related requests:
- Looking up member prescriptions
- Calculating medication costs and copays
- Processing prescription transfers between pharmacies
- Handling refill requests
- Explaining formulary tiers and drug coverage

## Important Rules
1. **Verify First**: Always confirm member identity has been verified before accessing prescription data
2. **Clear Pricing**: Explain costs clearly including copay amount, tier, and 30-day vs 90-day pricing
3. **Confirm Transfers**: For transfers, always confirm both the source and destination pharmacies
4. **Check Refills**: Verify refills remaining before processing
5. **Audit Trail**: Log all actions for compliance

## Formulary Tiers (Acme Health)
- **Tier 1 (Generic)**: Lowest copay ($10-15)
- **Tier 2 (Preferred Brand)**: Medium copay ($25-40)
- **Tier 3 (Non-Preferred)**: Higher copay ($50-75)
- **Tier 4 (Specialty)**: Percentage-based (20-30%)

## Common Scenarios

**Refill Request:**
1. Look up prescription
2. Check refills remaining
3. Confirm pharmacy preference
4. Process refill
5. Provide pickup/delivery timeframe

**Price Check:**
1. Identify medication
2. Check member's plan tier
3. Calculate 30-day and 90-day costs
4. Mention mail-order savings if applicable

**Transfer:**
1. Verify prescription details
2. Confirm source pharmacy
3. Get destination pharmacy info
4. Process transfer
5. Provide timeline (usually 24-48 hours)

## What You Cannot Do
- Provide medical advice about medications
- Recommend specific drugs
- Discuss drug interactions (refer to pharmacist)
- Override prior authorization requirements`,
    tools: [
      tools.lookup_prescriptions,
      tools.calculate_medication_price,
      tools.transfer_prescription,
      tools.request_refill,
      tools.log_action_audit_event
    ]
  },
  
  {
    name: 'health-plan-concierge',
    displayName: 'Health Plan Concierge',
    description: 'Specialist for benefits, coverage, and provider network questions',
    instructions: `You are a Health Plan Concierge for Acme Health.

## Your Expertise
You help members understand and navigate their health benefits:
- Explaining plan benefits and coverage
- Finding in-network providers
- Clarifying costs (deductibles, copays, coinsurance)
- Helping understand claims and EOBs
- Prior authorization guidance

## Plan Types (Acme Health)
- **Bronze**: Basic coverage, lower premiums, higher deductibles
- **Silver**: Balanced coverage and costs
- **Gold**: Enhanced coverage, lower deductibles
- **Platinum**: Premium coverage, lowest out-of-pocket

## Important Guidelines
1. **Never Guarantee Coverage**: Always say "based on your plan details" or "typically covered"
2. **No Doctor Recommendations**: Provide options, never recommend specific providers
3. **Accurate Info**: If unsure, offer to have someone call back with verified information
4. **Document Everything**: Log all benefit inquiries

## Common Questions

**"Is [procedure] covered?"**
- Check plan type
- Note that most plans cover medically necessary procedures
- Mention potential prior authorization requirements
- Suggest calling member services for specific coverage verification

**"Find me a doctor"**
- Ask for specialty needed
- Get ZIP code for location
- Ask about preferences (accepting new patients, etc.)
- Provide multiple options with contact info

**"What's my deductible?"**
- Explain deductible amount by plan
- Clarify how much has been met YTD if available
- Explain what applies to deductible

## What You Cannot Do
- Guarantee specific coverage
- Process claims
- Provide medical advice
- Recommend specific doctors over others`,
    tools: [
      tools.find_in_network_providers,
      tools.log_action_audit_event
    ]
  },
  
  {
    name: 'provider-assistant',
    displayName: 'Provider-Facing Assistant',
    description: 'Assistant for clinical staff to access patient information and scheduling',
    instructions: `You are a Provider Assistant for Acme Health clinical staff.

## Your Role
You assist healthcare providers and clinical staff with:
- Retrieving patient context and history
- Accessing medical records (with proper authorization)
- Scheduling patient appointments
- Looking up medications, allergies, and diagnoses

## HIPAA Compliance - CRITICAL
1. **Verify Provider**: Confirm the requesting provider's credentials
2. **Minimum Necessary**: Only provide information needed for the task
3. **Audit Everything**: Log all PHI access with timestamp, provider ID, and purpose
4. **Purpose Required**: Always ask why the information is needed

## Access Levels
- **Basic**: Demographics, appointments, insurance info
- **Clinical**: Medical history, current medications, lab results
- **Full**: Complete records including sensitive diagnoses, psychiatric notes

## Patient Context Summary Format
When presenting patient information, structure it as:

**Patient Overview**
- Name, DOB, MRN
- Primary Care Provider
- Insurance Status

**Current Medications**
- Active prescriptions with dosages

**Allergies** (highlight prominently)
- Drug allergies with reaction type

**Recent History**
- Last 3-5 visits with chief complaints
- Active diagnoses

**Alerts**
- Overdue screenings
- Care gaps
- Special considerations

## Scheduling Guidelines
- Check provider availability
- Verify appointment type matches provider specialty
- Confirm patient insurance is accepted
- Note any special requirements (interpreter, wheelchair access)

## What You Cannot Do
- Access records without stated purpose
- Share information with non-clinical staff
- Make clinical decisions
- Prescribe or modify treatments`,
    tools: [
      tools.retrieve_patient_context,
      tools.get_full_medical_records,
      tools.schedule_appointment,
      tools.log_action_audit_event
    ]
  }
];

// ============================================================================
// AGENT CREATION (using REST API)
// ============================================================================

async function createAgents(config: Config): Promise<Record<string, string>> {
  console.log('\n🤖 Creating AI Agents...\n');
  
  const credential = new DefaultAzureCredential();
  const token = await credential.getToken('https://ml.azure.com/.default');
  
  const baseUrl = `https://${config.location}.api.azureml.ms/agents/v1.0/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${config.projectName}`;
  
  const createdAgents: Record<string, string> = {};
  
  for (const agentConfig of agentConfigs) {
    console.log(`  Creating: ${agentConfig.displayName}...`);
    
    try {
      const response = await fetch(`${baseUrl}/assistants`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          name: agentConfig.name,
          description: agentConfig.description,
          instructions: agentConfig.instructions,
          tools: agentConfig.tools
        })
      });
      
      if (response.ok) {
        const agent = await response.json() as { id: string };
        createdAgents[agentConfig.name] = agent.id;
        console.log(`  ✅ ${agentConfig.displayName}: ${agent.id}`);
      } else {
        const error = await response.text();
        console.log(`  ⚠️  ${agentConfig.displayName}: ${response.status} - ${error.substring(0, 100)}`);
        createdAgents[agentConfig.name] = 'pending';
      }
    } catch (error: any) {
      console.log(`  ❌ ${agentConfig.displayName}: ${error.message}`);
      createdAgents[agentConfig.name] = 'error';
    }
  }
  
  return createdAgents;
}

// ============================================================================
// CONFIGURATION FILE GENERATION
// ============================================================================

function generateEnvFile(config: Config, agents: Record<string, string>): void {
  console.log('\n📝 Generating Configuration Files...\n');
  
  const envContent = `# ============================================================================
# Azure AI Foundry Configuration
# Auto-generated by setup-foundry-agents.ts
# Generated: ${new Date().toISOString()}
# ============================================================================

# AI Project Connection
AI_PROJECT_CONNECTION_STRING=${config.projectConnectionString}

# Agent IDs
ORCHESTRATOR_AGENT_ID=${agents['acme-health-coordinator'] || 'pending'}
PBM_AGENT_ID=${agents['pbm-pharmacy-agent'] || 'pending'}
CONCIERGE_AGENT_ID=${agents['health-plan-concierge'] || 'pending'}
PROVIDER_AGENT_ID=${agents['provider-assistant'] || 'pending'}

# Feature Flag - Enable multi-agent mode
USE_FOUNDRY_AGENTS=true
`;

  const envPath = path.join(process.cwd(), 'backend', '.env.foundry');
  fs.writeFileSync(envPath, envContent);
  console.log(`  ✅ Created: ${envPath}`);
  
  // Create JSON summary
  const summary = {
    generatedAt: new Date().toISOString(),
    projectConnectionString: config.projectConnectionString,
    project: {
      name: config.projectName,
      resourceGroup: config.resourceGroup,
      subscriptionId: config.subscriptionId,
      location: config.location
    },
    agents: Object.entries(agents).map(([name, id]) => ({
      name,
      id,
      displayName: agentConfigs.find(a => a.name === name)?.displayName,
      toolCount: agentConfigs.find(a => a.name === name)?.tools.length || 0
    }))
  };
  
  const jsonPath = path.join(process.cwd(), 'foundry-agents.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log(`  ✅ Created: ${jsonPath}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('🏥 Acme Health - AI Foundry Agent Setup');
  console.log('═'.repeat(60));
  
  const config = getConfig();
  console.log(`\nProject: ${config.projectName}`);
  console.log(`Resource Group: ${config.resourceGroup}`);
  console.log(`Location: ${config.location}`);
  
  try {
    const agents = await createAgents(config);
    generateEnvFile(config, agents);
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ AGENT SETUP COMPLETE!');
    console.log('═'.repeat(60));
    console.log('\nAgents Created:');
    for (const [name, id] of Object.entries(agents)) {
      const displayName = agentConfigs.find(a => a.name === name)?.displayName || name;
      console.log(`  • ${displayName}: ${id}`);
    }
    console.log('\nNext Steps:');
    console.log('  1. Review backend/.env.foundry');
    console.log('  2. Merge with backend/.env or copy values');
    console.log('  3. Update backend to use multi-agent service (optional)');
    console.log('  4. Test agents in Azure AI Foundry Portal: https://ai.azure.com');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
