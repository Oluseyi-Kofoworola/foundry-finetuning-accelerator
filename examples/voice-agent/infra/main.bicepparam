using './main.bicep'

// ============================================================================
// Voice Agent - Development Environment Parameters
// ============================================================================

param environment = 'dev'
param location = 'eastus2'
// AI Search out of capacity in eastus2; deploy to eastus instead
param searchLocation = 'eastus'
param baseName = 'voiceagent'
param alertEmailAddresses = ['alerts@example.com']

// Azure OpenAI resource will be created automatically by the deployment
// with GPT-4o Realtime model for voice agent functionality

param tags = {
  Project: 'Voice-Agent'
  Environment: 'dev'
  ManagedBy: 'Bicep'
  Application: 'Voice-Agent'
  Owner: 'Acme Health'
}
