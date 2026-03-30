.PHONY: dev down reset snap emulator-logs

COMPOSE = docker compose \
	-f worker-functions/docker-compose.yml \
	-f worker-functions/docker-compose.dev.yml \
	-f docker-compose.dev-firebase.yml \
	--env-file .env

COMPOSE_EMULATOR = docker compose -f docker-compose.emulator.yml

# Sobe tudo: banco + Firebase Auth Emulator + backend + frontend.
# Auth é transparente — o Firebase Admin SDK detecta o emulador automaticamente.
dev:
	cp .env enlite-frontend/.env
	$(COMPOSE_EMULATOR) up -d
	$(COMPOSE) up -d postgres api
	@lsof -ti :5173 | xargs kill -9 2>/dev/null || true
	cd enlite-frontend && pnpm dev

# Logs do Firebase Auth Emulator (container separado).
emulator-logs:
	$(COMPOSE_EMULATOR) logs -f

# Para todos os containers sem apagar volumes (dados preservados).
down:
	$(COMPOSE) down
	@$(COMPOSE_EMULATOR) down 2>/dev/null || true

# Para todos os containers E apaga volumes (banco zerado no próximo make dev).
reset:
	$(COMPOSE) down -v
	@$(COMPOSE_EMULATOR) down -v 2>/dev/null || true

# Gera seeds/999_prod_snapshot.sql a partir do banco de produção.
# Requer PROD_DATABASE_URL preenchido no .env raiz.
snap:
	set -a && . ./.env && set +a && cd worker-functions && npm run snapshot:seed
