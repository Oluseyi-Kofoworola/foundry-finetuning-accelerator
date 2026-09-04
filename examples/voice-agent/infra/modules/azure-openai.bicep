// ============================================================================
// Azure OpenAI Module
// ============================================================================

@description('Name of the Azure OpenAI resource')
param name string

@description('Location for the resource')
param location string

@description('Tags for the resource')
param tags object = {}

@description('SKU for Azure OpenAI')
param sku string = 'S0'

resource azureOpenAI 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: name
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: sku
  }
  properties: {
    customSubDomainName: name
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false  // Enable API key authentication
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

// Deploy GPT Realtime model
resource gpt4oRealtimeDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: azureOpenAI
  name: 'gpt-4o-realtime'
  sku: {
    name: 'GlobalStandard'
    capacity: 1
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-realtime'
      version: '2025-08-28'
    }
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

// Outputs
output resourceId string = azureOpenAI.id
output name string = azureOpenAI.name
output endpoint string = azureOpenAI.properties.endpoint
output deploymentName string = gpt4oRealtimeDeployment.name
