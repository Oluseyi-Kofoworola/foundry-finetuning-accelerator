// ============================================================================
// Role assignment for an Azure Cognitive Services (Content Safety) account
// ============================================================================

@description('Principal id to grant access to.')
param principalId string

@description('Principal type.')
@allowed(['ServicePrincipal', 'User', 'Group'])
param principalType string = 'ServicePrincipal'

@description('Built-in role definition id (GUID).')
param roleDefinitionId string

@description('Name of the Cognitive Services account.')
param accountName string

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: accountName
}

resource ra 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, principalId, roleDefinitionId)
  scope: account
  properties: {
    principalId: principalId
    principalType: principalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleDefinitionId)
  }
}

output roleAssignmentId string = ra.id
