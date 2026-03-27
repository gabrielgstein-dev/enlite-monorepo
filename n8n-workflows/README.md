# n8n Workflows - Enlite Health

Este diretório contém os workflows do n8n para automação de processos da Enlite Health.

## 📋 Workflows Disponíveis

### 1. Worker Onboarding (`worker-onboarding-example.json`)

Workflow principal que orquestra o processo de onboarding de profissionais de saúde.

**Gatilho**: Webhook em `http://localhost:5678/webhook/worker-events`

**Eventos Processados**:
- `worker.step.completed` - Quando um worker completa uma etapa
- `worker.status.changed` - Quando o status do worker muda
- `worker.created` - Quando um novo worker é criado

**Integrações**:

#### HubSpot (Step 2)
Quando o worker completa o step 2, cria um contato no HubSpot CRM com:
- Email
- Nome completo (dividido em firstname/lastname)
- Telefone

#### Google Calendar (Step 4)
Quando o worker completa o step 4 (disponibilidade), cria um evento no Google Calendar.

#### Twilio SMS (Status = Review)
Quando o status muda para "review", envia SMS de notificação ao worker.

---

### 2. Worker CRUD Events (`worker-crud-events.json`)

Workflow para notificações de operações CRUD em workers (criação, atualização, deleção).

**Gatilho**: Webhook em `http://localhost:5678/webhook/worker-crud-events`

**Eventos Processados**:
- `worker.created` - Quando um novo worker é cadastrado
- `worker.updated` - Quando dados do worker são atualizados
- `worker.deleted` - Quando um worker é removido do sistema

**Integrações**:

#### Slack Notifications
Envia notificações para um canal do Slack configurado via variável de ambiente `SLACK_NOTIFICATIONS_CHANNEL`:
- **Created**: Notifica com ID e email do novo worker
- **Updated**: Notifica com ID e lista de mudanças realizadas
- **Deleted**: Notifica com ID do worker removido

**Payload Esperado**:
```json
{
  "event": "worker.created|worker.updated|worker.deleted",
  "payload": {
    "workerId": "uuid-123",
    "data": {
      "email": "worker@example.com",
      "changes": { "status": "approved" }
    }
  }
}
```

## 🚀 Como Importar

1. Acesse n8n em `http://localhost:5678`
2. Faça login com `admin/admin`
3. Clique em **Workflows** > **Import from File**
4. Selecione `worker-onboarding-example.json`
5. Configure as credenciais:
   - HubSpot OAuth2 API
   - Google Calendar OAuth2 API
   - Twilio API

## 🔐 Configuração de Credenciais

### HubSpot
1. Vá em **Settings** > **Credentials** > **Add Credential**
2. Selecione **HubSpot OAuth2 API**
3. Siga o fluxo OAuth2 para autorizar

### Google Calendar
1. Crie um Service Account no Google Cloud Console
2. Baixe o JSON de credenciais
3. Em n8n: **Settings** > **Credentials** > **Google Calendar OAuth2 API**
4. Cole o conteúdo do JSON

### Twilio
1. Obtenha Account SID e Auth Token do Twilio Console
2. Em n8n: **Settings** > **Credentials** > **Twilio API**
3. Preencha os campos

## 🧪 Testando o Workflow

```bash
# Testar evento de step completed
curl -X POST http://localhost:5678/webhook/worker-events \
  -H "Content-Type: application/json" \
  -d '{
    "event": "worker.step.completed",
    "payload": {
      "workerId": "uuid-123",
      "step": 2,
      "data": {
        "email": "test@example.com",
        "fullName": "João Silva",
        "phone": "+5511999999999"
      }
    }
  }'

# Testar mudança de status
curl -X POST http://localhost:5678/webhook/worker-events \
  -H "Content-Type: application/json" \
  -d '{
    "event": "worker.status.changed",
    "payload": {
      "workerId": "uuid-123",
      "status": "review",
      "data": {
        "phone": "+5511999999999"
      }
    }
  }'

# Testar eventos CRUD
curl -X POST http://localhost:5678/webhook/worker-crud-events \
  -H "Content-Type: application/json" \
  -d '{
    "event": "worker.created",
    "payload": {
      "workerId": "uuid-123",
      "data": {
        "email": "new@example.com"
      }
    }
  }'

curl -X POST http://localhost:5678/webhook/worker-crud-events \
  -H "Content-Type: application/json" \
  -d '{
    "event": "worker.updated",
    "payload": {
      "workerId": "uuid-123",
      "data": {
        "changes": { "status": "approved" }
      }
    }
  }'

curl -X POST http://localhost:5678/webhook/worker-crud-events \
  -H "Content-Type: application/json" \
  -d '{
    "event": "worker.deleted",
    "payload": {
      "workerId": "uuid-123"
    }
  }'
```

## 📝 Customização

Para adicionar novas integrações:

1. Abra o workflow no n8n
2. Adicione um novo nó **IF** para detectar o evento/step desejado
3. Adicione o nó de integração (ex: Slack, Email, etc.)
4. Conecte ao nó **Respond to Webhook**
5. Salve e ative o workflow

## 🔄 Versionamento

Sempre que modificar um workflow:

1. Exporte o workflow atualizado
2. Substitua o arquivo JSON neste diretório
3. Commit com mensagem descritiva
