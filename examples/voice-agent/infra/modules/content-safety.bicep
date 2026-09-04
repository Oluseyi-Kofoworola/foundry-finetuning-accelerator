// =============================================================================
// Azure AI Content Safety — Acme Health voice agent guardrails
// =============================================================================
// Provides Prompt Shields (jailbreak + indirect injection) and text moderation
// for the patient-access voice agent.
//
// Auth: backend Container App uses managed identity → "Cognitive Services User"
// role on this account to call the contentsafety endpoints without keys.
// =============================================================================

@description('Resource name (must be globally unique).')
param name string

@description('Azure region. Content Safety availability varies by region.')
param location string = resourceGroup().location

@description('SKU. S0 is the standard paid tier; F0 is free with low quota.')
@allowed([
  'F0'
  'S0'
])
param sku string = 'S0'

@description('Tags applied to the account.')
param tags object = {}

@description('Public network access. Use Disabled in production w/ private endpoints.')
@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Enabled'

resource cs 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: name
  location: location
  tags: tags
  kind: 'ContentSafety'
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: sku
  }
  properties: {
    customSubDomainName: name
    publicNetworkAccess: publicNetworkAccess
    disableLocalAuth: false
    networkAcls: {
      defaultAction: 'Allow'
      virtualNetworkRules: []
      ipRules: []
    }
  }
}

output id string = cs.id
output name string = cs.name
output endpoint string = cs.properties.endpoint
output principalId string = cs.identity.principalId
