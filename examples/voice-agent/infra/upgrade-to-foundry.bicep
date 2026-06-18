// ============================================================================
// UPGRADE: Add AI Foundry to Existing Voice Agent Infrastructure
// This adds multi-agent capabilities without replacing existing resources
// ============================================================================

targetScope = 'resourceGroup'

// ============================================================================
// Parameters - Reference existing resources
// ============================================================================

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Location for AI resources')
param location string = resourceGroup().location

@description('Base name (must match existing deployment)')
param baseName string = 'voiceagent'

@description('Existing Azure OpenAI name')
param existingOpenAIName string = 'aoai-${baseName}-${environment}'

@description('Existing App Insights name')
param existingAppInsightsName string = 'appi-${baseName}-${environment}'

@description('Tags')
param tags object = {
  Project: 'Voice-Agent'
  Environment: environment
  Upgrade: 'AI-Foundry-Agents'
}

// ============================================================================
// Reference Existing Resources
// ============================================================================

resource existingOpenAI 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: existingOpenAIName
}

resource existingAppInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: existingAppInsightsName
}

// ============================================================================
// New Storage Account (for AI Hub)
// ============================================================================

var storageAccountName = 'st${baseName}ai${substring(uniqueString(resourceGroup().id), 0, 6)}'

resource aiStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

// ============================================================================
// Deploy AI Foundry Module
// ============================================================================

module aiFoundry 'modules/ai-foundry.bicep' = {
  name: 'aiFoundryDeployment'
  params: {
    baseName: baseName
    environment: environment
    location: location
    azureOpenAIResourceId: existingOpenAI.id
    azureOpenAIEndpoint: existingOpenAI.properties.endpoint
    storageAccountName: aiStorage.name
    appInsightsResourceId: existingAppInsights.id
    tags: tags
  }
}

// ============================================================================
// Deploy GPT-4o for Agents (if not exists)
// ============================================================================

resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: existingOpenAI
  name: 'gpt-4o'
  sku: {
    name: 'GlobalStandard'
    capacity: 10
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

output aiHubName string = aiFoundry.outputs.aiHubName
output aiProjectName string = aiFoundry.outputs.aiProjectName
output projectConnectionString string = aiFoundry.outputs.projectConnectionString
output keyVaultName string = aiFoundry.outputs.keyVaultName
output existingOpenAIEndpoint string = existingOpenAI.properties.endpoint
output storageAccountName string = aiStorage.name
