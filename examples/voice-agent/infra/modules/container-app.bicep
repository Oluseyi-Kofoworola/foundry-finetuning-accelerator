// ============================================================================
// Container App Module
// ============================================================================

@description('Name of the Container App')
param name string

@description('Location for the resource')
param location string

@description('Resource ID of the Container Apps Environment')
param containerAppsEnvironmentId string

@description('Container Registry Login Server')
param containerRegistryLoginServer string

@description('Container Registry Name')
param containerRegistryName string

@description('Container image name with tag')
param imageName string

@description('Target port for the container')
param targetPort int

@description('Whether this is a backend service (enables WebSocket)')
param isBackend bool = false

@description('Environment variables for the container')
param environmentVariables array = []

@description('Secrets for the container')
param secrets array = []

@description('Tags for the resource')
param tags object = {}

@description('Whether to use a placeholder image (for initial deployment before images are pushed)')
param usePlaceholderImage bool = true

// Get reference to existing container registry
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-06-01-preview' existing = {
  name: containerRegistryName
}

// Use placeholder image if custom image not yet available
var actualImage = usePlaceholderImage ? 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest' : imageName

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: usePlaceholderImage ? 80 : targetPort
        transport: isBackend ? 'http' : 'auto'
        corsPolicy: isBackend ? {
          allowedOrigins: ['*']
          allowedHeaders: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowCredentials: true
          maxAge: 86400
        } : null
        clientCertificateMode: 'ignore'
        stickySessions: {
          affinity: isBackend ? 'sticky' : 'none'
        }
      }
      registries: usePlaceholderImage ? [] : [
        {
          server: containerRegistryLoginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: usePlaceholderImage ? secrets : concat([
        {
          name: 'acr-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
      ], secrets)
    }
    template: {
      containers: [
        {
          image: actualImage
          name: 'main'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: usePlaceholderImage ? [] : environmentVariables
          probes: usePlaceholderImage ? [] : [
            {
              type: 'Liveness'
              httpGet: {
                port: targetPort
                path: isBackend ? '/health' : '/'
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                port: targetPort
                path: isBackend ? '/health' : '/'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [
          {
            name: 'http-requests'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

// Role assignment for ACR pull
resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, containerApp.id, '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: containerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Outputs
output resourceId string = containerApp.id
output name string = containerApp.name
output fqdn string = containerApp.properties.configuration.ingress.fqdn
output latestRevisionName string = containerApp.properties.latestRevisionName
output principalId string = containerApp.identity.principalId
