"""
Acme Health - AI Agents Setup Script
Creates 4 specialized agents with function calling using Azure OpenAI SDK
Uses Azure Identity for authentication (no API key required)
"""

import os
import json
from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "https://aoai-shuttervoice-dev.openai.azure.com")
AZURE_OPENAI_API_VERSION = "2024-05-01-preview"
MODEL_DEPLOYMENT = "gpt-4o"  # Your deployment name

# Use Azure Identity for authentication (works with Azure CLI login)
credential = DefaultAzureCredential()
token_provider = get_bearer_token_provider(credential, "https://cognitiveservices.azure.com/.default")

# Initialize the client with Azure AD authentication
client = AzureOpenAI(
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
    azure_ad_token_provider=token_provider,
    api_version=AZURE_OPENAI_API_VERSION
)

# ============================================================================
# TOOL DEFINITIONS
# ============================================================================

# Shared tools
verify_member_identity = {
    "type": "function",
    "function": {
        "name": "verify_member_identity",
        "description": "Verify member identity using member ID and date of birth. Returns verification status and member details.",
        "parameters": {
            "type": "object",
            "properties": {
                "memberId": {
                    "type": "string",
                    "description": "The member's insurance ID number (e.g., 'MEM123456')"
                },
                "dateOfBirth": {
                    "type": "string",
                    "description": "Member's date of birth in YYYY-MM-DD format"
                }
            },
            "required": ["memberId", "dateOfBirth"]
        }
    }
}

send_mfa_verification = {
    "type": "function",
    "function": {
        "name": "send_mfa_verification",
        "description": "Send MFA verification code to member's registered phone or email for identity confirmation",
        "parameters": {
            "type": "object",
            "properties": {
                "memberId": {
                    "type": "string",
                    "description": "The member's insurance ID number"
                },
                "method": {
                    "type": "string",
                    "enum": ["sms", "email"],
                    "description": "Verification delivery method"
                }
            },
            "required": ["memberId", "method"]
        }
    }
}

log_action_audit_event = {
    "type": "function",
    "function": {
        "name": "log_action_audit_event",
        "description": "Log an action to the HIPAA-compliant audit trail for compliance and tracking",
        "parameters": {
            "type": "object",
            "properties": {
                "memberId": {
                    "type": "string",
                    "description": "Member ID involved in the action"
                },
                "action": {
                    "type": "string",
                    "description": "Description of the action taken"
                },
                "category": {
                    "type": "string",
                    "enum": ["identity_verification", "phi_access", "prescription", "provider_search", "billing"],
                    "description": "Category of the action for classification"
                }
            },
            "required": ["memberId", "action", "category"]
        }
    }
}

retrieve_patient_context = {
    "type": "function",
    "function": {
        "name": "retrieve_patient_context",
        "description": "Retrieve patient context including recent interactions, preferences, and relevant history",
        "parameters": {
            "type": "object",
            "properties": {
                "memberId": {
                    "type": "string",
                    "description": "The member's insurance ID number"
                }
            },
            "required": ["memberId"]
        }
    }
}

# PBM Tools
lookup_prescriptions = {
    "type": "function",
    "function": {
        "name": "lookup_prescriptions",
        "description": "Look up member's current and past prescriptions from the pharmacy benefit system",
        "parameters": {
            "type": "object",
            "properties": {
                "memberId": {
                    "type": "string",
                    "description": "The member's insurance ID number"
                },
                "status": {
                    "type": "string",
                    "enum": ["active", "expired", "all"],
                    "description": "Filter prescriptions by status"
                }
            },
            "required": ["memberId"]
        }
    }
}

request_refill = {
    "type": "function",
    "function": {
        "name": "request_refill",
        "description": "Request a prescription refill for an existing medication",
        "parameters": {
            "type": "object",
            "properties": {
                "memberId": {
                    "type": "string",
                    "description": "The member's insurance ID number"
                },
                "prescriptionId": {
                    "type": "string",
                    "description": "The prescription ID to refill"
                },
                "pharmacyId": {
                    "type": "string",
                    "description": "Target pharmacy ID (optional, uses default if not specified)"
                }
            },
            "required": ["memberId", "prescriptionId"]
        }
    }
}

transfer_prescription = {
    "type": "function",
    "function": {
        "name": "transfer_prescription",
        "description": "Transfer a prescription from one pharmacy to another",
        "parameters": {
            "type": "object",
            "properties": {
                "memberId": {
                    "type": "string",
                    "description": "The member's insurance ID number"
                },
                "prescriptionId": {
                    "type": "string",
                    "description": "The prescription ID to transfer"
                },
                "fromPharmacyId": {
                    "type": "string",
                    "description": "Current pharmacy ID"
                },
                "toPharmacyId": {
                    "type": "string",
                    "description": "Destination pharmacy ID"
                }
            },
            "required": ["memberId", "prescriptionId", "fromPharmacyId", "toPharmacyId"]
        }
    }
}

calculate_medication_price = {
    "type": "function",
    "function": {
        "name": "calculate_medication_price",
        "description": "Calculate the member's out-of-pocket cost for a medication based on their plan",
        "parameters": {
            "type": "object",
            "properties": {
                "memberId": {
                    "type": "string",
                    "description": "The member's insurance ID number"
                },
                "medicationName": {
                    "type": "string",
                    "description": "Name of the medication"
                },
                "quantity": {
                    "type": "integer",
                    "description": "Quantity/days supply"
                },
                "pharmacyId": {
                    "type": "string",
                    "description": "Pharmacy ID for pricing (optional)"
                }
            },
            "required": ["memberId", "medicationName"]
        }
    }
}

# Provider Tools
find_in_network_providers = {
    "type": "function",
    "function": {
        "name": "find_in_network_providers",
        "description": "Find in-network healthcare providers based on specialty, location, and availability",
        "parameters": {
            "type": "object",
            "properties": {
                "memberId": {
                    "type": "string",
                    "description": "The member's insurance ID number (to check network)"
                },
                "specialty": {
                    "type": "string",
                    "description": "Medical specialty (e.g., 'cardiology', 'primary care', 'dermatology')"
                },
                "zipCode": {
                    "type": "string",
                    "description": "ZIP code for location-based search"
                },
                "radiusMiles": {
                    "type": "integer",
                    "description": "Search radius in miles (default: 25)"
                },
                "acceptingNewPatients": {
                    "type": "boolean",
                    "description": "Filter for providers accepting new patients"
                }
            },
            "required": ["memberId", "specialty", "zipCode"]
        }
    }
}

get_medical_records = {
    "type": "function",
    "function": {
        "name": "get_medical_records",
        "description": "Retrieve member's medical records summary including conditions, allergies, and recent visits",
        "parameters": {
            "type": "object",
            "properties": {
                "memberId": {
                    "type": "string",
                    "description": "The member's insurance ID number"
                },
                "recordType": {
                    "type": "string",
                    "enum": ["summary", "conditions", "allergies", "immunizations", "lab_results", "visits"],
                    "description": "Type of medical record to retrieve"
                },
                "dateRange": {
                    "type": "string",
                    "description": "Date range filter (e.g., 'last_year', 'last_6_months')"
                }
            },
            "required": ["memberId"]
        }
    }
}

# ============================================================================
# AGENT DEFINITIONS
# ============================================================================

agents_config = [
    {
        "name": "StLukeHealthCoordinator",
        "instructions": """You are the Acme Health AI Coordinator - the primary point of contact for all member interactions.

Your responsibilities:
1. ALWAYS greet members warmly and professionally
2. Verify member identity using MFA before accessing any protected health information (PHI)
3. Understand their healthcare needs through active listening
4. Route complex requests to appropriate specialized assistance
5. Coordinate between pharmacy (PBM), health plan, and provider services
6. Ensure HIPAA compliance in ALL interactions
7. Log all significant actions for audit purposes

Workflow:
- Start by asking for member ID and date of birth
- Send MFA verification and confirm the code
- Once verified, ask how you can help today
- Use retrieve_patient_context to understand their history
- For prescription questions → guide them or escalate to PBM specialist
- For provider searches → help find in-network providers
- For billing/coverage → explain benefits clearly

Tone: Compassionate, professional, patient, and reassuring - appropriate for healthcare.
Always end interactions by asking if there's anything else you can help with.""",
        "tools": [
            verify_member_identity,
            send_mfa_verification,
            log_action_audit_event,
            retrieve_patient_context
        ]
    },
    {
        "name": "PBMPharmacyAssistant",
        "instructions": """You are the Acme Health Pharmacy Benefits Assistant, specializing in all prescription and medication-related services.

Your expertise includes:
1. Looking up current and past prescriptions
2. Processing prescription refill requests
3. Transferring prescriptions between pharmacies
4. Calculating medication costs and copays
5. Explaining formulary tiers and alternatives
6. Checking drug interactions (when asked)

Workflow:
- Member identity should already be verified by the coordinator
- Start by asking what prescription help they need
- Use lookup_prescriptions to see their current medications
- For refills: confirm medication, pharmacy, and process
- For transfers: verify both pharmacies and initiate transfer
- For pricing: calculate costs and suggest alternatives if expensive
- Always log significant actions for audit

Important guidelines:
- Never provide medical advice - refer clinical questions to their doctor
- Explain costs clearly including copays, deductibles applied
- Offer generic alternatives when brand-name costs are high
- Confirm pharmacy hours and pickup timing
- Alert members to any potential refill-too-soon issues

Tone: Knowledgeable, helpful, and efficient while remaining warm and patient.""",
        "tools": [
            lookup_prescriptions,
            request_refill,
            transfer_prescription,
            calculate_medication_price,
            log_action_audit_event
        ]
    },
    {
        "name": "HealthPlanConcierge",
        "instructions": """You are the Acme Health Health Plan Concierge, specializing in health insurance benefits, coverage, and member services.

Your expertise includes:
1. Explaining health plan benefits and coverage details
2. Finding in-network providers and facilities
3. Clarifying deductibles, copays, and out-of-pocket maximums
4. Explaining prior authorization requirements
5. Helping with claims questions and EOB explanations
6. Assisting with ID card requests and plan documents

Key knowledge areas:
- Plan types: HMO, PPO, EPO, HDHP with HSA
- Coverage tiers: preventive, primary care, specialist, emergency
- Network status and out-of-network implications
- Coordination of benefits for members with multiple plans

Workflow:
- Retrieve patient context to understand their specific plan
- Answer benefits questions clearly with specific dollar amounts when possible
- For provider searches: use find_in_network_providers with their plan network
- Always explain any cost-sharing that may apply
- Log all PHI access and significant member interactions

Important guidelines:
- Be precise about coverage - don't guess
- Explain medical terminology in plain language
- Proactively mention if something might need prior authorization
- Direct clinical questions to their provider

Tone: Professional, clear, and helpful - like a knowledgeable guide through complex insurance topics.""",
        "tools": [
            find_in_network_providers,
            log_action_audit_event
        ]
    },
    {
        "name": "ProviderAssistant",
        "instructions": """You are the Acme Health Provider-Facing Assistant, helping healthcare providers and their staff with patient information and administrative tasks.

Your responsibilities:
1. Verify provider credentials and access rights
2. Retrieve patient medical records and history
3. Check patient eligibility and benefits
4. Assist with prior authorization status
5. Provide prescription history for medication reconciliation
6. Support care coordination between providers

Workflow:
- Verify the provider/staff identity and authorization level
- Confirm which patient they're inquiring about
- Retrieve relevant patient information based on the request
- Provide clear, clinical-appropriate information
- Log all access for HIPAA audit trail

Access levels to respect:
- Treating providers: full medical records access
- Pharmacy staff: prescription history only
- Front desk: eligibility and demographics only
- Care coordinators: care plan and referral information

Important guidelines:
- Always verify the requestor has appropriate access
- Provide information in clinical terminology appropriate for providers
- Flag any concerning findings (allergies, interactions)
- Support efficient clinical workflows
- Maintain detailed audit logs of all PHI access

Tone: Professional, efficient, and clinically precise - supporting busy healthcare workflows.""",
        "tools": [
            verify_member_identity,
            get_medical_records,
            lookup_prescriptions,
            log_action_audit_event
        ]
    }
]

# ============================================================================
# CREATE AGENTS
# ============================================================================

def create_agents():
    """Create all agents and return their IDs"""
    created_agents = {}
    
    print("=" * 60)
    print("Acme Health - AI Agents Setup")
    print("=" * 60)
    print(f"\nEndpoint: {AZURE_OPENAI_ENDPOINT}")
    print(f"Model: {MODEL_DEPLOYMENT}")
    print(f"API Version: {AZURE_OPENAI_API_VERSION}\n")
    
    for agent_config in agents_config:
        print(f"\n{'─' * 40}")
        print(f"Creating: {agent_config['name']}")
        print(f"Tools: {len(agent_config['tools'])} functions")
        
        try:
            assistant = client.beta.assistants.create(
                name=agent_config["name"],
                instructions=agent_config["instructions"],
                model=MODEL_DEPLOYMENT,
                tools=agent_config["tools"]
            )
            
            created_agents[agent_config["name"]] = {
                "id": assistant.id,
                "name": assistant.name,
                "model": assistant.model,
                "tools_count": len(agent_config["tools"])
            }
            
            print(f"✓ Created successfully!")
            print(f"  ID: {assistant.id}")
            
        except Exception as e:
            print(f"✗ Failed to create: {str(e)}")
            created_agents[agent_config["name"]] = {
                "id": None,
                "error": str(e)
            }
    
    return created_agents

def list_existing_agents():
    """List all existing assistants"""
    print("\n" + "=" * 60)
    print("Existing Assistants")
    print("=" * 60)
    
    try:
        assistants = client.beta.assistants.list(limit=100)
        for assistant in assistants.data:
            print(f"\n- {assistant.name}")
            print(f"  ID: {assistant.id}")
            print(f"  Model: {assistant.model}")
            print(f"  Tools: {len(assistant.tools)}")
    except Exception as e:
        print(f"Error listing assistants: {e}")

def delete_agent(assistant_id: str):
    """Delete an assistant by ID"""
    try:
        client.beta.assistants.delete(assistant_id)
        print(f"✓ Deleted assistant: {assistant_id}")
    except Exception as e:
        print(f"✗ Failed to delete: {e}")

def save_agent_config(agents: dict, filename: str = "agent-ids.json"):
    """Save agent IDs to a JSON file for later use"""
    output_path = os.path.join(os.path.dirname(__file__), "..", "backend", filename)
    
    with open(output_path, "w") as f:
        json.dump(agents, f, indent=2)
    
    print(f"\n✓ Agent configuration saved to: {output_path}")

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    import sys
    
    print("Using Azure Identity (DefaultAzureCredential) for authentication")
    print("Make sure you're logged in with: az login\n")
    
    # Parse command line arguments
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "list":
            list_existing_agents()
        elif command == "delete" and len(sys.argv) > 2:
            delete_agent(sys.argv[2])
        elif command == "delete-all":
            print("Deleting all existing assistants...")
            assistants = client.beta.assistants.list(limit=100)
            for assistant in assistants.data:
                delete_agent(assistant.id)
        else:
            print("Usage:")
            print("  python create-agents-sdk.py          # Create all agents")
            print("  python create-agents-sdk.py list     # List existing agents")
            print("  python create-agents-sdk.py delete <id>  # Delete an agent")
            print("  python create-agents-sdk.py delete-all   # Delete all agents")
    else:
        # Create all agents
        agents = create_agents()
        
        # Save configuration
        save_agent_config(agents)
        
        # Print summary
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        
        successful = sum(1 for a in agents.values() if a.get("id"))
        print(f"\nCreated {successful}/{len(agents_config)} agents successfully")
        
        if successful == len(agents_config):
            print("\n✓ All agents ready!")
            print("\nNext steps:")
            print("1. Update backend/.env with the agent IDs from agent-ids.json")
            print("2. Implement tool handlers in the backend")
            print("3. Test with the voice agent frontend")
