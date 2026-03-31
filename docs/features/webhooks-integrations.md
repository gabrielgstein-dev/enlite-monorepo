# Webhooks & Integracoes (WBH)

## O que e

Endpoints de webhook para receber dados de sistemas externos (Talentum, Twilio) e sistema de autenticacao de parceiros via Google API Keys. Inclui validacao de payload, autenticacao por partner key e processamento assincrono via Pub/Sub.

> **Nota**: A documentacao detalhada de partner auth esta em [partner-webhook-auth.md](partner-webhook-auth.md).

## Por que existe

A Enlite recebe dados de sistemas externos em tempo real:
- **Talentum**: Envia pre-screening quando candidato atinge status QUALIFIED
- **Twilio**: Envia callbacks de status de entrega de mensagens WhatsApp

O sistema de partner auth substituiu o N8N como intermediario, eliminando ponto de falha.

## Como funciona

### Talentum Prescreening

```
Talentum (n8n ou direto)
  |  POST /api/webhooks/talentum/prescreening
  |  Header: X-Partner-Key: AIza...
  v
PartnerAuthMiddleware
  |  Valida key via Google API (apikeys.lookupKey)
  |  Busca parceiro no banco (webhook_partners)
  |  Verifica allowed_paths
  v
Zod schema validation
  |  talentumPrescreeningSchema.ts
  v
ProcessTalentumPrescreening use case
  |  Busca job_posting por titulo (ILIKE)
  |  Cria/atualiza TalentumPrescreening record
  v
Pub/Sub event
  |  Processamento assincrono downstream
```

### Twilio Status Callback

```
Twilio
  |  POST /api/webhooks/twilio/status
  |  Header: X-Twilio-Signature (HMAC)
  v
Validacao HMAC
  |  Verifica assinatura com auth token Twilio
  v
Atualiza status por twilio_sid
  |  whatsapp_bulk_dispatch_logs
  |  messaging_outbox
  v
Sempre responde 200 (evita retries)
```

### Ambiente de teste

```
Producao:  /api/webhooks/talentum/prescreening
Teste:     /api/webhooks-test/talentum/prescreening

Mesma key funciona em ambas as URLs
Prefixo /webhooks-test/ define isTest=true
Em teste: dryRun=true (resolve IDs mas nao persiste)
```

## Endpoints

| Metodo | Rota | Funcao | Auth |
|--------|------|--------|------|
| POST | `/api/webhooks/talentum/prescreening` | Prescreening Talentum | Partner Key |
| POST | `/api/webhooks-test/talentum/prescreening` | Teste (dry run) | Partner Key |
| POST | `/api/webhooks/twilio/status` | Callback status Twilio | X-Twilio-Signature |

## Componentes

### Backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/interfaces/webhooks/controllers/TalentumWebhookController.ts` | Handler Talentum |
| `src/interfaces/webhooks/controllers/TwilioWebhookController.ts` | Handler Twilio |
| `src/interfaces/webhooks/middleware/PartnerAuthMiddleware.ts` | Auth por partner key |
| `src/interfaces/webhooks/routes/webhookRoutes.ts` | Router factory |
| `src/interfaces/webhooks/validators/talentumPrescreeningSchema.ts` | Schema Zod |
| `src/application/usecases/ProcessTalentumPrescreening.ts` | Use case prescreening |
| `src/infrastructure/services/GoogleApiKeyValidator.ts` | Validacao GCP API Key |
| `src/infrastructure/repositories/TalentumPrescreeningRepository.ts` | Persistencia |
| `src/infrastructure/repositories/WebhookPartnerRepository.ts` | Tabela webhook_partners |
| `src/domain/entities/TalentumPrescreening.ts` | Entidade prescreening |
| `src/domain/entities/WebhookPartner.ts` | Entidade + PartnerContext |

## Regras de negocio

### Partner Auth
- Key validada via Google Cloud API (nao armazenada localmente)
- Cache em memoria: TTL 5 min, chave = SHA-256 hash da API key
- Parceiro deve estar ativo (`is_active=true`) e com path permitido
- Glob matching de paths: `talentum/*` cobre `talentum/prescreening`, `talentum/status`, etc.
- Bypass em modo teste: `USE_MOCK_AUTH=true`

### Talentum
- Job posting lookup por titulo ILIKE (case-insensitive partial match)
- Cria ou atualiza registro (upsert)
- Ambiente rastreado: test vs. production
- Publica evento Pub/Sub para processamento assincrono
- DryRun: resolve IDs para validacao sem persistir

### Twilio
- Validacao HMAC via X-Twilio-Signature
- Atualiza status em DUAS tabelas: bulk_dispatch_logs e messaging_outbox
- Status possiveis: sent, delivered, failed, undelivered
- Sempre 200 (mesmo em erro interno) para evitar retries do Twilio

## Como adicionar novo parceiro

1. Criar API Key no GCP Console (`API-Key-<NomeParceiro>`)
2. Registrar no banco: `INSERT INTO webhook_partners (name, display_name, allowed_paths)`
3. Criar controller em `src/interfaces/webhooks/controllers/`
4. Adicionar rota em `webhookRoutes.ts`
5. Compartilhar key com parceiro

Ver detalhes completos em [partner-webhook-auth.md](partner-webhook-auth.md).

## Integracoes externas

- **Google Cloud API**: Validacao de API Keys (apikeys.lookupKey)
- **Talentum ATS**: Envia prescreenings via webhook
- **Twilio**: Envia callbacks de status de mensagem
- **Google Cloud Pub/Sub**: Processamento assincrono de eventos
- **n8n**: Intermediario historico (sendo substituido por chamada direta)
