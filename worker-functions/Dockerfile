FROM node:20-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY tsconfig.json ./

# Instalar TODAS as dependências (incluindo devDependencies para build)
RUN npm install

# Copiar código fonte e migrations
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts

# Build TypeScript
RUN npm run build

# Remover devDependencies para imagem de produção
RUN npm prune --production

# Expor porta
EXPOSE 8080

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Comando para iniciar (migrations + server)
CMD ["sh", "-c", "node scripts/run-migrations-docker.js && npm start"]
