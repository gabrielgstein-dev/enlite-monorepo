📑 Project Progress & Context: Enlite Health Platform
🎯 Project Overview
Enlite Health is a healthcare platform requiring high standards of data protection (HIPAA, LGPD, GDPR). We are building a multi-step worker registration flow.

🏗️ Technical Stack
Frontend: React (Web/Mobile App hospedado no Google Cloud).

Auth: Google Cloud Identity Platform (HIPAA Compliant).

Backend: Google Cloud Functions (Node.js + TypeScript).

Database: Google Cloud SQL (PostgreSQL 15).

Integration Layer: n8n (Self-hosted on GCP for HIPAA compliance).

External Services: HubSpot (CRM), Twilio (SMS), Google Calendar.

📂 Architecture Pattern
Clean Architecture to ensure testability and isolation:

Domain: Business entities and rules (POJOs/Interfaces).

Application: Use Cases (e.g., RegisterWorker, UpdateAvailability).

Infrastructure: Persistence (TypeORM/pg), External API Dispatchers (n8n).

Interfaces: Controller layer (Express-based Cloud Functions).

🛠️ Current Status (Phase 3: Backend & Dispatcher - COMPLETED)
[x] Architecture & Stack definition.

[x] Database Schema Design (PostgreSQL).

[x] Backend Scaffold (Node.js/TS).

[x] Docker Compose setup (Postgres + n8n).

[x] Clean Architecture folder structure.

[x] .windsurfrules com compliance HIPAA.

[x] Database Schema Implementation (SQL migrations).

[x] Domain Layer: Entities (Worker, ServiceArea, Availability, QuizResponse).

[x] Domain Layer: Repository Interfaces.

[x] Domain Layer: Result Pattern para error handling.

[x] Infrastructure Layer: DatabaseConnection (Singleton Pattern).

[x] Infrastructure Layer: WorkerRepository implementation.

[x] Infrastructure Layer: EventDispatcher para n8n webhooks.

[x] Application Layer: Use Cases (InitWorker, SaveStep, GetProgress).

[x] Interface Layer: WorkerController (Express handlers).

[x] API Endpoints: POST /api/workers/init, PUT /api/workers/step, GET /api/workers/me.

[x] Setup Scripts: setup.sh e migrate.sh.

[ ] Instalar dependências (npm install).

[ ] Testar endpoints localmente.

[ ] Configurar n8n workflows.

🚀 Next Strategic Steps (Windsurf Backlog)
Infrastructure - Repositories: Implementar ServiceAreaRepository, AvailabilityRepository, QuizResponseRepository.

Application - Use Cases: SaveServiceArea, SaveAvailability, SaveQuizResponse.

n8n Workflows: Criar workflow de onboarding (HubSpot + Twilio + Google Calendar).

Testing: Criar testes unitários para Use Cases.

Frontend Integration: Documentar contrato de API para React frontend.

GCP Deployment: Configurar Cloud Functions e Cloud SQL.

🔐 Compliance Guardrails (Crucial)
Zero PII Leakage: No logging of personal data.

Audit Trail: Every update must trigger the updated_at field and eventually an audit log entry.

Data Residency: Ready for regional isolation (southamerica-east1 vs others).