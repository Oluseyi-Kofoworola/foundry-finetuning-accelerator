// =============================================================================
// Azure AI Search — Acme Health voice agent grounding index
// =============================================================================
// Hosts the Acme knowledge collections (acme-mho-faq, acme-locations,
// acme-cancellation-policy, acme-health-plus-benefits, acme-network-directory,
// acme-health-plus-policy, acme-interpreter-services).
// Uses system-assigned managed identity so we can wire RBAC from the backend
// Container App to read the index without secrets.
// =============================================================================

@description('Name of the Azure AI Search service.')
param name string

@description('Azure region.')
param location string = resourceGroup().location

@description('SKU tier. basic is fine for demo; use standard for production semantic ranker.')
@allowed([
  'free'
  'basic'
  'standard'
  'standard2'
  'standard3'
])
param sku string = 'basic'

@description('Tags applied to the search service.')
param tags object = {}

@description('Public network access. Use Disabled in production w/ private endpoints.')
@allowed([
  'enabled'
  'disabled'
])
param publicNetworkAccess string = 'enabled'

resource search 'Microsoft.Search/searchServices@2024-03-01-preview' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: sku
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: publicNetworkAccess
    semanticSearch: 'standard'
    authOptions: {
      aadOrApiKey: {
        aadAuthFailureMode: 'http401WithBearerChallenge'
      }
    }
    disableLocalAuth: false
    networkRuleSet: {
      ipRules: []
    }
  }
}

output id string = search.id
output name string = search.name
output endpoint string = 'https://${search.name}.search.windows.net'
output principalId string = search.identity.principalId
