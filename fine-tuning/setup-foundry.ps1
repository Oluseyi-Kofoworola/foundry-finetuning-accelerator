# ============================================================================
# setup-foundry.ps1 — Prepare a Microsoft Foundry resource for the labs
# ----------------------------------------------------------------------------
# Idempotent. Safe to re-run. Verifies (and creates if missing):
#   1. az login + correct subscription
#   2. Foundry AI Services account (kind: AIServices)         [must already exist]
#   3. gpt-4o-mini deployment on that account                 [creates if missing]
#   4. Role assignment: Cognitive Services OpenAI Contributor [grants to current user]
#   5. fine-tuning/.env file matches the Foundry resource     [rewrites if needed]
#
# Usage:
#   .\setup-foundry.ps1 `
#       -SubscriptionId "<your-subscription-id>" `
#       -ResourceGroup  "rg-acme-dev" `
#       -FoundryAccount "aif-acme-dev" `
#       -TenantId       "<your-tenant-id>" `
#       -ProjectName    "agents"
# ============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $SubscriptionId,

    [Parameter(Mandatory)]
    [string] $ResourceGroup,

    [Parameter(Mandatory)]
    [string] $FoundryAccount,

    [Parameter(Mandatory)]
    [string] $TenantId,

    [string] $ProjectName = 'agents',
    [string] $DeploymentName = 'gpt-4o-mini',
    [string] $ModelName = 'gpt-4o-mini',
    [string] $ModelVersion = '2024-07-18',
    [string] $SkuName = 'GlobalStandard',
    [int]    $SkuCapacity = 50
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK]   $msg"  -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "[WARN] $msg"  -ForegroundColor Yellow }
function Write-Err2($msg) { Write-Host "[ERR]  $msg"  -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 1. az login + subscription
# ---------------------------------------------------------------------------
Write-Step "1) Azure CLI login + subscription"
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Warn2 "az login required."
    az login --tenant $TenantId | Out-Null
}
az account set --subscription $SubscriptionId | Out-Null
$account = az account show | ConvertFrom-Json
Write-Ok "Subscription: $($account.name) ($($account.id))"
Write-Ok "User:         $($account.user.name)"

# ---------------------------------------------------------------------------
# 2. Verify Foundry AI Services account
# ---------------------------------------------------------------------------
Write-Step "2) Verifying Foundry AI Services account"
$aif = az cognitiveservices account show -n $FoundryAccount -g $ResourceGroup 2>$null | ConvertFrom-Json
if (-not $aif) {
    Write-Err2 "AI Services account '$FoundryAccount' not found in '$ResourceGroup'."
    Write-Err2 "Create one via 'infra/main.bicep' or the Foundry portal first."
    exit 1
}
if ($aif.kind -ne 'AIServices') {
    Write-Warn2 "Account kind is '$($aif.kind)' (expected 'AIServices'). Continuing — fine-tuning still works on legacy 'OpenAI' kind."
}
$endpoint = $aif.properties.endpoint
Write-Ok "Account:  $($aif.name) ($($aif.kind), $($aif.sku.name))"
Write-Ok "Endpoint: $endpoint"

# ---------------------------------------------------------------------------
# 3. Ensure gpt-4o-mini deployment exists
# ---------------------------------------------------------------------------
Write-Step "3) Ensuring '$DeploymentName' deployment ($ModelName v$ModelVersion)"
$existing = az cognitiveservices account deployment show `
    -n $FoundryAccount -g $ResourceGroup --deployment-name $DeploymentName 2>$null | ConvertFrom-Json

if ($existing) {
    Write-Ok "Deployment already exists: model=$($existing.properties.model.name) v$($existing.properties.model.version), sku=$($existing.sku.name), cap=$($existing.sku.capacity)"
} else {
    Write-Host "Creating deployment..."
    az cognitiveservices account deployment create `
        --resource-group $ResourceGroup `
        --name $FoundryAccount `
        --deployment-name $DeploymentName `
        --model-name $ModelName `
        --model-version $ModelVersion `
        --model-format OpenAI `
        --sku-name $SkuName `
        --sku-capacity $SkuCapacity -o none
    if ($LASTEXITCODE -ne 0) { Write-Err2 "Deployment create failed."; exit 1 }
    Write-Ok "Created deployment '$DeploymentName' ($SkuName, capacity $SkuCapacity)"
}

# ---------------------------------------------------------------------------
# 4. RBAC: Cognitive Services OpenAI Contributor on the resource
# ---------------------------------------------------------------------------
Write-Step "4) Granting 'Cognitive Services OpenAI Contributor' to current user"
$userObjId = az ad signed-in-user show --query id -o tsv
$aifId = $aif.id
$existingRole = az role assignment list `
    --assignee-object-id $userObjId `
    --assignee-principal-type User `
    --scope $aifId `
    --role "Cognitive Services OpenAI Contributor" `
    --query "[].id" -o tsv

if ($existingRole) {
    Write-Ok "Role already assigned to $userObjId on $($aif.name)."
} else {
    az role assignment create `
        --assignee-object-id $userObjId `
        --assignee-principal-type User `
        --role "Cognitive Services OpenAI Contributor" `
        --scope $aifId -o none
    if ($LASTEXITCODE -ne 0) {
        Write-Warn2 "Role assignment may have failed; you may already have an equivalent role. Continuing."
    } else {
        Write-Ok "Granted 'Cognitive Services OpenAI Contributor' to $userObjId."
    }
}

# ---------------------------------------------------------------------------
# 5. Sync fine-tuning/.env
# ---------------------------------------------------------------------------
Write-Step "5) Writing fine-tuning/.env"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $scriptDir '.env'

$content = @"
# Microsoft Foundry resource (kind: AIServices) - host for fine-tuning
AZURE_OPENAI_ENDPOINT=$endpoint
AZURE_OPENAI_API_VERSION=2025-04-01-preview

BASE_MODEL=$ModelName-$ModelVersion
BASE_DEPLOYMENT=$DeploymentName
GENERATOR_DEPLOYMENT=$DeploymentName

AZURE_SUBSCRIPTION_ID=$SubscriptionId
AZURE_RESOURCE_GROUP=$ResourceGroup
AZURE_RESOURCE_NAME=$FoundryAccount
AZURE_TENANT_ID=$TenantId

# Foundry project under the AI Services account (visible in Foundry portal)
AZURE_FOUNDRY_PROJECT=$ProjectName
"@
Set-Content -Path $envPath -Value $content -Encoding UTF8
Write-Ok ".env written: $envPath"

# ---------------------------------------------------------------------------
# 6. Done
# ---------------------------------------------------------------------------
Write-Step "Setup complete"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Activate venv:    .\.venv\Scripts\Activate.ps1"
Write-Host "  2. Run preflight:    python fine-tuning\preflight.py"
Write-Host "  3. Open Lab 00:      fine-tuning\00_synthetic_data_generation.ipynb"
Write-Host ""
