// ============================================================================
// Container Apps Environment Module
// ============================================================================

@description('Name of the Container Apps Environment')
param name string

@description('Location for the resource')
param location string

@description('Log Analytics Workspace Customer ID')
param logAnalyticsWorkspaceId string

@description('Log Analytics Workspace Shared Key')
@secure()
param logAnalyticsSharedKey string

@description('Application Insights Connection String')
param appInsightsConnectionString string

@description('Tags for the resource')
param tags object = {}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspaceId
        sharedKey: logAnalyticsSharedKey
      }
    }
    daprAIConnectionString: appInsightsConnectionString
    zoneRedundant: false
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

// Outputs
output resourceId string = containerAppsEnvironment.id
output name string = containerAppsEnvironment.name
output defaultDomain string = containerAppsEnvironment.properties.defaultDomain
output staticIp string = containerAppsEnvironment.properties.staticIp
