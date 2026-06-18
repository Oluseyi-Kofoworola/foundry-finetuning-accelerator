// ============================================================================
// Monitoring Alerts Module
// Uses Application Insights metrics for monitoring
// Only CRITICAL alerts (severity 0-1) send notifications
// ============================================================================

@description('Base name for resources')
param baseName string

@description('Environment name')
param environment string

@description('Action Group Resource ID for notifications')
param actionGroupId string

@description('Application Insights Resource ID')
param appInsightsResourceId string

@description('Tags for resources')
param tags object = {}

// ============================================================================
// Server Error Rate Alert (5xx errors) - CRITICAL - sends notifications
// ============================================================================
resource serverErrorAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${baseName}-server-errors-${environment}'
  location: 'global'
  tags: tags
  properties: {
    description: 'CRITICAL: Alert when server error rate exceeds 5 per 5 minutes'
    severity: 0  // Critical
    enabled: true
    scopes: [appInsightsResourceId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'ServerErrors'
          metricName: 'requests/failed'
          metricNamespace: 'microsoft.insights/components'
          operator: 'GreaterThan'
          threshold: 10  // Increased threshold to reduce noise
          timeAggregation: 'Count'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroupId
        webHookProperties: {}
      }
    ]
    autoMitigate: true
  }
}

// ============================================================================
// High Response Time Alert - WARNING only (no notifications)
// ============================================================================
resource responseTimeAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${baseName}-response-time-${environment}'
  location: 'global'
  tags: tags
  properties: {
    description: 'Warning: Average response time exceeds 3 seconds (no email notifications)'
    severity: 3  // Warning - no email notifications
    enabled: true
    scopes: [appInsightsResourceId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'ResponseTime'
          metricName: 'requests/duration'
          metricNamespace: 'microsoft.insights/components'
          operator: 'GreaterThan'
          threshold: 5000  // Increased to 5 seconds
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    // No actions - warning only, logged in Azure Monitor
    actions: []
    autoMitigate: true
  }
}

// ============================================================================
// Exception Rate Alert
// ============================================================================
// ============================================================================
// Exception Rate Alert - WARNING only (no notifications)
// ============================================================================
resource exceptionAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${baseName}-exceptions-${environment}'
  location: 'global'
  tags: tags
  properties: {
    description: 'Warning: Exception rate exceeds 20 per 5 minutes (no email notifications)'
    severity: 3  // Warning - no email notifications
    enabled: true
    scopes: [appInsightsResourceId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'Exceptions'
          metricName: 'exceptions/count'
          metricNamespace: 'microsoft.insights/components'
          operator: 'GreaterThan'
          threshold: 20  // Increased threshold
          timeAggregation: 'Count'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    // No actions - warning only, logged in Azure Monitor
    actions: []
    autoMitigate: true
  }
}

// Outputs
output serverErrorAlertId string = serverErrorAlert.id
output responseTimeAlertId string = responseTimeAlert.id
output exceptionAlertId string = exceptionAlert.id
