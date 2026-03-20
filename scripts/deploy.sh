#!/bin/bash
set -e

echo "🚀 Deploy Worker Functions to Cloud Run"
echo "========================================"

# Configurações
PROJECT_ID="enlite-prd"
REGION="southamerica-west1"
SERVICE_NAME="worker-functions"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ Erro: Execute este script do diretório backend-functions/"
    exit 1
fi

echo "📦 Step 1: Build TypeScript..."
npm run build

echo ""
echo "🐳 Step 2: Build Docker image..."
gcloud builds submit --tag ${IMAGE_NAME}:latest .

echo ""
echo "☁️  Step 3: Deploy to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --service-account enlite-functions-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID}" \
  --set-env-vars "DB_HOST=/cloudsql/enlite-prd:southamerica-west1:enlite-ar-db" \
  --set-env-vars "DB_NAME=enlite_ar" \
  --set-env-vars "DB_USER=enlite_app" \
  --set-secrets "DB_PASSWORD=enlite-ar-db-password:latest" \
  --add-cloudsql-instances enlite-prd:southamerica-west1:enlite-ar-db \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 100 \
  --max-instances 10 \
  --min-instances 1

echo ""
echo "✅ Deploy completed!"
echo ""
echo "🌐 Service URL:"
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format="value(status.url)"
