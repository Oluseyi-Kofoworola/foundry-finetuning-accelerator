// ============================================================================
// Modern Azure AI Foundry (AIServices) - replaces classic Hub+Project
// ----------------------------------------------------------------------------
// Provisions:
//   * Microsoft.CognitiveServices/accounts kind=AIServices (Foundry account)
//   * /projects/agents child  (modern Foundry project, visible in ai.azure.com)
//   * gpt-4o model deployment on the Foundry account
//
// Project endpoint (used by azure-ai-projects SDK):
//   https://<account>.services.ai.azure.com/api/projects/<project>
// ============================================================================

targetScope = 'resourceGroup'

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Location for the Foundry account')
param location string = resourceGroup().location

@description('Base name (must match existing deployment)')
param baseName string = 'voiceagent'

@description('Project (capability host) name')
param projectName string = 'agents'

@description('gpt-4o deployment capacity (TPM in K)')
param gpt4oCapacity int = 10

@description('Tags')
param tags object = {
  Project: 'Voice-Agent'
  Environment: environment
  Component: 'AI-Foundry'
}

// ============================================================================
// AI Foundry account (Cognitive Services kind=AIServices)
// ============================================================================

var accountName = 'aif-${baseName}-${environment}'

resource foundry 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' = {
  name: accountName
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: accountName
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
    allowProjectManagement: true
  }
}

// ============================================================================
// Foundry project (capability host)
// ============================================================================

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-04-01-preview' = {
  parent: foundry
  name: projectName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: 'Voice Agents'
    description: 'Multi-agent system for healthcare operations - Coordinator, PBM, Concierge, Provider'
  }
}

// ============================================================================
// Model deployment: gpt-4o on the Foundry account
// ============================================================================

resource gpt4o 'Microsoft.CognitiveServices/accounts/deployments@2025-04-01-preview' = {
  parent: foundry
  name: 'gpt-4o'
  sku: {
    name: 'GlobalStandard'
    capacity: gpt4oCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: '2024-08-06'
    }
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

// ============================================================================
// Outputs
// ============================================================================

output foundryAccountName string = foundry.name
output foundryAccountId string = foundry.id
output foundryEndpoint string = foundry.properties.endpoint
output projectName string = project.name
output projectId string = project.id
output projectEndpoint string = 'https://${accountName}.services.ai.azure.com/api/projects/${projectName}'
output gpt4oDeploymentName string = gpt4o.name
