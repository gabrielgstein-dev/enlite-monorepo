#!/bin/bash
set -e

echo "🚀 Deploy Worker Functions to Cloud Run"
echo "========================================"
echo "⚠️  Prefira usar 'git push' para acionar o CI/CD automatico."
echo "    Use este script apenas para deploys emergenciais."
echo ""

# Configurações
PROJECT_ID="enlite-prd"
REGION="southamerica-west1"
SERVICE_NAME="worker-functions"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ Erro: Execute este script do diretório worker-functions/"
    exit 1
fi

# Validar que o Dockerfile é do backend (Node.js), não do frontend (nginx)
if grep -q 'nginx' Dockerfile; then
    echo "❌ Erro: Dockerfile contém 'nginx'. Você está no diretório errado!"
    echo "   Este script deve ser executado de worker-functions/, não de enlite-frontend/"
    exit 1
fi

if ! grep -q 'node' Dockerfile; then
    echo "❌ Erro: Dockerfile não contém 'node'. Imagem incorreta para o backend."
    exit 1
fi

echo "✅ Dockerfile validado (Node.js, sem nginx)"
echo ""

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
  --set-secrets "DB_PASSWORD=enlite-ar-db-password:latest,GROQ_API_KEY=groq-api-key:latest" \
  --add-cloudsql-instances enlite-prd:southamerica-west1:enlite-ar-db \
  --memory 1Gi \
  --cpu 2 \
  --timeout 300s \
  --concurrency 80 \
  --max-instances 10 \
  --min-instances 1

echo ""
echo "🔍 Step 4: Verificando health check..."
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format="value(status.url)")
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$SERVICE_URL/health")
if [ "$STATUS" != "200" ]; then
    echo "❌ Health check falhou (status: $STATUS). Verifique os logs!"
    exit 1
fi

echo ""
echo "✅ Deploy completed! Health check OK."
echo ""
echo "🌐 Service URL: ${SERVICE_URL}"
