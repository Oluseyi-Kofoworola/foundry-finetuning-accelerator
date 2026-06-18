// ============================================================================
// Application Insights Module
// ============================================================================

@description('Name of the Application Insights resource')
param name string

@description('Location for the resource')
param location string

@description('Resource ID of the Log Analytics workspace')
param workspaceResourceId string

@description('Tags for the resource')
param tags object = {}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: name
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspaceResourceId
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    RetentionInDays: 90
    DisableIpMasking: false
    DisableLocalAuth: false
  }
}

// Outputs
output resourceId string = appInsights.id
output name string = appInsights.name
output connectionString string = appInsights.properties.ConnectionString
output instrumentationKey string = appInsights.properties.InstrumentationKey
