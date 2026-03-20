Fase 1 — Setup do GCP
1.1 Criar o projeto

Acesse console.cloud.google.com
Clique em "New Project"
Nome: enlite-production
Anote o PROJECT_ID gerado

1.2 Ativar billing

Menu → Billing → Link a billing account ao projeto

1.3 Ativar as APIs necessárias
Execute no Cloud Shell ou terminal com gcloud instalado:
bashgcloud config set project enlite-production

gcloud services enable \
  identitytoolkit.googleapis.com \
  sqladmin.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  cloudresourcemanager.googleapis.com
1.4 Criar Service Account para as Cloud Functions
bashgcloud iam service-accounts create enlite-functions-sa \
  --display-name="Enlite Functions Service Account"

# Permissões necessárias
gcloud projects add-iam-policy-binding enlite-production \
  --member="serviceAccount:enlite-functions-sa@enlite-production.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding enlite-production \
  --member="serviceAccount:enlite-functions-sa@enlite-production.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding enlite-production \
  --member="serviceAccount:enlite-functions-sa@enlite-production.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

Fase 2 — Cloud Identity Platform
2.1 Ativar o Identity Platform

Console → Identity Platform → Enable
Isso é diferente do Firebase Auth — é o produto GCP com BAA disponível

2.2 Configurar provedores de autenticação

No painel do Identity Platform → Add Provider
Adicione: Email/Password (ativo)
Adicione: Google (OAuth — clique em Configure, adicione o OAuth Client ID do Google Cloud Console → APIs & Services → Credentials)

2.3 Configurar OTP por e-mail

O Identity Platform envia e-mail de verificação nativamente
Em Settings → Email templates → customize o template com a marca Enlite
O OTP de 4 dígitos das suas telas é o link de verificação por e-mail — você pode configurar como código numérico via API ou usar o link padrão

2.4 Anotar as credenciais

No Identity Platform → Settings → Web API Key → copie
Em Authentication → Settings → Authorized domains → adicione o domínio do WeWeb futuro

2.5 Aceitar o BAA (obrigatório para HIPAA)

Console → IAM & Admin → Legal and Compliance → Selecionar os serviços e aceitar o BAA


Fase 3 — Cloud SQL PostgreSQL
3.1 Criar a instância
bashgcloud sql instances create enlite-ar-db \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region=southamerica-west1 \
  --storage-type=SSD \
  --storage-size=20GB \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --require-ssl \
  --no-assign-ip \
  --enable-google-private-path

db-g1-small para começar (~$25/mês). Escale para db-custom-2-4096 quando tiver usuários reais.

3.2 Criar o banco e o usuário da aplicação
bash# Criar o banco
gcloud sql databases create enlite_ar \
  --instance=enlite-ar-db

# Criar usuário (não use o postgres padrão em produção)
gcloud sql users create enlite_app \
  --instance=enlite-ar-db \
  --password=$(openssl rand -base64 32)
3.3 Salvar a senha no Secret Manager
bash# Primeiro salve a senha gerada
echo -n "SUA_SENHA_AQUI" | \
  gcloud secrets create enlite-ar-db-password \
    --data-file=- \
    --replication-policy=user-managed \
    --locations=southamerica-west1
3.4 Rodar o schema
Conecte via Cloud SQL Auth Proxy localmente:
bash# Instalar o proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy

# Rodar o proxy
./cloud-sql-proxy enlite-production:southamerica-west1:enlite-ar-db --port=5432
Em outro terminal, conecte e rode o SQL:
bashpsql "host=127.0.0.1 port=5432 dbname=enlite_ar user=enlite_app"
sql-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabela principal de workers
CREATE TABLE workers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_uid          VARCHAR(128) UNIQUE NOT NULL,
  email                 VARCHAR(255) UNIQUE NOT NULL,
  first_name            VARCHAR(80),
  last_name             VARCHAR(80),
  sex                   VARCHAR(20),
  gender                VARCHAR(20),
  birth_date            DATE,
  document_type         VARCHAR(10),
  document_number       VARCHAR(30),
  phone                 VARCHAR(20),
  profile_photo_url     TEXT,
  languages             TEXT[] DEFAULT '{}',
  profession            VARCHAR(50),
  knowledge_level       VARCHAR(30),
  title_certificate     VARCHAR(80),
  experience_types      TEXT[] DEFAULT '{}',
  years_experience      VARCHAR(20),
  preferred_types       TEXT[] DEFAULT '{}',
  preferred_age_range   VARCHAR(30),
  registration_step     SMALLINT DEFAULT 1,
  terms_accepted_at     TIMESTAMPTZ,
  privacy_accepted_at   TIMESTAMPTZ,
  status                VARCHAR(20) DEFAULT 'pending',
  country               CHAR(2) DEFAULT 'AR',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Endereço e raio de atendimento
CREATE TABLE worker_service_areas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id           UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  address             TEXT,
  address_complement  TEXT,
  service_radius_km   INTEGER DEFAULT 10,
  lat                 DECIMAL(10, 8),
  lng                 DECIMAL(11, 8),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Disponibilidade por dia da semana
CREATE TABLE worker_availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  UNIQUE (worker_id, day_of_week, start_time)
);

-- Respostas do quiz (tela Vídeo e perguntas)
CREATE TABLE worker_quiz_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  section_id  VARCHAR(50) NOT NULL,
  question_id VARCHAR(50) NOT NULL,
  answer_id   VARCHAR(50) NOT NULL,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (worker_id, question_id)
);

-- Worker index (Control Plane — para listagem global futura)
CREATE TABLE worker_index (
  id         UUID PRIMARY KEY,
  country    CHAR(2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  status     VARCHAR(20) NOT NULL,
  step       SMALLINT NOT NULL
);

-- Índices
CREATE INDEX idx_workers_email ON workers(email);
CREATE INDEX idx_workers_identity_uid ON workers(identity_uid);
CREATE INDEX idx_workers_created_at ON workers(created_at DESC);
CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_worker_index_created ON worker_index(created_at DESC);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workers_updated_at
  BEFORE UPDATE ON workers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

# Fase 4 — Cloud Functions

**4.1 Estrutura do projeto**

Crie localmente:
```
enlite-functions/
├── package.json
├── tsconfig.json
├── .env.example
└── src/
    ├── index.ts              ← entry point
    ├── middleware/
    │   └── auth.ts           ← valida JWT do Identity Platform
    ├── db/
    │   └── client.ts         ← conexão Cloud SQL com pool por região
    ├── routes/
    │   ├── auth.ts           ← /api/auth/*
    │   └── workers.ts        ← /api/workers/*
    └── types/
        └── index.ts
4.2 package.json
json{
  "name": "enlite-functions",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts"
  },
  "dependencies": {
    "@google-cloud/functions-framework": "^3.4.0",
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "firebase-admin": "^12.0.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/pg": "^8.11.1",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "ts-node": "^10.9.2"
  }
}
4.3 src/db/client.ts
typescriptimport { Pool } from 'pg'

// Mapa de regiões — adicione BR aqui quando for expandir
const DB_CONFIG: Record<string, string> = {
  AR: process.env.DB_CONN_AR!,
  // BR: process.env.DB_CONN_BR!,
}

const pools: Record<string, Pool> = {}

export function getPool(country: string): Pool {
  if (!DB_CONFIG[country]) {
    throw new Error(`No database configured for country: ${country}`)
  }
  if (!pools[country]) {
    pools[country] = new Pool({
      connectionString: DB_CONFIG[country],
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    })
  }
  return pools[country]
}

export function getActiveCountries(): string[] {
  return Object.keys(DB_CONFIG)
}
4.4 src/middleware/auth.ts
typescriptimport { Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'

if (!admin.apps.length) {
  admin.initializeApp()
}

export async function requireAuth(
  req: Request, res: Response, next: NextFunction
) {
  const token = req.headers.authorization?.split('Bearer ')[1]
  if (!token) return res.status(401).json({ error: 'No token provided' })

  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.user = { uid: decoded.uid, email: decoded.email! }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: { uid: string; email: string }
    }
  }
}
4.5 src/routes/workers.ts
typescriptimport { Router, Request, Response } from 'express'
import { getPool, getActiveCountries } from '../db/client'
import { requireAuth } from '../middleware/auth'

const router = Router()

// POST /api/workers/init
// Cria o registro inicial do worker após verificação de e-mail
router.post('/init', requireAuth, async (req: Request, res: Response) => {
  const { uid, email } = req.user!
  const country = 'AR' // detectar por tenant futuramente

  try {
    const pool = getPool(country)
    const { rows } = await pool.query(
      `INSERT INTO workers (identity_uid, email, country, registration_step)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (identity_uid) DO UPDATE SET updated_at = NOW()
       RETURNING id, registration_step`,
      [uid, email, country]
    )
    
    // Sync no worker_index (mesmo banco por enquanto)
    await pool.query(
      `INSERT INTO worker_index (id, country, created_at, status, step)
       VALUES ($1, $2, NOW(), 'pending', 1)
       ON CONFLICT (id) DO NOTHING`,
      [rows[0].id, country]
    )

    res.json({ workerId: rows[0].id, step: rows[0].registration_step })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/workers/step
// Salva o progresso de cada etapa do wizard
router.put('/step', requireAuth, async (req: Request, res: Response) => {
  const { uid } = req.user!
  const { step, data } = req.body
  const country = 'AR'

  const pool = getPool(country)

  try {
    // Busca o worker pelo uid
    const workerResult = await pool.query(
      'SELECT id FROM workers WHERE identity_uid = $1',
      [uid]
    )
    if (!workerResult.rows.length) {
      return res.status(404).json({ error: 'Worker not found' })
    }
    const workerId = workerResult.rows[0].id

    // Salva conforme o step
    if (step === 1) {
      // Quiz — salva respostas
      const { responses } = data
      for (const r of responses) {
        await pool.query(
          `INSERT INTO worker_quiz_responses
             (worker_id, section_id, question_id, answer_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (worker_id, question_id)
           DO UPDATE SET answer_id = $4`,
          [workerId, r.sectionId, r.questionId, r.answerId]
        )
      }
    } else if (step === 2) {
      // Informações gerais
      const { firstName, lastName, sex, gender, birthDate,
              documentType, documentNumber, phone, profession,
              knowledgeLevel, titleCertificate, experienceTypes,
              yearsExperience, preferredTypes, preferredAgeRange,
              languages, termsAccepted, privacyAccepted } = data
      await pool.query(
        `UPDATE workers SET
           first_name = $2, last_name = $3, sex = $4, gender = $5,
           birth_date = $6, document_type = $7, document_number = $8,
           phone = $9, profession = $10, knowledge_level = $11,
           title_certificate = $12, experience_types = $13,
           years_experience = $14, preferred_types = $15,
           preferred_age_range = $16, languages = $17,
           terms_accepted_at = CASE WHEN $18 THEN NOW() ELSE NULL END,
           privacy_accepted_at = CASE WHEN $19 THEN NOW() ELSE NULL END,
           registration_step = 3
         WHERE id = $1`,
        [workerId, firstName, lastName, sex, gender, birthDate,
         documentType, documentNumber, phone, profession,
         knowledgeLevel, titleCertificate, experienceTypes,
         yearsExperience, preferredTypes, preferredAgeRange,
         languages, termsAccepted, privacyAccepted]
      )
    } else if (step === 3) {
      // Endereço e raio
      const { address, addressComplement, serviceRadiusKm, lat, lng } = data
      await pool.query(
        `INSERT INTO worker_service_areas
           (worker_id, address, address_complement, service_radius_km, lat, lng)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (worker_id) DO UPDATE
           SET address = $2, address_complement = $3,
               service_radius_km = $4, lat = $5, lng = $6`,
        [workerId, address, addressComplement, serviceRadiusKm, lat, lng]
      )
      await pool.query(
        'UPDATE workers SET registration_step = 4 WHERE id = $1', [workerId]
      )
    } else if (step === 4) {
      // Horários e disponibilidade
      const { availability } = data
      await pool.query(
        'DELETE FROM worker_availability WHERE worker_id = $1', [workerId]
      )
      for (const slot of availability) {
        await pool.query(
          `INSERT INTO worker_availability
             (worker_id, day_of_week, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [workerId, slot.dayOfWeek, slot.startTime, slot.endTime]
        )
      }
      await pool.query(
        `UPDATE workers SET registration_step = 5, status = 'review'
         WHERE id = $1`, [workerId]
      )
      // Atualiza o index
      await pool.query(
        `UPDATE worker_index SET status = 'review', step = 5
         WHERE id = $1`, [workerId]
      )
    }

    res.json({ success: true, step: step + 1 })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/workers/me
// Retorna dados do worker logado para retomar o wizard
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const { uid } = req.user!
  const country = 'AR'

  try {
    const pool = getPool(country)
    const { rows } = await pool.query(
      `SELECT w.*,
         (SELECT json_agg(s) FROM worker_service_areas s
          WHERE s.worker_id = w.id) as service_areas,
         (SELECT json_agg(a) FROM worker_availability a
          WHERE a.worker_id = w.id) as availability,
         (SELECT json_agg(q) FROM worker_quiz_responses q
          WHERE q.worker_id = w.id) as quiz_responses
       FROM workers w WHERE w.identity_uid = $1`,
      [uid]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/workers — listagem para backoffice
// Scatter-gather já preparado para múltiplos países
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { page = '1', pageSize = '20', name, status, country: countryFilter } = req.query
  const offset = (Number(page) - 1) * Number(pageSize)

  const countries = countryFilter
    ? [countryFilter as string]
    : getActiveCountries()

  try {
    const results = await Promise.all(
      countries.map(async (c) => {
        const pool = getPool(c)
        const conditions = ['1=1']
        const params: unknown[] = []

        if (name) {
          params.push(`%${name}%`)
          conditions.push(
            `(LOWER(first_name) ILIKE $${params.length}
             OR LOWER(last_name) ILIKE $${params.length})`
          )
        }
        if (status) {
          params.push(status)
          conditions.push(`status = $${params.length}`)
        }

        const where = conditions.join(' AND ')
        params.push(Number(pageSize), offset)

        const { rows } = await pool.query(
          `SELECT id, country, first_name, last_name, email,
                  profession, status, registration_step, created_at
           FROM workers
           WHERE ${where}
           ORDER BY created_at DESC
           LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        )
        return rows
      })
    )

    const merged = results.flat().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    res.json({
      workers: merged.slice(0, Number(pageSize)),
      page: Number(page),
      hasMore: merged.length > Number(pageSize)
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
4.6 src/index.ts
typescriptimport { HttpFunction } from '@google-cloud/functions-framework'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import workerRoutes from './routes/workers'

const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGIN }))
app.use(express.json({ limit: '1mb' }))

app.use('/api/workers', workerRoutes)

app.get('/health', (_, res) => res.json({ ok: true }))

export const api: HttpFunction = app
4.7 Deploy da Cloud Function
bash# Build
npm run build

# Deploy
gcloud functions deploy enlite-api \
  --gen2 \
  --runtime=nodejs20 \
  --region=southamerica-west1 \
  --source=. \
  --entry-point=api \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=enlite-functions-sa@enlite-production.iam.gserviceaccount.com \
  --set-env-vars="ALLOWED_ORIGIN=https://seu-app.weweb.io" \
  --set-secrets="DB_CONN_AR=enlite-ar-db-password:latest" \
  --vpc-connector=enlite-connector

Para conectar a Cloud Function ao Cloud SQL via IP privado, crie um VPC Connector:

bashgcloud compute networks vpc-access connectors create enlite-connector \
  --region=southamerica-west1 \
  --range=10.8.0.0/28
```

Anote a URL da função — vai precisar no WeWeb.

---

# Fase 5 — WeWeb

**5.1 Criar conta e projeto**
- Acesse weweb.io → Sign up
- Create new project → nome: `Enlite Care Worker Registration`
- Escolha "Blank" (não use template)

**5.2 Configurar o plugin REST API**
- No editor WeWeb → Plugins → Add Plugin → REST API
- Base URL: `https://southamerica-west1-enlite-production.cloudfunctions.net/enlite-api`
- Headers padrão: `Content-Type: application/json`

**5.3 Configurar autenticação com Identity Platform**

WeWeb não tem plugin nativo para Google Identity Platform — você vai usar o plugin de Token-based Auth:

- Plugins → Add Plugin → Token-based Auth
- Configure os endpoints:
  - Sign up URL: `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=SUA_WEB_API_KEY`
  - Sign in URL: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=SUA_WEB_API_KEY`
  - Token path na resposta: `idToken`
  - Refresh token path: `refreshToken`

**5.4 Criar as páginas**

No WeWeb, crie as seguintes páginas:
```
/login                    → tela Login.png
/cadastro                 → tela Cadastro_User_1.png (e-mail + senha)
/cadastro/verificacao     → tela Cadastro_User_2.png (OTP)
/cadastro/video-quiz      → tela Worker_Video_e_perguntas.png
/cadastro/informacoes     → tela Worker_Informacoes_Gerais.png
/cadastro/endereco        → tela Worker_Endereco_de_Atendimentos.png
/cadastro/horarios        → tela Worker_Horarios_e_Disponibilidade.png
/cadastro/concluido       → tela de confirmação final
```

**5.5 Configurar a página `/login`**

Componentes a adicionar:
- Logo Enlite (imagem)
- Grid de fotos (componente de grid com imagens estáticas)
- Input: Email → bind à variável local `email`
- Input: Senha (type password) → bind à variável local `password`
- Botão "Fazer login" → Workflow:
  1. Action: Auth Plugin → Sign In (email + password)
  2. On success: Navigate to `/cadastro/video-quiz` (verificar step do worker via `GET /api/workers/me`)
  3. On error: Show error message
- Botão "Fazer login com Google" → Workflow:
  1. Action: Custom JS → chama o Google Sign-In popup via Firebase SDK
  2. On success: mesma lógica de redirecionamento
- Link "Ainda não tem conta?" → Navigate to `/cadastro`
- Link "Esqueceu a senha?" → Workflow: Auth Plugin → Reset Password

**5.6 Configurar a página `/cadastro`**

Componentes:
- Inputs: Email, Senha, Repita a senha → variáveis locais
- Botão "Cadastrar" → Workflow:
  1. Validar senhas iguais (fórmula WeWeb)
  2. Auth Plugin → Sign Up (cria conta no Identity Platform)
  3. REST API → `POST /api/workers/init` (cria registro no DB)
  4. Identity Platform envia e-mail de verificação automaticamente
  5. Navigate to `/cadastro/verificacao`
- Botão "Cadastrar com Google"
- Checkboxes Termos + Privacidade → variáveis booleanas, validar antes do submit

**5.7 Configurar a página `/cadastro/verificacao`**

Esta tela (OTP de 4 dígitos) é onde o usuário insere o código que chegou por e-mail.

Componentes:
- 4 inputs de 1 dígito → variáveis `d1, d2, d3, d4`
- Fórmula para concatenar: `d1 + d2 + d3 + d4`
- Botão "Continuar" → Workflow:
  1. Custom JS → chama `applyActionCode(auth, oobCode)` do Firebase SDK com o código recebido por e-mail, OU verifica manualmente via REST API do Identity Platform
  2. On success: Navigate to `/cadastro/video-quiz`

> **Nota sobre o OTP de 4 dígitos:** O Identity Platform nativamente envia um link de verificação, não um código numérico de 4 dígitos. Para ter exatamente o comportamento do seu mockup (4 caixas numéricas), você tem duas opções: (a) personalizar o template do e-mail para incluir um código de 4 dígitos que você gera e armazena temporariamente no Secret Manager, ou (b) usar Twilio Verify para SMS OTP — mais alinhado com o UX dos seus screens.

**5.8 Configurar a página `/cadastro/video-quiz`**

Componentes:
- Player de vídeo → embed iframe do Vimeo/YouTube
- Para cada seção do quiz: Radio group bindado a variável local
- Botão "Próximo" → Workflow:
  1. Validar todas as respostas preenchidas
  2. REST API → `PUT /api/workers/step` com `{ step: 1, data: { responses: [...] } }`
  3. On success: Navigate to `/cadastro/informacoes`

**5.9 Configurar a página `/cadastro/informacoes`**

Componentes baseados na tela Worker_Informacoes_Gerais.png:
- Upload de foto → Workflow: faz upload para Cloud Storage, salva a URL
- Inputs: Email (read-only, do auth), Nome, Sobrenome
- Selects: Sexo, Gênero, Idiomas (multi-select), Profissão, Nível de conhecimento, Título, Tipos de experiência, Anos, Tipos preferidos, Faixa etária preferida
- Date picker: Data de nascimento
- Select + Input: Tipo de documento + Número
- Input: Telefone
- Botão "Próximo" → `PUT /api/workers/step` com `{ step: 2, data: {...} }`

**5.10 Configurar a página `/cadastro/endereco`**

Componentes:
- Input de endereço com autocomplete do Google Places API
  - No WeWeb, adicione um componente HTML customizado com o script do Google Maps Places
- Input: Complemento
- Slider: raio de atendimento (5km → 50km) → variável local `radiusKm`
- Mapa Google Maps com círculo → componente HTML customizado ou plugin de mapa
- Botão "Próximo" → `PUT /api/workers/step` com `{ step: 3, data: { address, lat, lng, serviceRadiusKm } }`

**5.11 Configurar a página `/cadastro/horarios`**

Componentes:
- Para cada dia da semana (0=Dom → 6=Sáb): row com label + botão "+" + chips de horários
- Ao clicar "+": modal com time pickers (início e fim)
- Botão "x" em cada chip: remove o horário
- Estrutura de dados local: `availability = { 0: [{start, end}], 1: [], ... }`
- Botão "Próximo" → `PUT /api/workers/step` com `{ step: 4, data: { availability: [...] } }`
- Navigate to `/cadastro/concluido`

**5.12 Configurar redirecionamento inteligente pós-login**

Na página de login, após autenticar com sucesso, a Cloud Function `GET /api/workers/me` retorna o `registration_step` atual. Use isso para redirecionar:
```
step 1 → /cadastro/video-quiz
step 2 → /cadastro/informacoes
step 3 → /cadastro/endereco
step 4 → /cadastro/horarios
step 5 → /cadastro/concluido (ou dashboard)

Fase 6 — Testes
6.1 Testar o fluxo completo localmente
bash# Rodar Cloud Function localmente
cd enlite-functions
npx @google-cloud/functions-framework --target=api --port=8080

# No WeWeb, aponte temporariamente a base URL para http://localhost:8080
6.2 Checklist de testes funcionais

 Cadastro com e-mail e senha novo → e-mail de verificação chega
 OTP / link de verificação valida e avança
 Cadastro com Google funciona
 Login com usuário já cadastrado redireciona para o step correto
 Quiz salva todas as respostas no banco
 Informações gerais salva todos os campos
 Endereço salva lat/lng corretamente
 Slider de raio atualiza o mapa em tempo real
 Horários permitem múltiplos slots por dia
 Horários permitem slots que cruzam meia-noite (ex: 23:00 → 06:00)
 "Voltar" mantém os dados já preenchidos
 Fechar o browser e reabrir retoma do step correto
 Senha errada no login exibe mensagem de erro

6.3 Testar segurança
bash# Chamada sem token deve retornar 401
curl -X GET https://FUNCTION_URL/api/workers/me

# Chamada com token inválido deve retornar 401
curl -X GET https://FUNCTION_URL/api/workers/me \
  -H "Authorization: Bearer token_invalido"

Fase 7 — Produção
7.1 Configurar domínio customizado no WeWeb

WeWeb → Settings → Custom Domain
Adicione app.enlite.health ou similar
Configure o DNS no seu provedor apontando para o WeWeb
WeWeb provisiona SSL automaticamente

7.2 Variáveis de ambiente de produção
bash# Atualizar a Cloud Function com o domínio real
gcloud functions deploy enlite-api \
  --update-env-vars="ALLOWED_ORIGIN=https://app.enlite.health"
7.3 Configurar Organizational Policy de data residency
bash# Garante que nenhum recurso seja criado fora de southamerica-west1
gcloud org-policies set-policy - <<EOF
name: projects/enlite-production/policies/gcp.resourceLocations
spec:
  rules:
  - values:
      allowedValues:
      - in:southamerica-west1-locations
EOF
7.4 Ativar Cloud Armor (WAF básico)
bashgcloud compute security-policies create enlite-waf \
  --description="WAF para Enlite"

# Regra contra injeção SQL e XSS
gcloud compute security-policies rules create 1000 \
  --security-policy=enlite-waf \
  --expression="evaluatePreconfiguredExpr('sqli-stable')" \
  --action=deny-403

gcloud compute security-policies rules create 1001 \
  --security-policy=enlite-waf \
  --expression="evaluatePreconfiguredExpr('xss-stable')" \
  --action=deny-403
7.5 Configurar alertas de monitoramento

Cloud Console → Monitoring → Alerting → Create Policy
Alerta 1: Cloud Function error rate > 1% por 5 minutos
Alerta 2: Cloud SQL CPU > 80% por 10 minutos
Alerta 3: Cloud SQL connections > 80% do máximo

7.6 Publicar o WeWeb

WeWeb → Publish → Custom Domain
Aguarda propagação DNS (até 48h, geralmente minutos)
Teste o fluxo completo no domínio de produção

7.7 Checklist final antes de abrir para usuários

 HTTPS funcionando em todos os endpoints
 Identity Platform só aceita o domínio de produção (remova localhost dos authorized domains)
 Cloud SQL não tem IP público exposto
 Secret Manager tem as versões corretas ativas
 Backup automático do Cloud SQL configurado e testado
 Alertas de monitoramento ativos e chegando no e-mail correto
 ROPA (Registro de Operações de Tratamento) documentado para PDPA Argentina
 Termos de Uso e Política de Privacidade publicados e linkados nas telas


Quando for adicionar o Brasil:
bash# 1. Criar Cloud SQL em São Paulo
gcloud sql instances create enlite-br-db \
  --region=southamerica-east1 [demais flags iguais]

# 2. Rodar o mesmo schema SQL

# 3. Adicionar a connection string ao Secret Manager
gcloud secrets create enlite-br-db-password --data-file=-

# 4. Atualizar a Cloud Function (uma linha)
# Em src/db/client.ts: descomentar BR: process.env.DB_CONN_BR!

# 5. Redeploy da função com a nova secret
gcloud functions deploy enlite-api \
  --update-secrets="DB_CONN_BR=enlite-br-db-password:lates