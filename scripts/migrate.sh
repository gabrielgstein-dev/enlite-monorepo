#!/bin/bash

echo "🗄️  Running database migrations..."

PGPASSWORD=enlite_password psql -h localhost -U enlite_admin -d enlite_production -f migrations/001_create_workers_schema.sql

echo "✅ Migrations complete!"
