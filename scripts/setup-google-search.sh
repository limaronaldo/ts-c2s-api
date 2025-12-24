#!/bin/bash
# Setup Google Custom Search API for ts-c2s-api
# Run this script to configure Google Search for lead insights

set -e

PROJECT_ID="ts-c2s-api-search"
SERVICE_NAME="customsearch.googleapis.com"

echo "🔧 Setting up Google Custom Search API..."
echo ""

# Step 1: Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Step 2: Check authentication
echo "📋 Step 1: Checking authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1; then
    echo "Not authenticated. Running gcloud auth login..."
    gcloud auth login
fi

# Step 3: Create or select project
echo ""
echo "📋 Step 2: Setting up project..."
if gcloud projects describe $PROJECT_ID &> /dev/null; then
    echo "Project $PROJECT_ID already exists"
else
    echo "Creating project $PROJECT_ID..."
    gcloud projects create $PROJECT_ID --name="TS C2S API Search"
fi
gcloud config set project $PROJECT_ID

# Step 4: Enable billing (required for Custom Search API)
echo ""
echo "📋 Step 3: Checking billing..."
BILLING_ACCOUNT=$(gcloud billing accounts list --format="value(name)" | head -1)
if [ -n "$BILLING_ACCOUNT" ]; then
    echo "Linking billing account: $BILLING_ACCOUNT"
    gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT 2>/dev/null || echo "Billing already linked or manual linking required"
else
    echo "⚠️  No billing account found. You may need to set up billing manually at:"
    echo "   https://console.cloud.google.com/billing"
fi

# Step 5: Enable Custom Search API
echo ""
echo "📋 Step 4: Enabling Custom Search API..."
gcloud services enable $SERVICE_NAME

# Step 6: Create API Key
echo ""
echo "📋 Step 5: Creating API Key..."
API_KEY=$(gcloud services api-keys create google-search-key \
    --display-name="Google Search API Key for ts-c2s-api" \
    --api-target=service=$SERVICE_NAME \
    --format="value(keyString)" 2>/dev/null || echo "")

if [ -z "$API_KEY" ]; then
    echo "Creating key with alternative method..."
    gcloud services api-keys create google-search-key \
        --display-name="Google Search API Key" 2>/dev/null || true

    # List keys to get the key string
    echo ""
    echo "⚠️  API Key created but couldn't retrieve automatically."
    echo "   Get your key from: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
fi

# Step 7: Create Custom Search Engine
echo ""
echo "📋 Step 6: Creating Custom Search Engine..."
echo ""
echo "⚠️  Custom Search Engine must be created manually:"
echo ""
echo "   1. Go to: https://programmablesearchengine.google.com/controlpanel/create"
echo "   2. Name: 'Lead Insights Search'"
echo "   3. What to search: 'Search the entire web'"
echo "   4. Click 'Create'"
echo "   5. Copy the 'Search engine ID' (cx parameter)"
echo ""

# Step 8: Show results
echo "=============================================="
echo "✅ Setup Complete!"
echo "=============================================="
echo ""
echo "Add these to your .env or Fly.io secrets:"
echo ""
if [ -n "$API_KEY" ]; then
    echo "GOOGLE_API_KEY=$API_KEY"
else
    echo "GOOGLE_API_KEY=<get from Google Cloud Console>"
fi
echo "GOOGLE_CSE_ID=<get from Programmable Search Engine>"
echo ""
echo "Fly.io commands:"
echo "  fly secrets set GOOGLE_API_KEY=your-key"
echo "  fly secrets set GOOGLE_CSE_ID=your-cse-id"
echo ""
echo "Links:"
echo "  API Keys: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo "  CSE: https://programmablesearchengine.google.com/controlpanel/all"
echo ""
