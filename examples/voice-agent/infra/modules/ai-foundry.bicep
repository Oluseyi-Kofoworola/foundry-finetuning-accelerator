// ============================================================================
// Azure AI Foundry Module - Adds AI Hub & Project to existing infrastructure
// Acme Health - Multi-Agent Orchestration
// ============================================================================

@description('Base name for resources')
param baseName string

@description('Environment name')
param environment string

@description('Location for AI resources')
param location string

@description('Existing Azure OpenAI resource ID')
param azureOpenAIResourceId string

@description('Existing Azure OpenAI endpoint')
param azureOpenAIEndpoint string

@description('Existing Storage Account name (for AI Hub)')
param storageAccountName string

@description('Existing Application Insights resource ID')
param appInsightsResourceId string

@description('Tags for resources')
param tags object = {}

// ============================================================================
// Variables
// ============================================================================

var aiHubName = 'hub-${baseName}-${environment}'
var aiProjectName = 'proj-${baseName}-agents-${environment}'
var keyVaultName = 'kv${baseName}${substring(uniqueString(resourceGroup().id), 0, 6)}'

// ============================================================================
// Key Vault (required for AI Hub)
// ============================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

// ============================================================================
// Reference existing storage
// ============================================================================

resource existingStorage 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

// ============================================================================
// AI Hub
// ============================================================================

resource aiHub 'Microsoft.MachineLearningServices/workspaces@2024-04-01' = {
  name: aiHubName
  location: location
  tags: tags
  kind: 'Hub'
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    friendlyName: 'Acme Health AI Hub'
    description: 'AI Hub for Acme Health multi-agent orchestration'
    storageAccount: existingStorage.id
    keyVault: keyVault.id
    applicationInsights: appInsightsResourceId
    publicNetworkAccess: 'Enabled'
    managedNetwork: {
      isolationMode: 'Disabled'
    }
  }
}

// ============================================================================
// Azure OpenAI Connection
// ============================================================================

resource aoaiConnection 'Microsoft.MachineLearningServices/workspaces/connections@2024-04-01' = {
  parent: aiHub
  name: 'aoai-connection'
  properties: {
    category: 'AzureOpenAI'
    target: azureOpenAIEndpoint
    authType: 'AAD'
    isSharedToAll: true
    metadata: {
      ApiType: 'Azure'
      ResourceId: azureOpenAIResourceId
    }
  }
}

// ============================================================================
// AI Project
// ============================================================================

resource aiProject 'Microsoft.MachineLearningServices/workspaces@2024-04-01' = {
  name: aiProjectName
  location: location
  tags: tags
  kind: 'Project'
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    friendlyName: 'Acme Health Agent Project'
    description: 'Multi-agent system for healthcare operations - PBM, Concierge, Provider'
    hubResourceId: aiHub.id
    publicNetworkAccess: 'Enabled'
  }
}

// ============================================================================
// Role Assignments - AI Hub & Project can access OpenAI
// ============================================================================

resource hubOpenAIRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiHub.id, azureOpenAIResourceId, 'CognitiveServicesOpenAIUser-hub')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
    principalId: aiHub.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource projectOpenAIRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiProject.id, azureOpenAIResourceId, 'CognitiveServicesOpenAIUser-project')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
    principalId: aiProject.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Outputs
// ============================================================================

output aiHubId string = aiHub.id
output aiHubName string = aiHub.name
output aiHubPrincipalId string = aiHub.identity.principalId
output aiProjectId string = aiProject.id
output aiProjectName string = aiProject.name
output aiProjectPrincipalId string = aiProject.identity.principalId
output keyVaultName string = keyVault.name
output keyVaultId string = keyVault.id
output projectConnectionString string = '${location}.api.azureml.ms;${subscription().subscriptionId};${resourceGroup().name};${aiProjectName}'
