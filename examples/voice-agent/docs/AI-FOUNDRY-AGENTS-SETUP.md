# AI Foundry Agents Setup Guide

## Prerequisites

Before creating agents in AI Foundry, ensure you have:

1. **Azure AI Foundry Project** - e.g. `<your-foundry-project>`
2. **Azure OpenAI Model Deployed** - You need `gpt-4o` deployed in your Azure OpenAI resource
3. **Proper Permissions** - Owner or Contributor role on the project

---

## Step 1: Access AI Foundry

1. Go to: **https://ai.azure.com**
2. Sign in with your Azure account
3. Select your project: **<your-foundry-project>**
4. Navigate to: **Build** → **Agents** (left sidebar)

---

## Step 2: Create Agent 1 - AcmeHealthCoordinator

> The agent name `AcmeHealthCoordinator` is the canonical key the backend looks up
> (see `backend/agent-ids.json`). Keep this identifier as-is unless you also rename it
> in code. The customer-facing brand text in the instructions below is what you adapt.

### Basic Settings

| Field | Value |
|-------|-------|
| **Name** | `AcmeHealthCoordinator` |
| **Model** | `gpt-4o` |
| **Description** | Main orchestrator agent for Acme Health - handles identity verification and routes to specialized agents |

### Instructions (Copy this entire block)

```
You are the Acme Health AI Coordinator - the primary point of contact for all member interactions.

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
Always end interactions by asking if there's anything else you can help with.
```

### Functions to Add (4 functions)

Click **+ Add function** for each:

#### Function 1: verify_member_identity
```json
{
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
```

#### Function 2: send_mfa_verification
```json
{
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
```

#### Function 3: log_action_audit_event
```json
{
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
```

#### Function 4: retrieve_patient_context
```json
{
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
```

**Click Save** to create the agent.

---

## Step 3: Create Agent 2 - PBMPharmacyAssistant

### Basic Settings

| Field | Value |
|-------|-------|
| **Name** | `PBMPharmacyAssistant` |
| **Model** | `gpt-4o` |
| **Description** | Pharmacy Benefits Manager assistant specializing in prescription and medication services |

### Instructions (Copy this entire block)

```
You are the Acme Health Pharmacy Benefits Assistant, specializing in all prescription and medication-related services.

Your expertise includes:
1. Looking up current and past prescriptions
2. Processing prescription refill requests
3. Transferring prescriptions between pharmacies
4. Calculating medication costs and copays
5. Explaining formulary tiers and alternatives

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

Tone: Knowledgeable, helpful, and efficient while remaining warm and patient.
```

### Functions to Add (5 functions)

#### Function 1: lookup_prescriptions
```json
{
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
```

#### Function 2: request_refill
```json
{
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
```

#### Function 3: transfer_prescription
```json
{
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
```

#### Function 4: calculate_medication_price
```json
{
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
```

#### Function 5: log_action_audit_event
```json
{
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
```

**Click Save** to create the agent.

---

## Step 4: Create Agent 3 - HealthPlanConcierge

### Basic Settings

| Field | Value |
|-------|-------|
| **Name** | `HealthPlanConcierge` |
| **Model** | `gpt-4o` |
| **Description** | Health plan benefits and provider network specialist |

### Instructions (Copy this entire block)

```
You are the Acme Health Plan Concierge, specializing in health insurance benefits, coverage, and member services.

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

Tone: Professional, clear, and helpful - like a knowledgeable guide through complex insurance topics.
```

### Functions to Add (2 functions)

#### Function 1: find_in_network_providers
```json
{
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
```

#### Function 2: log_action_audit_event
```json
{
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
```

**Click Save** to create the agent.

---

## Step 5: Create Agent 4 - ProviderAssistant

### Basic Settings

| Field | Value |
|-------|-------|
| **Name** | `ProviderAssistant` |
| **Model** | `gpt-4o` |
| **Description** | Provider-facing assistant for medical records and patient information access |

### Instructions (Copy this entire block)

```
You are the Acme Health Provider-Facing Assistant, helping healthcare providers and their staff with patient information and administrative tasks.

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

Tone: Professional, efficient, and clinically precise - supporting busy healthcare workflows.
```

### Functions to Add (4 functions)

#### Function 1: verify_member_identity
```json
{
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
```

#### Function 2: get_medical_records
```json
{
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
```

#### Function 3: lookup_prescriptions
```json
{
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
```

#### Function 4: log_action_audit_event
```json
{
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
```

**Click Save** to create the agent.

---

## Step 6: Test Your Agents

After creating all agents:

1. Click on each agent to open it
2. Use the **Test** panel on the right side
3. Try sample conversations:

### Test AcmeHealthCoordinator:
```
Hi, I need help with my insurance
```

### Test PBMPharmacyAssistant:
```
I need to refill my blood pressure medication
```

### Test HealthPlanConcierge:
```
I'm looking for a cardiologist near zip code 77030
```

### Test ProviderAssistant:
```
I need to check the medical records for patient MEM123456
```

---

## Step 7: Deploy Agents (Optional)

To make agents available via API:

1. Click on the agent
2. Go to **Deploy** tab
3. Select deployment options
4. Copy the endpoint URL for your backend integration

---

## Summary

| Agent | Functions | Purpose |
|-------|-----------|---------|
| **AcmeHealthCoordinator** | 4 | Main entry point - identity verification & routing |
| **PBMPharmacyAssistant** | 5 | Prescription refills, transfers, pricing |
| **HealthPlanConcierge** | 2 | Benefits, coverage, provider search |
| **ProviderAssistant** | 4 | Provider-facing medical records access |

---

## Troubleshooting

### "Model not found" Error
- Ensure `gpt-4o` is deployed in your Azure OpenAI resource
- Check the model deployment name matches

### "Permission denied" Error
- Verify you have Contributor role on the project
- Check Azure AD permissions

### Functions not working
- Verify JSON syntax is valid
- Check required fields are properly marked
- Test with simple parameters first

---

## Next Steps

1. **Connect to Backend**: Update your backend to use the AI Foundry agent endpoints
2. **Add Knowledge**: Upload documents for RAG-based responses
3. **Set Up Workflows**: Create multi-agent workflows for complex scenarios
4. **Monitor**: Use AI Foundry monitoring for agent performance
