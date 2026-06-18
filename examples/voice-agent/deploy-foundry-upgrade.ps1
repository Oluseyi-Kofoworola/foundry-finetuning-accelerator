# ============================================================================
# Voice Agent - AI Foundry Upgrade Deployment
# Adds multi-agent capabilities to existing infrastructure
# ============================================================================

param(
    [Parameter()]
    [ValidateSet('dev', 'staging', 'prod')]
    [string]$Environment = 'dev',
    
    [Parameter()]
    [string]$Location = 'eastus',
    
    [Parameter()]
    [string]$BaseName = 'voiceagent',
    
    [Parameter()]
    [switch]$SkipAgentSetup
)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "  Voice Agent - AI Foundry Upgrade" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host ""
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Location: $Location" -ForegroundColor Yellow
Write-Host "Base Name: $BaseName" -ForegroundColor Yellow
Write-Host ""

# Variables
$resourceGroup = "rg-$BaseName-$Environment"

# ============================================================================
# Step 1: Verify Existing Resources
# ============================================================================

Write-Host "Step 1: Verifying Existing Resources..." -ForegroundColor Green

$existingRg = az group show --name $resourceGroup --query name -o tsv 2>$null
if (-not $existingRg) {
    Write-Host "  Resource group '$resourceGroup' not found!" -ForegroundColor Red
    Write-Host "  Please deploy the base infrastructure first using main.bicep" -ForegroundColor Red
    exit 1
}
Write-Host "  Resource Group: $resourceGroup" -ForegroundColor Gray

$openAiName = "aoai-$BaseName-$Environment"
$existingOpenAi = az cognitiveservices account show --name $openAiName --resource-group $resourceGroup --query name -o tsv 2>$null
if (-not $existingOpenAi) {
    Write-Host "  Azure OpenAI '$openAiName' not found!" -ForegroundColor Red
    exit 1
}
Write-Host "  Azure OpenAI: $openAiName" -ForegroundColor Gray

$appInsightsName = "appi-$BaseName-$Environment"
$existingAppInsights = az monitor app-insights component show --app $appInsightsName --resource-group $resourceGroup --query name -o tsv 2>$null
if (-not $existingAppInsights) {
    Write-Host "  App Insights '$appInsightsName' not found!" -ForegroundColor Red
    exit 1
}
Write-Host "  App Insights: $appInsightsName" -ForegroundColor Gray

Write-Host ""

# ============================================================================
# Step 2: Deploy AI Foundry Infrastructure (Bicep)
# ============================================================================

Write-Host "Step 2: Deploying AI Foundry Infrastructure..." -ForegroundColor Green

$deploymentOutput = az deployment group create `
    --resource-group $resourceGroup `
    --template-file "./infra/upgrade-to-foundry.bicep" `
    --parameters environment=$Environment location=$Location baseName=$BaseName `
    --query "properties.outputs" `
    --output json 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "  Bicep deployment failed!" -ForegroundColor Red
    Write-Host $deploymentOutput -ForegroundColor Red
    exit 1
}

$outputs = $deploymentOutput | ConvertFrom-Json

$aiHubName = $outputs.aiHubName.value
$aiProjectName = $outputs.aiProjectName.value
$projectConnectionString = $outputs.projectConnectionString.value

Write-Host "  AI Hub: $aiHubName" -ForegroundColor Gray
Write-Host "  AI Project: $aiProjectName" -ForegroundColor Gray
Write-Host "  Connection String: $projectConnectionString" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# Step 3: Create AI Agents (SDK)
# ============================================================================

if (-not $SkipAgentSetup) {
    Write-Host "Step 3: Creating AI Agents..." -ForegroundColor Green
    
    # Set environment variable for the script
    $env:AI_PROJECT_CONNECTION_STRING = $projectConnectionString
    
    # Check if ts-node is available
    $tsNodeAvailable = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $tsNodeAvailable) {
        Write-Host "  npx not found. Please install Node.js" -ForegroundColor Yellow
        Write-Host "  Skipping agent setup. Run manually later:" -ForegroundColor Yellow
        Write-Host "  `$env:AI_PROJECT_CONNECTION_STRING = '$projectConnectionString'" -ForegroundColor Gray
        Write-Host "  npx ts-node ./scripts/setup-foundry-agents.ts" -ForegroundColor Gray
    } else {
        # Install dependencies if needed
        if (-not (Test-Path "./node_modules/@azure/identity")) {
            Write-Host "  Installing @azure/identity..." -ForegroundColor Gray
            npm install @azure/identity --save-dev 2>$null
        }
        
        # Run agent setup script
        npx ts-node ./scripts/setup-foundry-agents.ts
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Agent setup had issues. You may need to create agents manually in AI Foundry Portal." -ForegroundColor Yellow
        }
    }
    Write-Host ""
} else {
    Write-Host "Step 3: Skipping Agent Setup (use -SkipAgentSetup was specified)" -ForegroundColor Yellow
    Write-Host "  To create agents later, run:" -ForegroundColor Gray
    Write-Host "  `$env:AI_PROJECT_CONNECTION_STRING = '$projectConnectionString'" -ForegroundColor Gray
    Write-Host "  npx ts-node ./scripts/setup-foundry-agents.ts" -ForegroundColor Gray
    Write-Host ""
}

# ============================================================================
# Step 4: Update Backend Configuration
# ============================================================================

Write-Host "Step 4: Updating Backend Configuration..." -ForegroundColor Green

$backendEnvPath = "./backend/.env"
$foundryEnvPath = "./backend/.env.foundry"

if (Test-Path $foundryEnvPath) {
    Write-Host "  Found .env.foundry" -ForegroundColor Gray
    
    if (Test-Path $backendEnvPath) {
        # Check if already has foundry config
        $existingEnv = Get-Content $backendEnvPath -Raw -ErrorAction SilentlyContinue
        if ($existingEnv -and $existingEnv -notmatch "AI_PROJECT_CONNECTION_STRING") {
            Add-Content -Path $backendEnvPath -Value ""
            Add-Content -Path $backendEnvPath -Value "# AI Foundry Configuration (added by upgrade script)"
            Get-Content $foundryEnvPath | Add-Content -Path $backendEnvPath
            Write-Host "  Merged .env.foundry into .env" -ForegroundColor Gray
        } else {
            Write-Host "  .env already has Foundry config or doesn't exist, see .env.foundry" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  backend/.env not found. Copy values from .env.foundry manually" -ForegroundColor Yellow
    }
} else {
    # Create minimal .env.foundry
    $envContent = @"
# ============================================================================
# Azure AI Foundry Configuration
# Generated: $(Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
# ============================================================================

# AI Project Connection
AI_PROJECT_CONNECTION_STRING=$projectConnectionString

# Feature Flag - Enable multi-agent mode
USE_FOUNDRY_AGENTS=true
"@
    $envContent | Out-File -FilePath $foundryEnvPath -Encoding utf8
    Write-Host "  Created .env.foundry" -ForegroundColor Gray
}
Write-Host ""

# ============================================================================
# Summary
# ============================================================================

Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "  AI FOUNDRY UPGRADE COMPLETE!" -ForegroundColor Green
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host ""
Write-Host "Resources Added:" -ForegroundColor Yellow
Write-Host "  * AI Hub: $aiHubName"
Write-Host "  * AI Project: $aiProjectName"
Write-Host "  * Key Vault: (created for AI Hub)"
Write-Host "  * Storage Account: (created for AI Hub)"
Write-Host "  * GPT-4o Model Deployment"
Write-Host "  * 4 AI Agents (if setup completed)"
Write-Host ""
Write-Host "Existing Resources (Unchanged):" -ForegroundColor Yellow
Write-Host "  * Azure OpenAI: $openAiName"
Write-Host "  * App Insights: $appInsightsName"
Write-Host "  * Container Apps (backend + frontend)"
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Connection String: $projectConnectionString"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Review backend/.env.foundry"
Write-Host "  2. Test agents in Azure AI Foundry Portal:"
Write-Host "     https://ai.azure.com"
Write-Host "  3. (Optional) Update backend to use FoundryAgentService"
Write-Host "  4. (Optional) Rebuild and deploy backend container"
Write-Host ""
Write-Host "Portal Links:" -ForegroundColor Cyan
Write-Host "  * AI Foundry: https://ai.azure.com"
Write-Host "  * Azure Portal: https://portal.azure.com/#resource/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$resourceGroup"
Write-Host ""
