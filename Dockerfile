# Dockerfile para o enlite-frontend
# Usa Node.js 20 com Alpine para imagem leve

FROM node:20-alpine

# Instala pnpm globalmente
RUN npm install -g pnpm@8.15.5

WORKDIR /app

# Copiar arquivos de configuração primeiro (melhor cache)
COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts tailwind.config.js postcss.config.js ./

# Instalar dependências
RUN pnpm install --frozen-lockfile

# Copiar código fonte
COPY index.html tailwind.css ./
COPY src ./src
COPY public ./public

# Build da aplicação
RUN pnpm build

# Expor porta do Vite preview
EXPOSE 4173

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4173 || exit 1

# Comando para iniciar em modo preview
CMD ["pnpm", "preview", "--host", "--port", "4173"]
