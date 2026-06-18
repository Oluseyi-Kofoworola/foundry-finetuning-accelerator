# ============================================================================
# Voice Agent - Azure Deployment Script (PowerShell)
# Enterprise Voice Agent (white-label template)
# ============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$Environment = "dev",
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "eastus2",
    
    [Parameter(Mandatory=$false)]
    [string]$SubscriptionId = "<your-subscription-id>",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipInfrastructure,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$BaseName = "voiceagent"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Voice Agent - Azure Deployment" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Location: $Location" -ForegroundColor Yellow
Write-Host "Subscription: $SubscriptionId" -ForegroundColor Yellow
Write-Host ""

# ============================================================================
# Prerequisites Check
# ============================================================================
Write-Host "Checking prerequisites..." -ForegroundColor Cyan

# Check Azure CLI
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI is not installed. Please install it from https://docs.microsoft.com/cli/azure/install-azure-cli"
}

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not installed. Please install Docker Desktop."
}

# Login to Azure if needed
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Logging in to Azure..." -ForegroundColor Yellow
    az login
}

# Set subscription
Write-Host "Setting Azure subscription..." -ForegroundColor Cyan
az account set --subscription $SubscriptionId
if ($LASTEXITCODE -ne 0) { throw "Failed to set subscription" }

# ============================================================================
# Deploy Infrastructure
# ============================================================================
if (-not $SkipInfrastructure) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "Deploying Azure Infrastructure..." -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    
    $infraDir = Join-Path $ProjectRoot "infra"
    
    # Deploy Bicep template
    $deploymentName = "voice-agent-$Environment-$(Get-Date -Format 'yyyyMMddHHmmss')"
    
    Write-Host "Starting deployment: $deploymentName" -ForegroundColor Yellow
    
    $deployResult = az deployment sub create `
        --name $deploymentName `
        --location $Location `
        --template-file "$infraDir/main.bicep" `
        --parameters "$infraDir/main.bicepparam" `
        --query "properties.outputs" `
        -o json | ConvertFrom-Json
    
    if ($LASTEXITCODE -ne 0) { throw "Infrastructure deployment failed" }
    
    $ResourceGroupName = $deployResult.resourceGroupName.value
    $AcrLoginServer = $deployResult.containerRegistryLoginServer.value
    $AcrName = $deployResult.containerRegistryName.value
    $BackendUrl = $deployResult.backendUrl.value
    $FrontendUrl = $deployResult.frontendUrl.value
    
    Write-Host ""
    Write-Host "Infrastructure deployed successfully!" -ForegroundColor Green
    Write-Host "Resource Group: $ResourceGroupName" -ForegroundColor Yellow
    Write-Host "ACR: $AcrLoginServer" -ForegroundColor Yellow
} else {
    # Get existing values
    $ResourceGroupName = "rg-$BaseName-$Environment"
    $AcrName = az acr list --resource-group $ResourceGroupName --query "[0].name" -o tsv
    if (-not $AcrName) { throw "Could not find ACR in resource group $ResourceGroupName" }
    $AcrLoginServer = az acr show --name $AcrName --query "loginServer" -o tsv
    
    Write-Host "Using existing infrastructure in: $ResourceGroupName" -ForegroundColor Yellow
    Write-Host "ACR: $AcrLoginServer" -ForegroundColor Yellow
}

# ============================================================================
# Build and Push Docker Images
# ============================================================================
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "Building and Pushing Docker Images..." -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    
    # Login to ACR
    Write-Host "Logging in to Azure Container Registry..." -ForegroundColor Yellow
    az acr login --name $AcrName
    if ($LASTEXITCODE -ne 0) { throw "ACR login failed" }
    
    # Build and push backend
    Write-Host ""
    Write-Host "Building backend image..." -ForegroundColor Yellow
    $backendDir = Join-Path $ProjectRoot "backend"
    $backendImage = "$AcrLoginServer/$BaseName-backend:latest"
    
    docker build --platform linux/amd64 -t $backendImage $backendDir
    if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }
    
    Write-Host "Pushing backend image..." -ForegroundColor Yellow
    docker push $backendImage
    if ($LASTEXITCODE -ne 0) { throw "Backend push failed" }
    
    # Build and push frontend
    Write-Host ""
    Write-Host "Building frontend image..." -ForegroundColor Yellow
    $frontendDir = Join-Path $ProjectRoot "frontend"
    $frontendImage = "$AcrLoginServer/$BaseName-frontend:latest"
    
    # Get backend URL for frontend build args
    $backendFqdn = az containerapp show `
        --name "ca-$BaseName-backend-$Environment" `
        --resource-group $ResourceGroupName `
        --query "properties.configuration.ingress.fqdn" `
        -o tsv 2>$null
    
    if ($backendFqdn) {
        $wsUrl = "wss://$backendFqdn"
        $apiUrl = "https://$backendFqdn"
    } else {
        $wsUrl = "wss://localhost:3001"
        $apiUrl = "https://localhost:3001"
    }
    
    docker build `
        --platform linux/amd64 `
        -t $frontendImage `
        --build-arg VITE_WS_URL=$wsUrl `
        --build-arg VITE_API_URL=$apiUrl `
        $frontendDir
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
    
    Write-Host "Pushing frontend image..." -ForegroundColor Yellow
    docker push $frontendImage
    if ($LASTEXITCODE -ne 0) { throw "Frontend push failed" }
    
    Write-Host ""
    Write-Host "Docker images built and pushed successfully!" -ForegroundColor Green
}

# ============================================================================
# Update Container Apps
# ============================================================================
if (-not $SkipDeploy) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "Updating Container Apps..." -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    
    # Get ACR credentials
    Write-Host "Getting ACR credentials..." -ForegroundColor Yellow
    if (-not $AcrName) {
        $AcrName = az acr list --resource-group $ResourceGroupName --query "[0].name" -o tsv
    }
    if (-not $AcrLoginServer) {
        $AcrLoginServer = az acr show --name $AcrName --query "loginServer" -o tsv
    }
    $acrUsername = az acr credential show --name $AcrName --query "username" -o tsv
    $acrPassword = az acr credential show --name $AcrName --query "passwords[0].value" -o tsv

    # Update backend
    Write-Host "Updating backend container app..." -ForegroundColor Yellow
    az containerapp registry set `
        --name "ca-$BaseName-backend-$Environment" `
        --resource-group $ResourceGroupName `
        --server $AcrLoginServer `
        --username $acrUsername `
        --password $acrPassword
    if ($LASTEXITCODE -ne 0) { throw "Backend registry config failed" }

    az containerapp update `
        --name "ca-$BaseName-backend-$Environment" `
        --resource-group $ResourceGroupName `
        --image "$AcrLoginServer/$BaseName-backend:latest"
    if ($LASTEXITCODE -ne 0) { throw "Backend update failed" }
    
    # Update frontend
    Write-Host "Updating frontend container app..." -ForegroundColor Yellow
    az containerapp registry set `
        --name "ca-$BaseName-frontend-$Environment" `
        --resource-group $ResourceGroupName `
        --server $AcrLoginServer `
        --username $acrUsername `
        --password $acrPassword
    if ($LASTEXITCODE -ne 0) { throw "Frontend registry config failed" }

    az containerapp update `
        --name "ca-$BaseName-frontend-$Environment" `
        --resource-group $ResourceGroupName `
        --image "$AcrLoginServer/$BaseName-frontend:latest"
    if ($LASTEXITCODE -ne 0) { throw "Frontend update failed" }
    
    Write-Host ""
    Write-Host "Container apps updated successfully!" -ForegroundColor Green
}

# ============================================================================
# Summary
# ============================================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

# Get URLs
$backendFqdn = az containerapp show `
    --name "ca-$BaseName-backend-$Environment" `
    --resource-group $ResourceGroupName `
    --query "properties.configuration.ingress.fqdn" `
    -o tsv

$frontendFqdn = az containerapp show `
    --name "ca-$BaseName-frontend-$Environment" `
    --resource-group $ResourceGroupName `
    --query "properties.configuration.ingress.fqdn" `
    -o tsv

Write-Host "Frontend URL: https://$frontendFqdn" -ForegroundColor Cyan
Write-Host "Backend URL:  https://$backendFqdn" -ForegroundColor Cyan
Write-Host "WebSocket:    wss://$backendFqdn" -ForegroundColor Cyan
Write-Host ""
Write-Host "Azure Portal: https://portal.azure.com/#@/resource/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName" -ForegroundColor Yellow
Write-Host ""
Write-Host "Monitoring alerts are configured to send to: alerts@example.com" -ForegroundColor Yellow
Write-Host ""
