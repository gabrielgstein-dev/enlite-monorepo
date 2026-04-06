# Worker Profile — Campos da Tela de Perfil (`/worker/profile`)

Mapeamento completo de todos os campos que o **prestador (AT)** preenche na sua própria tela de perfil, organizados por aba.

> **Nota:** Esta é a visão do worker, não a visão administrativa.

---

## Tab 1: Informações Gerais

| Campo | Tipo | Obrigatório? | Observações |
|---|---|---|---|
| Foto de Perfil | Image Upload | Opcional | Comprimida para 400x400 |
| Email | Email | **Sim** | Read-only (vem do Firebase Auth) |
| Idiomas | Multi-Select | **Sim** (min 1) | Português, Espanhol, Inglês |
| Nome | Text | **Sim** (min 3 chars) | Read-only após primeiro preenchimento |
| Sobrenome | Text | **Sim** (min 1 char) | |
| Sexo | Select | **Sim** | male, female |
| Gênero | Select | **Sim** | male, female, other |
| CPF / CUIL / CUIT | Text | **Sim** (11-14 chars) | Máscara de formatação, read-only após primeiro preenchimento |
| Data de Nascimento | Text | **Sim** | Máscara DD/MM/YYYY |
| Telefone | Phone | **Sim** (10-15 chars) | Input internacional |
| Profissão | Select | **Sim** | AT, CAREGIVER, NURSE, KINESIOLOGIST, PSYCHOLOGIST |
| Nível de Conhecimento | Select | **Sim** | SECONDARY, TERTIARY, TECNICATURA, BACHELOR, POSTGRADUATE, MASTERS, DOCTORATE |
| Título/Certificado Profissional | Text | **Sim** (min 1 char) | Read-only após primeiro preenchimento |
| Tipos de Experiência | Multi-Select | **Sim** (min 1) | 11 condições clínicas (ver lista abaixo) |
| Anos de Experiência | Select | **Sim** | 0-2, 3-5, 6-10, 10+ |
| Tipos de Paciente Preferidos | Multi-Select | **Sim** (min 1) | Mesmas 11 condições clínicas |
| Faixa Etária Preferida | Multi-Select | **Sim** (min 1) | children, adolescents, adults, elderly |

**Campos read-only:** Email e Nome são sempre read-only. CPF e Título Profissional ficam read-only após o primeiro preenchimento.

### Condições Clínicas (Experience Types / Preferred Types)

- adicciones (Dependências)
- psicosis (Psicose)
- trastorno_alimentar (Transtorno Alimentar)
- trastorno_bipolaridad (Transtorno Bipolar)
- trastorno_ansiedad (Transtorno de Ansiedade)
- trastorno_discapacidad_intelectual (Deficiência Intelectual)
- trastorno_depresivo (Transtorno Depressivo)
- trastorno_neurologico (Transtorno Neurológico)
- trastorno_opositor_desafiante (Transtorno Opositor Desafiante)
- trastorno_psicologico (Transtorno Psicológico)
- trastorno_psiquiatrico (Transtorno Psiquiátrico)

---

## Tab 2: Endereço de Atendimento

| Campo | Tipo | Obrigatório? | Observações |
|---|---|---|---|
| Endereço | Text | **Sim** (min 1 char) | Autocomplete via Google Places |
| Complemento | Text | Opcional | |
| Cidade | Text | Auto-preenchido | Read-only, extraído do Google Places |
| CEP | Text | Auto-preenchido | Read-only, extraído do Google Places |
| Mapa de Área de Atendimento | Mapa interativo | — | Exibe o raio de atendimento no mapa |
| Raio de Atendimento (km) | Number/Slider | **Sim** (min 1) | Valores: 5, 10, 20, 50 km |
| Aceita Atendimento Remoto | Checkbox | Opcional | Boolean |

**Coordenadas (lat/lng)** são capturadas automaticamente ao selecionar o endereço no Google Places.

---

## Tab 3: Disponibilidade

| Campo | Tipo | Obrigatório? | Observações |
|---|---|---|---|
| Dias da Semana (Dom-Sáb) | Toggle por dia | **Sim** (min 1 dia habilitado) | 7 cards, um por dia |
| Horários por Dia | Time Range (HH:MM) | **Sim** (min 1 slot por dia habilitado) | Múltiplos slots início/fim; default 09:00-17:00 |

**Validação:** endTime deve ser maior que startTime. Pelo menos 1 dia deve estar habilitado com pelo menos 1 slot de horário.

---

## Tab 4: Documentos

Todos os documentos são **obrigatórios** para completar o perfil.

| Documento | ID interno | Observações |
|---|---|---|
| Curriculum | resume_cv | Currículo do prestador |
| Certificados e/ou Títulos | liability_insurance | Certificados constantes do CV |
| DNI - Documento Nacional de Identidade | identity_document | Documento de identidade |
| Constancia de Inscripción en ARCA (ex-AFIP) | professional_registration | Registro profissional fiscal |
| Antecedentes Penales | criminal_record | Certidão de antecedentes criminais |

**Layout:** 3 documentos na linha superior + 2 na linha inferior. Cada card mostra status de upload e botões para enviar/excluir/visualizar.

---

## Resumo de Obrigatoriedade

| Aba | Total de Campos | Obrigatórios | Opcionais |
|---|---|---|---|
| Informações Gerais | 17 | 16 | 1 (foto) |
| Endereço de Atendimento | 7 | 2 (+2 auto) | 2 |
| Disponibilidade | 2 | 2 | 0 |
| Documentos | 5 | 5 | 0 |
| **Total** | **31** | **25** | **3** |

---

## Referência Técnica

| Arquivo | Descrição |
|---|---|
| `enlite-frontend/src/presentation/pages/WorkerProfilePage.tsx` | Página principal com as 4 abas |
| `enlite-frontend/src/presentation/pages/tabs/GeneralInfoTab.tsx` | Aba Informações Gerais |
| `enlite-frontend/src/presentation/pages/tabs/ServiceAddressTab.tsx` | Aba Endereço de Atendimento |
| `enlite-frontend/src/presentation/pages/tabs/AvailabilityTab.tsx` | Aba Disponibilidade |
| `enlite-frontend/src/presentation/pages/tabs/DocumentsTab.tsx` | Aba Documentos |
| `enlite-frontend/src/presentation/validation/workerRegistrationSchemas.ts` | Schemas Zod de validação |
| `enlite-frontend/src/infrastructure/http/DocumentApiService.ts` | API client de documentos |

**Comportamento de auto-save:** O formulário salva automaticamente no blur de cada campo (hook `useAutoSave`). Upload de foto dispara save imediato.
