// ============================================================================
// Voice Agent - Azure Infrastructure
// Enterprise Voice Agent (white-label template)
// ============================================================================

targetScope = 'subscription'

// ============================================================================
// Parameters
// ============================================================================

@description('Environment name (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Azure region for all resources')
param location string = 'eastus2'

@description('Azure region for AI Search (override when primary region is capacity-constrained)')
param searchLocation string = location

@description('Base name for all resources')
param baseName string = 'shuttervoice'

@description('Email addresses for monitoring alerts')
param alertEmailAddresses array = ['alerts@example.com']

@description('Tags for all resources')
param tags object = {
  Project: 'Voice-Agent'
  Environment: environment
  ManagedBy: 'Bicep'
  Application: 'Voice-Agent'
  Owner: 'Acme Health'
  OwnerEmail: 'alerts@example.com'
}

// ============================================================================
// Variables
// ============================================================================

var resourceGroupName = 'rg-${baseName}-${environment}'
var uniqueSuffix = uniqueString(subscription().subscriptionId, baseName, environment)
var acrName = 'acr${baseName}${uniqueSuffix}'
var logAnalyticsName = 'log-${baseName}-${environment}'
var appInsightsName = 'appi-${baseName}-${environment}'
var azureOpenAIName = 'aoai-${baseName}-${environment}'
var containerEnvName = 'cae-${baseName}-${environment}'
var backendAppName = 'ca-${baseName}-backend-${environment}'
var frontendAppName = 'ca-${baseName}-frontend-${environment}'
var actionGroupName = 'ag-${baseName}-${environment}'
var searchServiceName = 'srch-${baseName}-${environment}-${uniqueSuffix}'
var contentSafetyName = 'cs-${baseName}-${environment}-${uniqueSuffix}'

// Built-in role IDs used for AI Foundry grounding + guardrails
var searchIndexDataReaderRoleId = '1407120a-92aa-4202-b7e9-c0e197c71c8f' // Search Index Data Reader
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908' // Cognitive Services User

// ============================================================================
// Resource Group
// ============================================================================

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// ============================================================================
// Modules
// ============================================================================

// Log Analytics Workspace
module logAnalytics 'modules/log-analytics.bicep' = {
  name: 'logAnalytics'
  scope: resourceGroup
  params: {
    name: logAnalyticsName
    location: location
    tags: tags
  }
}

// Application Insights
module appInsights 'modules/app-insights.bicep' = {
  name: 'appInsights'
  scope: resourceGroup
  params: {
    name: appInsightsName
    location: location
    workspaceResourceId: logAnalytics.outputs.resourceId
    tags: tags
  }
}

// Azure OpenAI (deployed to eastus2 which supports GPT-4o Realtime)
module azureOpenAI 'modules/azure-openai.bicep' = {
  name: 'azureOpenAI'
  scope: resourceGroup
  params: {
    name: azureOpenAIName
    location: 'eastus2'  // GPT-4o Realtime is only available in eastus2 and swedencentral
    tags: tags
  }
}

// Container Registry
module containerRegistry 'modules/container-registry.bicep' = {
  name: 'containerRegistry'
  scope: resourceGroup
  params: {
    name: acrName
    location: location
    tags: tags
  }
}

// Azure AI Search — Acme knowledge collections (grounding for the agent)
module aiSearch 'modules/ai-search.bicep' = {
  name: 'aiSearch'
  scope: resourceGroup
  params: {
    name: searchServiceName
    location: searchLocation
    sku: 'basic'
    tags: tags
  }
}

// Azure AI Content Safety — Prompt Shields + text moderation
module contentSafety 'modules/content-safety.bicep' = {
  name: 'contentSafety'
  scope: resourceGroup
  params: {
    name: contentSafetyName
    location: location
    sku: 'S0'
    tags: tags
  }
}

// Container Apps Environment
module containerAppsEnvironment 'modules/container-apps-environment.bicep' = {
  name: 'containerAppsEnvironment'
  scope: resourceGroup
  params: {
    name: containerEnvName
    location: location
    logAnalyticsWorkspaceId: logAnalytics.outputs.customerId
    logAnalyticsSharedKey: logAnalytics.outputs.primarySharedKey
    appInsightsConnectionString: appInsights.outputs.connectionString
    tags: tags
  }
}

// Backend Container App
module backendApp 'modules/container-app.bicep' = {
  name: 'backendApp'
  scope: resourceGroup
  params: {
    name: backendAppName
    location: location
    containerAppsEnvironmentId: containerAppsEnvironment.outputs.resourceId
    containerRegistryLoginServer: containerRegistry.outputs.loginServer
    containerRegistryName: containerRegistry.outputs.name
    imageName: '${containerRegistry.outputs.loginServer}/${baseName}-backend:latest'
    targetPort: 3001
    isBackend: true
    environmentVariables: [
      { name: 'NODE_ENV', value: 'production' }
      { name: 'PORT', value: '3001' }
      { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAI.outputs.endpoint }
      { name: 'AZURE_OPENAI_DEPLOYMENT', value: azureOpenAI.outputs.deploymentName }
      { name: 'USE_AZURE_OPENAI', value: 'true' }
      { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.outputs.connectionString }
      { name: 'LOG_LEVEL', value: 'info' }
      { name: 'CORS_ORIGIN', value: 'https://${frontendAppName}.${containerAppsEnvironment.outputs.defaultDomain}' }
      // Foundry knowledge (Azure AI Search) — used by foundry-knowledge.ts
      { name: 'AZURE_SEARCH_ENDPOINT', value: aiSearch.outputs.endpoint }
      { name: 'AZURE_SEARCH_INDEX', value: 'acme-knowledge' }
      { name: 'AZURE_SEARCH_TOP_K', value: '5' }
      { name: 'AZURE_SEARCH_SEMANTIC_CONFIG', value: 'acme-semantic' }
      { name: 'AZURE_SEARCH_AUTH', value: 'managed-identity' }
      // Content Safety + Prompt Shields — used by content-safety.ts
      { name: 'AZURE_CONTENT_SAFETY_ENDPOINT', value: contentSafety.outputs.endpoint }
      { name: 'PROMPT_SHIELD_ENABLED', value: 'true' }
      { name: 'CONTENT_SAFETY_ENABLED', value: 'true' }
      { name: 'CONTENT_SAFETY_BLOCK_SEVERITY', value: '4' }
    ]
    secrets: []
    tags: tags
  }
}

// Role assignment for Backend App to access Azure OpenAI
module backendOpenAIRole 'modules/role-assignment.bicep' = {
  name: 'backendOpenAIRole'
  scope: resourceGroup
  params: {
    principalId: backendApp.outputs.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd' // Cognitive Services OpenAI User
    azureOpenAIName: azureOpenAI.outputs.name
  }
}

// Backend → AI Search (Search Index Data Reader)
module backendSearchRole 'modules/role-assignment-search.bicep' = {
  name: 'backendSearchRole'
  scope: resourceGroup
  params: {
    principalId: backendApp.outputs.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: searchIndexDataReaderRoleId
    searchServiceName: aiSearch.outputs.name
  }
}

// Backend → Content Safety (Cognitive Services User)
module backendContentSafetyRole 'modules/role-assignment-cognitive.bicep' = {
  name: 'backendContentSafetyRole'
  scope: resourceGroup
  params: {
    principalId: backendApp.outputs.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveServicesUserRoleId
    accountName: contentSafety.outputs.name
  }
}

// Frontend Container App
module frontendApp 'modules/container-app.bicep' = {
  name: 'frontendApp'
  scope: resourceGroup
  params: {
    name: frontendAppName
    location: location
    containerAppsEnvironmentId: containerAppsEnvironment.outputs.resourceId
    containerRegistryLoginServer: containerRegistry.outputs.loginServer
    containerRegistryName: containerRegistry.outputs.name
    imageName: '${containerRegistry.outputs.loginServer}/${baseName}-frontend:latest'
    targetPort: 8080
    isBackend: false
    environmentVariables: [
      { name: 'VITE_WS_URL', value: 'wss://${backendApp.outputs.fqdn}' }
      { name: 'VITE_API_URL', value: 'https://${backendApp.outputs.fqdn}' }
    ]
    secrets: []
    tags: tags
  }
}

// Action Group for Alerts
module actionGroup 'modules/action-group.bicep' = {
  name: 'actionGroup'
  scope: resourceGroup
  params: {
    name: actionGroupName
    shortName: 'AcmeAlrt'
    emailReceivers: [for (email, i) in alertEmailAddresses: {
      name: 'Email_${i}'
      emailAddress: email
      useCommonAlertSchema: true
    }]
    tags: tags
  }
}

// Monitoring Alerts (Application Insights based)
module alerts 'modules/alerts.bicep' = {
  name: 'alerts'
  scope: resourceGroup
  params: {
    baseName: baseName
    environment: environment
    actionGroupId: actionGroup.outputs.resourceId
    appInsightsResourceId: appInsights.outputs.resourceId
    tags: tags
  }
}

// ============================================================================
// Outputs
// ============================================================================

output resourceGroupName string = resourceGroup.name
output containerRegistryLoginServer string = containerRegistry.outputs.loginServer
output containerRegistryName string = containerRegistry.outputs.name
output backendUrl string = 'https://${backendApp.outputs.fqdn}'
output frontendUrl string = 'https://${frontendApp.outputs.fqdn}'
output appInsightsConnectionString string = appInsights.outputs.connectionString
output logAnalyticsWorkspaceId string = logAnalytics.outputs.resourceId
output azureOpenAIEndpoint string = azureOpenAI.outputs.endpoint
output azureOpenAIDeploymentName string = azureOpenAI.outputs.deploymentName
output aiSearchEndpoint string = aiSearch.outputs.endpoint
output aiSearchName string = aiSearch.outputs.name
output contentSafetyEndpoint string = contentSafety.outputs.endpoint
output contentSafetyName string = contentSafety.outputs.name
