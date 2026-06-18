// ============================================================================
// Action Group Module for Alert Notifications
// ============================================================================

@description('Name of the Action Group')
param name string

@description('Short name for the Action Group (max 12 characters)')
@maxLength(12)
param shortName string

@description('Email receivers for alerts')
param emailReceivers array = []

@description('Tags for the resource')
param tags object = {}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: name
  location: 'global'
  tags: tags
  properties: {
    groupShortName: shortName
    enabled: true
    emailReceivers: emailReceivers
  }
}

// Outputs
output resourceId string = actionGroup.id
output name string = actionGroup.name
