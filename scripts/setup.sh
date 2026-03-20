#!/bin/bash

echo "🚀 Enlite Health Platform - Setup Script"
echo "=========================================="

echo "📦 Installing dependencies..."
cd "$(dirname "$0")/.."
npm install

echo "📋 Copying environment file..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ .env file created. Please update with your credentials."
else
  echo "⚠️  .env file already exists. Skipping."
fi

echo ""
echo "🐳 Starting Docker containers..."
cd ..
docker-compose up -d

echo ""
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

echo ""
echo "🗄️  Running database migrations..."
cd backend-functions
PGPASSWORD=enlite_password psql -h localhost -U enlite_admin -d enlite_production -f migrations/001_create_workers_schema.sql

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Update backend-functions/.env with your credentials"
echo "2. Run 'npm run dev' in backend-functions/ to start the server"
echo "3. Access n8n at http://localhost:5678 (admin/admin)"
echo "4. PostgreSQL is running on localhost:5432"
