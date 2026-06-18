// ============================================================================
// Role Assignment Module for Azure OpenAI
// ============================================================================

@description('Principal ID to assign the role to')
param principalId string

@description('Principal type')
@allowed(['ServicePrincipal', 'User', 'Group'])
param principalType string = 'ServicePrincipal'

@description('Role definition ID (GUID)')
param roleDefinitionId string

@description('Name of the Azure OpenAI resource')
param azureOpenAIName string

// Built-in role definition IDs
// Cognitive Services OpenAI User: 5e0bd9bd-7b93-4f28-af87-19fc36ad61bd
// Cognitive Services OpenAI Contributor: a001fd3d-188f-4b5d-821b-7da978bf7442

// Reference to existing Azure OpenAI account
resource azureOpenAI 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: azureOpenAIName
}

var roleAssignmentName = guid(azureOpenAI.id, principalId, roleDefinitionId)

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentName
  scope: azureOpenAI
  properties: {
    principalId: principalId
    principalType: principalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleDefinitionId)
  }
}

output roleAssignmentId string = roleAssignment.id
