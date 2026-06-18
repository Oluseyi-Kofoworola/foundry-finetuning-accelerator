#!/usr/bin/env python3
"""
Azure AI Foundry Agents - Create & Manage Multi-Agent System
Acme Health - Healthcare Operations

This script creates and manages AI agents in the modern AIServices-based
Azure AI Foundry. Uses the new endpoint-based initialization.

Usage:
    python create-foundry-agents.py          # create all agents
    python create-foundry-agents.py list     # list existing agents
    python create-foundry-agents.py delete <agent_id>    # delete by ID
    python create-foundry-agents.py delete-all           # delete all agents
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from azure.ai.agents import AgentsClient
from azure.identity import DefaultAzureCredential

# ============================================================================
# Configuration
# ============================================================================

load_dotenv()

# Foundry endpoint (modern AIServices + projects)
PROJECT_ENDPOINT = os.getenv(
    "AZURE_AI_PROJECT_ENDPOINT",
    "https://aif-shuttervoice-dev.services.ai.azure.com/api/projects/agents"
)

# Output file for agent IDs
IDS_FILE = Path(__file__).parent.parent / "backend" / "foundry-agent-ids.json"

MODEL = "gpt-4o"

# ============================================================================
# Agent Configurations
# ============================================================================

agents_config = [
    {
        "name": "AcmeHealthCoordinator",
        "description": "Main orchestrator agent for Acme Health - handles identity verification and routes to specialized agents",
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
- Route to specialists: PBMPharmacyAssistant, HealthPlanConcierge, or ProviderAssistant
- Never assume—always verify before performing actions

When to Route:
- Prescription/pharmacy questions → PBMPharmacyAssistant
- Plan benefits/eligibility → HealthPlanConcierge
- Provider network/scheduling → ProviderAssistant
- Complex multi-domain issues → Coordinate between specialists

IMPORTANT: Always prioritize member safety and privacy. If uncertain, ask clarifying questions.""",
        "tools": [
            "verify_member_identity",
            "retrieve_patient_context",
            "log_action_audit_event",
            "send_mfa_verification",
        ],
    },
    {
        "name": "PBMPharmacyAssistant",
        "description": "Pharmacy and PBM (Pharmacy Benefit Manager) specialist - handles prescriptions, refills, coverage",
        "instructions": """You are the Acme Health Pharmacy & PBM Assistant - expert in prescription management and medication coverage.

Your role:
- Assist with prescription information, status, and refill requests
- Explain medication coverage, copays, and formulary restrictions
- Answer questions about pharmacy networks and in-network locations
- Help members find cost-effective medication alternatives
- Coordinate transfers between pharmacies when needed
- Provide medication interaction warnings and usage guidance

Key capabilities:
- lookup_prescriptions: Find active/recent prescriptions
- request_refill: Submit refill requests
- calculate_medication_price: Show member costs for medications
- log_action_audit_event: Record all significant actions

Workflow:
1. Confirm member identity (already done by Coordinator)
2. Ask specific details: medication name, pharmacy, reason for inquiry
3. Look up prescription info or calculate cost if pricing question
4. Provide clear, non-clinical guidance
5. If member needs clinical advice (drug interactions, dosing), defer to ProviderAssistant

When to escalate:
- Clinical advice needed → ProviderAssistant
- Insurance coverage questions → HealthPlanConcierge
- Identity verification needed → AcmeHealthCoordinator""",
        "tools": [
            "lookup_prescriptions",
            "request_refill",
            "transfer_prescription",
            "calculate_medication_price",
            "log_action_audit_event",
        ],
    },
    {
        "name": "HealthPlanConcierge",
        "description": "Health plan and benefits specialist - explains coverage, eligibility, claims",
        "instructions": """You are the Acme Health Plan Concierge - expert in benefits, coverage, and member services.

Your role:
- Explain health plan benefits, deductibles, copays, coinsurance
- Answer eligibility and coverage questions
- Help with claim status and appeals
- Provide information about preventive care and wellness programs
- Guide members on how to maximize their benefits
- Assist with plan comparisons and renewal questions

Key capabilities:
- retrieve_patient_context: Access member's plan and history
- calculate_medication_price: Show copays and coverage
- find_in_network_providers: Locate covered providers
- log_action_audit_event: Record interactions

Workflow:
1. Confirm member identity (already done by Coordinator)
2. Ask what they need: benefits explanation, claim question, coverage check, etc.
3. Look up their specific plan details in patient context
4. Provide clear, jargon-free explanations
5. Connect them with appropriate resources or specialists as needed

When to escalate:
- Prescription/pharmacy details → PBMPharmacyAssistant
- Provider/appointment questions → ProviderAssistant
- Identity verification → AcmeHealthCoordinator

Remember: Always be empathetic. Benefits are complex—explain clearly and offer multiple options when possible.""",
        "tools": [
            "retrieve_patient_context",
            "find_in_network_providers",
            "calculate_medication_price",
            "log_action_audit_event",
        ],
    },
    {
        "name": "ProviderAssistant",
        "description": "Provider network and clinical coordination specialist - handles referrals, scheduling, network info",
        "instructions": """You are the Acme Health Provider Assistant - expert in provider networks, referrals, and care coordination.

Your role:
- Help members find in-network providers and specialists
- Explain referral requirements and processes
- Provide provider credentials and specialties
- Assist with scheduling guidance and pre-authorization questions
- Support care coordination between providers
- Answer questions about telehealth and virtual visits

Key capabilities:
- find_in_network_providers: Locate providers by specialty/location
- retrieve_patient_context: Check member's primary care assignment
- log_action_audit_event: Record all interactions

Workflow:
1. Confirm member identity (already done by Coordinator)
2. Understand their need: find a provider, get referral info, etc.
3. Ask relevant details: specialty, location preference, insurance need
4. Provide matching providers with credentials and how to contact
5. Explain any referral or authorization steps needed

When to escalate:
- Prescription/medication questions → PBMPharmacyAssistant
- Insurance coverage/benefits → HealthPlanConcierge
- Identity verification → AcmeHealthCoordinator
- Clinical advice or diagnosis → Recommend member contact their provider

HIPAA reminder: Never share PHI beyond what's necessary. Always keep member privacy first.""",
        "tools": [
            "find_in_network_providers",
            "retrieve_patient_context",
            "send_mfa_verification",
            "log_action_audit_event",
        ],
    },
]

# ============================================================================
# Tool Definitions
# ============================================================================

tools_definitions = {
    "verify_member_identity": {
        "type": "function",
        "function": {
            "name": "verify_member_identity",
            "description": "Verify Acme Health member identity via DOB and MFA",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "string",
                        "description": "Acme Health member ID",
                    },
                    "date_of_birth": {
                        "type": "string",
                        "description": "Member date of birth (YYYY-MM-DD)",
                    },
                },
                "required": ["member_id", "date_of_birth"],
            },
        },
    },
    "send_mfa_verification": {
        "type": "function",
        "function": {
            "name": "send_mfa_verification",
            "description": "Send MFA code to member (email/SMS) and verify",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "string",
                        "description": "Acme Health member ID",
                    },
                    "delivery_method": {
                        "type": "string",
                        "enum": ["email", "sms"],
                        "description": "How to deliver MFA code",
                    },
                },
                "required": ["member_id", "delivery_method"],
            },
        },
    },
    "retrieve_patient_context": {
        "type": "function",
        "function": {
            "name": "retrieve_patient_context",
            "description": "Fetch member's full healthcare context: prescriptions, plan, history",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "string",
                        "description": "Acme Health member ID",
                    }
                },
                "required": ["member_id"],
            },
        },
    },
    "lookup_prescriptions": {
        "type": "function",
        "function": {
            "name": "lookup_prescriptions",
            "description": "Look up member's active and recent prescriptions",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "string",
                        "description": "Acme Health member ID",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["active", "filled", "pending", "all"],
                        "description": "Filter by prescription status",
                    },
                },
                "required": ["member_id"],
            },
        },
    },
    "request_refill": {
        "type": "function",
        "function": {
            "name": "request_refill",
            "description": "Submit a prescription refill request to the pharmacy",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "string",
                        "description": "Acme Health member ID",
                    },
                    "prescription_id": {
                        "type": "string",
                        "description": "ID of prescription to refill",
                    },
                    "pharmacy_id": {
                        "type": "string",
                        "description": "Target pharmacy ID",
                    },
                },
                "required": ["member_id", "prescription_id", "pharmacy_id"],
            },
        },
    },
    "transfer_prescription": {
        "type": "function",
        "function": {
            "name": "transfer_prescription",
            "description": "Transfer prescription from one pharmacy to another",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "string",
                        "description": "Acme Health member ID",
                    },
                    "prescription_id": {
                        "type": "string",
                        "description": "ID of prescription to transfer",
                    },
                    "from_pharmacy_id": {
                        "type": "string",
                        "description": "Source pharmacy ID",
                    },
                    "to_pharmacy_id": {
                        "type": "string",
                        "description": "Destination pharmacy ID",
                    },
                },
                "required": [
                    "member_id",
                    "prescription_id",
                    "from_pharmacy_id",
                    "to_pharmacy_id",
                ],
            },
        },
    },
    "calculate_medication_price": {
        "type": "function",
        "function": {
            "name": "calculate_medication_price",
            "description": "Calculate member's cost for a medication based on their plan",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "string",
                        "description": "Acme Health member ID",
                    },
                    "medication_name": {
                        "type": "string",
                        "description": "Name of medication (generic or brand)",
                    },
                    "quantity": {
                        "type": "integer",
                        "description": "Number of pills/units (e.g., 30, 90)",
                    },
                },
                "required": ["member_id", "medication_name", "quantity"],
            },
        },
    },
    "find_in_network_providers": {
        "type": "function",
        "function": {
            "name": "find_in_network_providers",
            "description": "Find in-network providers by specialty and location",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "string",
                        "description": "Acme Health member ID",
                    },
                    "specialty": {
                        "type": "string",
                        "description": "Medical specialty (e.g., cardiology, primary care)",
                    },
                    "location": {
                        "type": "string",
                        "description": "City or zip code",
                    },
                },
                "required": ["member_id", "specialty", "location"],
            },
        },
    },
    "log_action_audit_event": {
        "type": "function",
        "function": {
            "name": "log_action_audit_event",
            "description": "Log member interaction for compliance and audit trails",
            "parameters": {
                "type": "object",
                "properties": {
                    "member_id": {
                        "type": "string",
                        "description": "Acme Health member ID",
                    },
                    "action": {
                        "type": "string",
                        "description": "Description of action (e.g., 'verified identity', 'requested refill')",
                    },
                },
                "required": ["member_id", "action"],
            },
        },
    },
}

# ============================================================================
# Client Initialization
# ============================================================================

print("Using Azure AI Foundry Agents SDK (v1)")
print("Make sure you're logged in with: az login\n")

try:
    credential = DefaultAzureCredential()
    client = AgentsClient(endpoint=PROJECT_ENDPOINT, credential=credential)
    print(f"Connected to: {PROJECT_ENDPOINT}\n")
except Exception as e:
    print(f"ERROR: Failed to connect to Foundry project: {e}")
    sys.exit(1)

# ============================================================================
# Functions
# ============================================================================


def get_agent_tools(agent_name: str) -> list:
    """Build tool definitions for an agent."""
    agent = next((a for a in agents_config if a["name"] == agent_name), None)
    if not agent:
        return []
    
    tools_list = []
    for tool_name in agent.get("tools", []):
        if tool_name in tools_definitions:
            tools_list.append(tools_definitions[tool_name])
    return tools_list


def create_agents() -> dict:
    """Create all agents and return their IDs."""
    print("=" * 60)
    print("Acme Health - AI Foundry Agents Setup")
    print("=" * 60)
    print(f"\nProject: {PROJECT_ENDPOINT.split('/projects/')[-1]}")
    print(f"Model: {MODEL}\n")

    created_agents = {}
    
    for agent_config in agents_config:
        agent_name = agent_config["name"]
        print("=" * 60)
        print(f"Creating: {agent_name}")
        print(f"Tools: {len(agent_config['tools'])} functions")
        
        try:
            tools = get_agent_tools(agent_name)
            
            agent = client.create_agent(
                model=MODEL,
                name=agent_name,
                description=agent_config["description"],
                instructions=agent_config["instructions"],
                tools=tools,
            )
            
            print(f"✓ Created successfully!")
            print(f"  ID: {agent.id}\n")
            
            created_agents[agent_name] = {
                "id": agent.id,
                "name": agent.name,
                "model": MODEL,
                "tools_count": len(tools),
            }
            
        except Exception as e:
            print(f"✗ Failed: {e}\n")
    
    # Save agent IDs
    if created_agents:
        IDS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(IDS_FILE, "w", encoding="utf-8") as f:
            json.dump(created_agents, f, indent=2)
        print(f"✓ Agent configuration saved to: {IDS_FILE}\n")
    
    return created_agents


def list_agents() -> None:
    """List all agents in the project."""
    try:
        agents = client.list_agents()
        print(f"\n{'Agent Name':<30} {'ID':<30} {'Model':<10}")
        print("-" * 70)
        for agent in agents:
            print(f"{agent.name:<30} {agent.id:<30} {getattr(agent, 'model', 'N/A'):<10}")
    except Exception as e:
        print(f"ERROR listing agents: {e}")


def delete_agent(agent_id: str) -> None:
    """Delete an agent by ID."""
    try:
        client.delete_agent(agent_id)
        print(f"✓ Deleted agent: {agent_id}")
        
        # Remove from IDS_FILE if present
        if IDS_FILE.exists():
            with open(IDS_FILE, "r", encoding="utf-8") as f:
                agents = json.load(f)
            
            agent_to_remove = next(
                (k for k, v in agents.items() if v.get("id") == agent_id), None
            )
            if agent_to_remove:
                del agents[agent_to_remove]
                with open(IDS_FILE, "w", encoding="utf-8") as f:
                    json.dump(agents, f, indent=2)
                print(f"  Removed from {IDS_FILE}")
    
    except Exception as e:
        print(f"ERROR deleting agent {agent_id}: {e}")


def delete_all_agents() -> None:
    """Delete all agents in the project."""
    try:
        agents = client.list_agents()
        count = 0
        for agent in agents:
            client.delete_agent(agent.id)
            print(f"  ✓ Deleted: {agent.name} ({agent.id})")
            count += 1
        
        print(f"\n✓ Deleted {count} agents total")
        
        # Clear IDS_FILE
        if IDS_FILE.exists():
            with open(IDS_FILE, "w", encoding="utf-8") as f:
                json.dump({}, f, indent=2)
    
    except Exception as e:
        print(f"ERROR deleting agents: {e}")


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Create mode (default)
        agents = create_agents()
        
        print("=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"\nCreated {len(agents)}/{len(agents_config)} agents successfully")
        
        if len(agents) == len(agents_config):
            print("\n✓ All agents ready in Azure AI Foundry!")
            print("\nView them at: https://ai.azure.com")
        sys.exit(0 if len(agents) == len(agents_config) else 1)
    
    command = sys.argv[1].lower()
    
    if command == "list":
        list_agents()
    
    elif command == "delete":
        if len(sys.argv) < 3:
            print("Usage: python create-foundry-agents.py delete <agent_id>")
            sys.exit(1)
        delete_agent(sys.argv[2])
    
    elif command == "delete-all":
        confirm = input("Delete ALL agents? (y/N): ")
        if confirm.lower() == "y":
            delete_all_agents()
        else:
            print("Cancelled")
    
    else:
        print(f"Unknown command: {command}")
        print("Usage:")
        print("  python create-foundry-agents.py          # create all")
        print("  python create-foundry-agents.py list     # list agents")
        print("  python create-foundry-agents.py delete <id>     # delete by ID")
        print("  python create-foundry-agents.py delete-all      # delete all")
        sys.exit(1)
