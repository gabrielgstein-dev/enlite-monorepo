.PHONY: dev down reset snap

COMPOSE = docker compose \
	-f worker-functions/docker-compose.yml \
	-f worker-functions/docker-compose.dev.yml \
	--env-file .env

# Distribui as variáveis do .env raiz para o frontend antes de subir.
# Sobe banco + backend (com migrations e seeds) em background, depois inicia o frontend.
dev:
	cp .env enlite-frontend/.env
	$(COMPOSE) up -d postgres api
	@lsof -ti :5173 | xargs kill -9 2>/dev/null || true
	cd enlite-frontend && pnpm dev

# Para os containers sem apagar o volume (dados preservados).
down:
	$(COMPOSE) down

# Para os containers E apaga o volume (banco zerado no próximo make dev).
reset:
	$(COMPOSE) down -v

# Gera seeds/999_prod_snapshot.sql a partir do banco de produção.
# Requer PROD_DATABASE_URL preenchido no .env raiz.
snap:
	set -a && . ./.env && set +a && cd worker-functions && npm run snapshot:seed
