# n8n Production Dockerfile com Puppeteer para Google Cloud Run
FROM node:18-slim

# Evitar prompts interativos
ENV DEBIAN_FRONTEND=noninteractive

# Instalar dependências do Chrome/Chromium + curl para healthcheck
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libfreetype6 \
    libharfbuzz0b \
    ca-certificates \
    fonts-freefont-ttf \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Configurar Puppeteer para usar o Chrome do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Instalar n8n globalmente (versão específica compatível)
RUN npm install -g n8n@1.80.0

# Instalar Puppeteer globalmente
RUN npm install -g puppeteer

# Permitir uso de puppeteer no nó de código do n8n
ENV NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer

# Criar diretório para dados com permissões corretas
RUN mkdir -p /home/node/.n8n && chown -R node:node /home/node/.n8n /usr/local/lib/node_modules/n8n

USER node

# Configurações n8n
ENV N8N_PORT=5678
ENV N8N_PROTOCOL=https
ENV N8N_HOST=0.0.0.0
ENV N8N_USER_FOLDER=/home/node/.n8n

WORKDIR /home/node

# Limpar dados persistentes para garantir setup limpo
RUN rm -rf /home/node/.n8n/* 2>/dev/null || true

EXPOSE 5678

CMD ["n8n", "start"]
