#!/bin/bash
# ============================================================================
# Voice Agent - Azure Deployment Script (Bash)
# Enterprise Voice Agent (white-label template)
# ============================================================================

set -e

# Configuration
ENVIRONMENT="${ENVIRONMENT:-dev}"
LOCATION="${LOCATION:-eastus}"
SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-<your-subscription-id>}"
BASE_NAME="voiceagent"
ALERT_EMAILS='["alerts@example.com"]'

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}============================================================${NC}"
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

print_error() {
    echo -e "${RED}$1${NC}"
}

# ============================================================================
# Parse arguments
# ============================================================================
SKIP_INFRASTRUCTURE=false
SKIP_BUILD=false
SKIP_DEPLOY=false
OPENAI_API_KEY=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --environment|-e)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --location|-l)
            LOCATION="$2"
            shift 2
            ;;
        --subscription|-s)
            SUBSCRIPTION_ID="$2"
            shift 2
            ;;
        --openai-key|-k)
            OPENAI_API_KEY="$2"
            shift 2
            ;;
        --skip-infrastructure)
            SKIP_INFRASTRUCTURE=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-deploy)
            SKIP_DEPLOY=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  -e, --environment     Environment (dev, staging, prod) [default: dev]"
            echo "  -l, --location        Azure region [default: eastus]"
            echo "  -s, --subscription    Azure subscription ID"
            echo "  -k, --openai-key      OpenAI API Key (required)"
            echo "  --skip-infrastructure Skip infrastructure deployment"
            echo "  --skip-build          Skip Docker build"
            echo "  --skip-deploy         Skip container app update"
            echo "  -h, --help            Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$OPENAI_API_KEY" ] && [ "$SKIP_INFRASTRUCTURE" = false ]; then
    print_error "Error: OpenAI API Key is required. Use --openai-key or -k option."
    exit 1
fi

print_header "Voice Agent - Azure Deployment"
echo ""
print_warning "Environment: $ENVIRONMENT"
print_warning "Location: $LOCATION"
print_warning "Subscription: $SUBSCRIPTION_ID"
echo ""

# ============================================================================
# Prerequisites Check
# ============================================================================
echo "Checking prerequisites..."

# Check Azure CLI
if ! command -v az &> /dev/null; then
    print_error "Azure CLI is not installed. Please install it from https://docs.microsoft.com/cli/azure/install-azure-cli"
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker."
    exit 1
fi

# Login to Azure if needed
if ! az account show &> /dev/null; then
    print_warning "Logging in to Azure..."
    az login
fi

# Set subscription
echo "Setting Azure subscription..."
az account set --subscription "$SUBSCRIPTION_ID"

# ============================================================================
# Deploy Infrastructure
# ============================================================================
RESOURCE_GROUP_NAME="rg-$BASE_NAME-$ENVIRONMENT"

if [ "$SKIP_INFRASTRUCTURE" = false ]; then
    print_header "Deploying Azure Infrastructure..."
    
    INFRA_DIR="$PROJECT_ROOT/infra"
    DEPLOYMENT_NAME="voice-agent-$ENVIRONMENT-$(date +%Y%m%d%H%M%S)"
    
    print_warning "Starting deployment: $DEPLOYMENT_NAME"
    
    DEPLOY_RESULT=$(az deployment sub create \
        --name "$DEPLOYMENT_NAME" \
        --location "$LOCATION" \
        --template-file "$INFRA_DIR/main.bicep" \
        --parameters environment="$ENVIRONMENT" \
        --parameters location="$LOCATION" \
        --parameters baseName="$BASE_NAME" \
        --parameters openAiApiKey="$OPENAI_API_KEY" \
        --parameters alertEmailAddresses="$ALERT_EMAILS" \
        --query "properties.outputs" \
        -o json)
    
    ACR_LOGIN_SERVER=$(echo "$DEPLOY_RESULT" | jq -r '.containerRegistryLoginServer.value')
    ACR_NAME=$(echo "$DEPLOY_RESULT" | jq -r '.containerRegistryName.value')
    BACKEND_URL=$(echo "$DEPLOY_RESULT" | jq -r '.backendUrl.value')
    FRONTEND_URL=$(echo "$DEPLOY_RESULT" | jq -r '.frontendUrl.value')
    
    echo ""
    print_success "Infrastructure deployed successfully!"
    print_warning "Resource Group: $RESOURCE_GROUP_NAME"
    print_warning "ACR: $ACR_LOGIN_SERVER"
else
    print_warning "Skipping infrastructure deployment, using existing resources..."
    
    # Get ACR name from resource group
    ACR_NAME=$(az acr list --resource-group "$RESOURCE_GROUP_NAME" --query "[0].name" -o tsv)
    ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query "loginServer" -o tsv)
fi

# ============================================================================
# Build and Push Docker Images
# ============================================================================
if [ "$SKIP_BUILD" = false ]; then
    print_header "Building and Pushing Docker Images..."
    
    # Login to ACR
    print_warning "Logging in to Azure Container Registry..."
    az acr login --name "$ACR_NAME"
    
    # Build and push backend
    echo ""
    print_warning "Building backend image..."
    BACKEND_DIR="$PROJECT_ROOT/backend"
    BACKEND_IMAGE="$ACR_LOGIN_SERVER/$BASE_NAME-backend:latest"
    
    docker build -t "$BACKEND_IMAGE" "$BACKEND_DIR"
    
    print_warning "Pushing backend image..."
    docker push "$BACKEND_IMAGE"
    
    # Build and push frontend
    echo ""
    print_warning "Building frontend image..."
    FRONTEND_DIR="$PROJECT_ROOT/frontend"
    FRONTEND_IMAGE="$ACR_LOGIN_SERVER/$BASE_NAME-frontend:latest"
    
    # Get backend URL for frontend build args
    BACKEND_FQDN=$(az containerapp show \
        --name "ca-$BASE_NAME-backend-$ENVIRONMENT" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --query "properties.configuration.ingress.fqdn" \
        -o tsv 2>/dev/null || echo "")
    
    if [ -n "$BACKEND_FQDN" ]; then
        WS_URL="wss://$BACKEND_FQDN"
        API_URL="https://$BACKEND_FQDN"
    else
        WS_URL="wss://localhost:3001"
        API_URL="https://localhost:3001"
    fi
    
    docker build \
        -t "$FRONTEND_IMAGE" \
        --build-arg VITE_WS_URL="$WS_URL" \
        --build-arg VITE_API_URL="$API_URL" \
        "$FRONTEND_DIR"
    
    print_warning "Pushing frontend image..."
    docker push "$FRONTEND_IMAGE"
    
    echo ""
    print_success "Docker images built and pushed successfully!"
fi

# ============================================================================
# Update Container Apps
# ============================================================================
if [ "$SKIP_DEPLOY" = false ]; then
    print_header "Updating Container Apps..."
    
    # Update backend
    print_warning "Updating backend container app..."
    az containerapp update \
        --name "ca-$BASE_NAME-backend-$ENVIRONMENT" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --image "$ACR_LOGIN_SERVER/$BASE_NAME-backend:latest"
    
    # Update frontend
    print_warning "Updating frontend container app..."
    az containerapp update \
        --name "ca-$BASE_NAME-frontend-$ENVIRONMENT" \
        --resource-group "$RESOURCE_GROUP_NAME" \
        --image "$ACR_LOGIN_SERVER/$BASE_NAME-frontend:latest"
    
    echo ""
    print_success "Container apps updated successfully!"
fi

# ============================================================================
# Summary
# ============================================================================
print_header "DEPLOYMENT COMPLETE!"
echo ""

# Get URLs
BACKEND_FQDN=$(az containerapp show \
    --name "ca-$BASE_NAME-backend-$ENVIRONMENT" \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --query "properties.configuration.ingress.fqdn" \
    -o tsv)

FRONTEND_FQDN=$(az containerapp show \
    --name "ca-$BASE_NAME-frontend-$ENVIRONMENT" \
    --resource-group "$RESOURCE_GROUP_NAME" \
    --query "properties.configuration.ingress.fqdn" \
    -o tsv)

echo -e "${CYAN}Frontend URL: https://$FRONTEND_FQDN${NC}"
echo -e "${CYAN}Backend URL:  https://$BACKEND_FQDN${NC}"
echo -e "${CYAN}WebSocket:    wss://$BACKEND_FQDN${NC}"
echo ""
print_warning "Azure Portal: https://portal.azure.com/#@/resource/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP_NAME"
echo ""
print_warning "Monitoring alerts are configured to send to: alerts@example.com"
echo ""
