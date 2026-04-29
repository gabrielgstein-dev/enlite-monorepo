.PHONY: dev dev-fresh down reset snap emulator-logs

COMPOSE = docker compose \
	-f worker-functions/docker-compose.yml \
	-f worker-functions/docker-compose.dev.yml \
	-f docker-compose.prod-auth.yml \
	--env-file .env

COMPOSE_EMULATOR = docker compose -f docker-compose.emulator.yml

SEED_FILE = worker-functions/seeds/999_prod_snapshot.sql

# Sobe tudo: banco + backend + frontend com Firebase Auth de produção.
# Se o seed de prod não existir, gera automaticamente antes de subir.
# Após `make reset` ou wipe total do Docker, o seed persiste no disco e
# é reaplicado automaticamente — não é necessário rodar `make snap` novamente.
dev:
	@if [ ! -f "$(SEED_FILE)" ]; then \
		echo ""; \
		echo "📸  Seed de prod não encontrado. Gerando snapshot antes de subir..."; \
		echo ""; \
		$(MAKE) snap; \
	fi
	grep -v 'VITE_FIREBASE_AUTH_EMULATOR' .env > enlite-frontend/.env
	$(COMPOSE) up -d --build --remove-orphans postgres api
	@PIDs=$$(lsof -ti :5173); [ -n "$$PIDs" ] && kill -9 $$PIDs && echo "🔪  Porta 5173 liberada." || true
	@while lsof -ti :5173 >/dev/null 2>&1; do sleep 0.2; done
	cd enlite-frontend && pnpm dev

# Força snapshot fresco de prod + sobe tudo.
# Use quando quiser dados atualizados do banco de produção.
dev-fresh:
	$(MAKE) snap
	$(MAKE) dev

# Logs do Firebase Auth Emulator (container separado).
emulator-logs:
	$(COMPOSE_EMULATOR) logs -f

# Para todos os containers sem apagar volumes (dados preservados).
down:
	$(COMPOSE) down
	@$(COMPOSE_EMULATOR) down 2>/dev/null || true

# Para todos os containers E apaga volumes (banco zerado no próximo make dev).
# O seed file em disco é preservado — make dev vai reaplicar automaticamente.
reset:
	$(COMPOSE) down -v
	@$(COMPOSE_EMULATOR) down -v 2>/dev/null || true

# Gera worker-functions/seeds/999_prod_snapshot.sql a partir do banco de produção.
# Inicia o Cloud SQL Proxy automaticamente se não estiver rodando.
snap:
	@scripts/ensure-cloud-sql-proxy.sh
	set -a && . ./.env && set +a && cd worker-functions && npm run snapshot:seed
