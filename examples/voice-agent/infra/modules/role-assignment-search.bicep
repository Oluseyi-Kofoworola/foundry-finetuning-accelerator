// ============================================================================
// Role assignment for an Azure AI Search service
// ============================================================================

@description('Principal id to grant access to (Container App system-assigned identity).')
param principalId string

@description('Principal type.')
@allowed(['ServicePrincipal', 'User', 'Group'])
param principalType string = 'ServicePrincipal'

@description('Built-in role definition id (GUID).')
param roleDefinitionId string

@description('Name of the Search service.')
param searchServiceName string

resource search 'Microsoft.Search/searchServices@2024-03-01-preview' existing = {
  name: searchServiceName
}

resource ra 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, principalId, roleDefinitionId)
  scope: search
  properties: {
    principalId: principalId
    principalType: principalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleDefinitionId)
  }
}

output roleAssignmentId string = ra.id
