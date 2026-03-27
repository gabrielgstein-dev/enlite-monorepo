# Roadmap: Integração Dashboard → Worker-Functions

**Objetivo:** Migrar a lógica de processamento e amostragem de dados do Dashboard client-side para o backend worker-functions, permitindo que o Dashboard consuma dados via API.

**Data de criação:** 22 de março de 2026  
**Status:** 🔴 Em Planejamento

---

## 📊 Estado Atual

### Dashboard (Client-Side)
O Dashboard atual (`DashboardReclutamientoEnlite-main/app/page.tsx`) processa **4 arquivos Excel/CSV** diretamente no navegador:

1. **ClickUp** (Excel) - Casos ativos, status, prioridade, zona, diagnóstico
2. **Talentum** (aba do CANDIDATOS.xlsx) - Postulantes qualificados
3. **En Progreso** (aba NoTerminaronTalentum) - Candidatos em processo
4. **Planilla Operativa** (Excel) - Encuadres, publicações, resultados

**Processamento:**
- Parser XLSX client-side (biblioteca `xlsx`)
- Normalização de dados (lowercase, trim, fuzzy matching)
- Cruzamento de dados (casos × postulantes × encuadres)
- Cálculo de métricas (seleccionados, reemplazos, asistência)
- Visualização em tempo real

### Worker-Functions (Server-Side)
O backend atual (`worker-functions/src/infrastructure/scripts/import-planilhas.ts`) processa **4 arquivos** e persiste no PostgreSQL:

1. **Ana Care Control** (Excel) - Workers ativos no sistema AnaCare ✅
2. **CANDIDATOS.xlsx** (3 abas) - Talentum, NoTerminaronTalentum, NoUsarMás ✅
3. **Planilla Operativa** (Excel) - _Base1, _Publicaciones, _Mod, case sheets ✅
4. **Talent Search** (CSV) - Export do ATS TalentSearch ✅

**Processamento:**
- Parser XLSX server-side (biblioteca `xlsx`)
- Normalização de dados (phone AR, emails, nomes)
- Deduplicação de workers (phone-based)
- Persistência em PostgreSQL
- Linking automático (encuadres → workers via phone)

---

## 🚨 Gaps Críticos Identificados

### 1. **ARQUIVO CLICKUP NÃO PROCESSADO** ❌ CRÍTICO

**Problema:** Worker-functions não processa o arquivo ClickUp, que é a fonte primária de:
- Casos ativos (BUSQUEDA, REEMPLAZO)
- Status e prioridade de casos
- Zona/Barrio do paciente
- Diagnóstico
- Perfil do prestador buscado
- Horários de acompanhamento
- Datas (criação, modificação, início de busca)

**Impacto:** Dashboard não pode funcionar sem esses dados — são a base de toda a amostragem.

**Localização no Dashboard:** `@/app/page.tsx:586-651` (função `handleFileUpload` tipo "clickup")

---

### 2. **EXTRAÇÃO DE NÚMEROS DE CASO - FALLBACK AUSENTE** ❌ CRÍTICO

**Problema:** `parseTalentSearchCaseNumbers` só extrai casos no formato `"CASO 502"`, mas falha com:
- Números puros: `"502, 492, 418"`
- Números separados: `"502 - 492"`
- Números com pontuação: `"502; 492 & 418"`

**Dashboard tem fallback robusto:**
```typescript
// @/app/page.tsx:353-376
if (results.length === 0) {
  // Tenta string puramente numérica
  if (/^[\d\s,.\-;&y]+$/.test(str.trim())) {
    const nums = str.match(/\d+/g);
    if (nums) results.push(...nums);
  } else {
    // Tenta números de 3-4 dígitos sem palavras grandes
    const nums = str.match(/\b(\d{3,4})\b/g);
    if (nums && !/[a-zA-Z]{3,}/.test(str)) {
      results.push(...nums);
    }
  }
}
```

**Worker-Functions atual:**
```typescript
// @/src/infrastructure/scripts/import-planilhas.ts:1643-1648
function parseTalentSearchCaseNumbers(prescreenings: string | null): number[] {
  if (!prescreenings) return [];
  const matches = [...String(prescreenings).matchAll(/[Cc][Aa][Ss][Oo]\s+(\d+)/g)];
  const cases = matches.map(m => parseInt(m[1], 10));
  return [...new Set(cases)];
}
```

**Impacto:** Perda de dados quando formato muda (já aconteceu conforme comentários no Dashboard).

---

### 3. **AUTO-DETECÇÃO DE HEADER AUSENTE** ⚠️ IMPORTANTE

**Problema:** Worker-functions assume que header está sempre na linha 0. Dashboard busca header nas primeiras 20 linhas.

**Dashboard:**
```typescript
// @/app/page.tsx:549-557
let headerIdx = 0;
for (let i = 0; i < Math.min(rawData.length, 20); i++) {
  const rowStr = rawData[i].map((c: any) => String(c).toLowerCase()).join(" ");
  if (rowStr.includes("nombre") || rowStr.includes("postulante") || 
      rowStr.includes("fecha") || rowStr.includes("caso")) {
    headerIdx = i;
    break;
  }
}
```

**Worker-Functions:**
```typescript
// Assume linha 0 sempre
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })
```

**Impacto:** Falha em arquivos com linhas de metadados/títulos no topo.

---

### 4. **BUSCA FUZZY DE COLUNAS - PARCIAL** ⚠️ IMPORTANTE

**Problema:** Worker-functions só faz exact match de nomes de colunas. Dashboard faz exact → includes.

**Dashboard:**
```typescript
// @/app/page.tsx:277-300
// FASE 1: Exact match
for (const key of allKeys) {
  if (key === target) return key;
}
// FASE 2: Includes (fuzzy)
for (const key of allKeys) {
  if (key.includes(target)) return key;
}
```

**Worker-Functions:**
```typescript
// @/src/infrastructure/scripts/import-planilhas.ts:68-73
function col(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return null;
}
```

**Impacto:** Falha quando nome de coluna tem variações (`"Zona"` vs `"Zona o Barrio Paciente"`).

---

### 5. **ENDPOINT DE AGREGAÇÃO AUSENTE** ❌ CRÍTICO

**Problema:** Não existe API que retorne dados agregados no formato que o Dashboard espera.

**Dashboard precisa:**
- `GET /api/analytics/global` → métricas globais (casos ativos, postulantes, encuadres)
- `GET /api/analytics/cases/:id` → métricas por caso específico
- `GET /api/analytics/zones` → distribuição por zona
- `GET /api/analytics/reemplazos` → contagem sel/rem por caso

**Worker-Functions tem:** Apenas endpoints CRUD de workers, encuadres, job_postings.

---

## 📋 Plano de Implementação

### **FASE 1: Importador ClickUp** 🔴 CRÍTICO

**Objetivo:** Processar arquivo ClickUp e persistir casos no PostgreSQL.

#### 1.1 Criar Tabela `clickup_cases`

**Arquivo:** `migrations/XXX_create_clickup_cases.sql`

```sql
CREATE TABLE IF NOT EXISTS clickup_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number INTEGER NOT NULL UNIQUE,
  task_id TEXT,
  task_name TEXT,
  status TEXT, -- BUSQUEDA, REEMPLAZO, etc.
  priority TEXT, -- URGENT, HIGH, NORMAL, LOW
  dependency TEXT,
  diagnosis TEXT,
  patient_zone TEXT,
  patient_neighborhood TEXT,
  worker_profile_sought TEXT,
  schedule_days_hours TEXT,
  date_created TIMESTAMPTZ,
  date_updated TIMESTAMPTZ,
  date_due TIMESTAMPTZ,
  search_start_date TIMESTAMPTZ,
  last_comment TEXT,
  country TEXT DEFAULT 'AR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clickup_cases_case_number ON clickup_cases(case_number);
CREATE INDEX idx_clickup_cases_status ON clickup_cases(status);
CREATE INDEX idx_clickup_cases_zone ON clickup_cases(patient_zone);
```

**Status:** ❌ Não implementado

---

#### 1.2 Criar Repository `ClickUpCaseRepository`

**Arquivo:** `src/infrastructure/repositories/ClickUpCaseRepository.ts`

```typescript
export class ClickUpCaseRepository {
  async upsertByCaseNumber(data: {
    caseNumber: number;
    taskId?: string;
    taskName?: string;
    status?: string;
    priority?: string;
    dependency?: string;
    diagnosis?: string;
    patientZone?: string;
    patientNeighborhood?: string;
    workerProfileSought?: string;
    scheduleDaysHours?: string;
    dateCreated?: Date;
    dateUpdated?: Date;
    dateDue?: Date;
    searchStartDate?: Date;
    lastComment?: string;
    country?: string;
  }): Promise<{ id: string; created: boolean }> {
    // UPSERT por case_number
  }

  async findByCaseNumber(caseNumber: number): Promise<ClickUpCase | null> {
    // SELECT por case_number
  }

  async findActiveCases(country: string = 'AR'): Promise<ClickUpCase[]> {
    // SELECT WHERE status IN ('BUSQUEDA', 'REEMPLAZO')
  }

  async findByZone(zone: string, country: string = 'AR'): Promise<ClickUpCase[]> {
    // SELECT WHERE patient_zone = zone
  }
}
```

**Status:** ❌ Não implementado

---

#### 1.3 Adicionar `importClickUp` em `PlanilhaImporter`

**Arquivo:** `src/infrastructure/scripts/import-planilhas.ts`

**Adicionar após linha 332:**

```typescript
// ------------------------------------------------
// ClickUp Export → clickup_cases table
// Estrutura: Task Type, Task ID, Task Name, Status, Priority,
//            Caso Número (number), Diagnóstico, Zona o Barrio Paciente,
//            Perfil del Prestador Buscado, Días y Horarios, etc.
// ------------------------------------------------
private async importClickUp(
  wb: XLSX.WorkBook,
  jobId: string,
  onProgress?: (p: ImportProgress) => void
): Promise<ImportProgress> {
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
  
  // Auto-detectar header (busca "Task Type" na primeira coluna)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rawData.length, 20); i++) {
    if (String(rawData[i][0]).trim() === 'Task Type') {
      headerIdx = i;
      break;
    }
  }
  
  if (headerIdx === -1) {
    throw new Error('ClickUp: Header row not found (expected "Task Type" in column A)');
  }
  
  const headers = rawData[headerIdx].map(h => String(h).trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  
  for (let i = headerIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;
    
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = String(row[idx] || "").trim();
    });
    
    // Filtrar linhas vazias ou header duplicado
    const taskId = obj["task id"] || obj["id"];
    const taskType = obj["task type"];
    if (!taskId || taskType === "task type") continue;
    
    rows.push(obj);
  }
  
  const progress = makeProgress(sheetName, rows.length);
  console.log(`[Import ${jobId}][ClickUp] ${rows.length} rows to process`);
  
  const clickUpRepo = new ClickUpCaseRepository();
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      // Extrair case number
      const casoNumRaw = cleanString(col(row, 'caso número (number)', 'caso numero', 'caso número'));
      if (!casoNumRaw) {
        progress.errors.push({ row: i + 2, error: 'Missing case number' });
        continue;
      }
      
      const caseNumber = Math.floor(parseFloat(casoNumRaw));
      if (isNaN(caseNumber)) {
        progress.errors.push({ row: i + 2, error: `Invalid case number: ${casoNumRaw}` });
        continue;
      }
      
      // Normalizar status (remover acentos)
      let status = cleanString(col(row, 'estado', 'status')) || '';
      status = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      
      const { created } = await clickUpRepo.upsertByCaseNumber({
        caseNumber,
        taskId: cleanString(col(row, 'task id', 'id')),
        taskName: cleanString(col(row, 'task name', 'nombre', 'name')),
        status,
        priority: cleanString(col(row, 'priority', 'prioridad')),
        dependency: cleanString(col(row, 'dependencia', 'dependency')),
        diagnosis: cleanString(col(row, 'diagnóstico', 'diagnostico', 'diagnosis')),
        patientZone: cleanString(col(row, 'zona o barrio paciente', 'zona', 'barrio')),
        workerProfileSought: cleanString(col(row, 'perfil del prestador buscado', 'perfil prestador', 'perfil')),
        scheduleDaysHours: cleanString(col(row, 'días y horarios de acompañamiento', 'horarios')),
        dateCreated: parseExcelDate(col(row, 'date created', 'fecha de creación')),
        dateUpdated: parseExcelDate(col(row, 'date updated', 'fecha de última modificación')),
        dateDue: parseExcelDate(col(row, 'due date', 'fecha final')),
        searchStartDate: parseExcelDate(col(row, 'inicio búsqueda', 'start date')),
        lastComment: cleanString(col(row, 'last comment', 'último comentario')),
        country: 'AR',
      });
      
      if (created) progress.casesCreated++;
      else progress.casesUpdated++;
      
    } catch (err) {
      progress.errors.push({ row: i + 2, error: (err as Error).message });
    }
    
    progress.processedRows++;
    if (progress.processedRows % CHUNK_SIZE === 0) {
      await this.flushProgress(jobId, progress, onProgress);
    }
  }
  
  console.log(`[Import ${jobId}][ClickUp] DONE | created: ${progress.casesCreated} | updated: ${progress.casesUpdated} | errors: ${progress.errors.length}`);
  onProgress?.(progress);
  return progress;
}
```

**Status:** ❌ Não implementado

---

#### 1.4 Adicionar Detecção de Tipo ClickUp

**Arquivo:** `src/infrastructure/scripts/import-planilhas.ts`

**Modificar função `detectType` (linha ~159):**

```typescript
private detectType(wb: XLSX.WorkBook, filename: string): SpreadsheetType {
  const fn = filename.toLowerCase();
  const sheets = wb.SheetNames.map(s => s.toLowerCase());
  
  // ClickUp: arquivo contém "clickup" no nome OU primeira coluna é "Task Type"
  if (fn.includes('clickup')) return 'clickup';
  
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  if (firstSheet) {
    const rawData = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: "" });
    if (rawData.length > 0 && String(rawData[0][0]).trim() === 'Task Type') {
      return 'clickup';
    }
  }
  
  // Ana Care: arquivo contém "ana" no nome
  if (fn.includes('ana') && fn.includes('care')) return 'ana_care';
  
  // ... resto da lógica existente
}
```

**Adicionar tipo ao enum:**

```typescript
export type SpreadsheetType = 'ana_care' | 'candidatos' | 'planilla_operativa' | 'talent_search' | 'clickup';
```

**Status:** ❌ Não implementado

---

#### 1.5 Adicionar Rota no `importBuffer`

**Arquivo:** `src/infrastructure/scripts/import-planilhas.ts`

**Modificar linha ~162:**

```typescript
if (type === 'ana_care') {
  results.push(await this.importAnaCare(workbook, importJobId, onProgress));
} else if (type === 'candidatos') {
  results.push(await this.importCandidatos(workbook, importJobId, onProgress));
} else if (type === 'planilla_operativa') {
  results.push(...await this.importPlanillaOperativa(workbook, importJobId, onProgress));
} else if (type === 'talent_search') {
  results.push(await this.importTalentSearch(workbook, importJobId, onProgress));
} else if (type === 'clickup') {
  results.push(await this.importClickUp(workbook, importJobId, onProgress));
} else {
  throw new Error(`Tipo de planilha não reconhecido: ${filename}`);
}
```

**Status:** ❌ Não implementado

---

### **FASE 2: Melhorar Extração de Casos** 🔴 CRÍTICO

**Objetivo:** Adicionar fallback robusto para extração de números de caso.

#### 2.1 Atualizar `parseTalentSearchCaseNumbers`

**Arquivo:** `src/infrastructure/scripts/import-planilhas.ts` (linha 1643)

**Substituir função atual por:**

```typescript
/**
 * Extrai números de caso da coluna Pre-screenings/CASO do Talentum.
 * Formato esperado: "CASO 694, CASO 672, CASO 701, AT, para pacientes..."
 * 
 * FALLBACK ROBUSTO:
 *   1. Tenta regex "CASO NNN"
 *   2. Se falhar, tenta strings puramente numéricas (ex: "502, 492")
 *   3. Se falhar, tenta números de 3-4 dígitos sem palavras grandes
 * 
 * Retorna array de números únicos (deduplica automaticamente).
 */
function parseTalentSearchCaseNumbers(prescreenings: string | null): number[] {
  if (!prescreenings) return [];
  
  const results: number[] = [];
  const str = String(prescreenings).trim();
  
  // FASE 1: Tenta "CASO NNN" (case-insensitive)
  const matches = [...str.matchAll(/[Cc][Aa][Ss][Oo]\s+(\d+)/g)];
  results.push(...matches.map(m => parseInt(m[1], 10)));
  
  // FASE 2: FALLBACK para strings puramente numéricas
  // Ex: "502, 492, 418" ou "502 - 492" ou "502; 492 & 418"
  if (results.length === 0) {
    // Verifica se string contém apenas números, espaços e pontuação comum
    if (/^[\d\s,.\-;&y]+$/.test(str)) {
      const nums = str.match(/\d+/g);
      if (nums) {
        results.push(...nums.map(n => parseInt(n, 10)));
      }
    } else {
      // FASE 3: FALLBACK para números de 3-4 dígitos sem palavras grandes
      // Ex: "492 - Silva Lautaro" → extrai 492 (ignora nome)
      const nums = str.match(/\b(\d{3,4})\b/g);
      // Só usa se não houver palavras grandes (3+ letras consecutivas)
      if (nums && !/[a-zA-Z]{3,}/.test(str)) {
        results.push(...nums.map(n => parseInt(n, 10)));
      }
    }
  }
  
  // Deduplicação e filtro de NaN
  return [...new Set(results)].filter(n => !isNaN(n));
}
```

**Status:** ❌ Não implementado

---

### **FASE 3: Auto-Detecção de Header** ⚠️ IMPORTANTE

**Objetivo:** Adicionar busca automática de header nas primeiras 20 linhas.

#### 3.1 Criar Função Helper `findHeaderRow`

**Arquivo:** `src/infrastructure/scripts/import-planilhas.ts`

**Adicionar após linha 99:**

```typescript
/**
 * Auto-detecta a linha de header em um array de linhas brutas.
 * Busca nas primeiras 20 linhas por keywords comuns.
 * 
 * @param rawData Array de arrays (output de sheet_to_json com header: 1)
 * @param keywords Keywords para identificar header (ex: ["nombre", "caso", "fecha"])
 * @returns Índice da linha de header ou 0 se não encontrar
 */
function findHeaderRow(rawData: any[][], keywords: string[]): number {
  for (let i = 0; i < Math.min(rawData.length, 20); i++) {
    if (!rawData[i] || rawData[i].length === 0) continue;
    
    const rowStr = rawData[i]
      .map((c: any) => String(c).toLowerCase().trim())
      .join(" ");
    
    // Verifica se contém pelo menos 2 keywords
    const matchCount = keywords.filter(kw => rowStr.includes(kw)).length;
    if (matchCount >= 2) {
      return i;
    }
  }
  
  return 0; // Fallback: assume linha 0
}
```

**Status:** ❌ Não implementado

---

#### 3.2 Atualizar `extractSheetData` para Usar Auto-Detecção

**Arquivo:** `src/infrastructure/scripts/import-planilhas.ts` (linha 545)

**Substituir função atual por:**

```typescript
const extractSheetData = (sheet: XLSX.WorkSheet, defaultCaso?: string) => {
  const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
  if (rawData.length === 0) return [];

  // Auto-detecta header
  const headerIdx = findHeaderRow(rawData, [
    'nombre', 'postulante', 'fecha', 'presente', 'resultado', 
    'caso', 'telefono', 'email', 'reclutador'
  ]);

  const headers = rawData[headerIdx]?.map((h: any) => String(h).trim().toLowerCase()) || [];
  const rows: Record<string, string>[] = [];
  
  for (let i = headerIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0 || row.every((c: any) => String(c).trim() === "")) continue;
    
    const obj: Record<string, string> = {};
    headers.forEach((h: string, idx: number) => {
      if (h) obj[h] = String(row[idx] || "").trim();
    });
    
    if (defaultCaso && !obj["caso"] && !obj["id caso"]) {
      obj["caso"] = defaultCaso;
    }
    rows.push(obj);
  }
  return rows;
};
```

**Status:** ❌ Não implementado

---

### **FASE 4: Busca Fuzzy de Colunas** ⚠️ IMPORTANTE

**Objetivo:** Adicionar busca fuzzy (includes) na função `col`.

#### 4.1 Criar Função `colFuzzy`

**Arquivo:** `src/infrastructure/scripts/import-planilhas.ts`

**Adicionar após linha 73:**

```typescript
/**
 * Busca fuzzy de coluna: tenta exact match primeiro, depois includes.
 * Similar ao getMatchingKey do Dashboard.
 * 
 * @param row Linha de dados
 * @param keys Array de possíveis nomes de coluna
 * @returns Valor da primeira coluna encontrada ou null
 */
function colFuzzy(row: Record<string, unknown>, ...keys: string[]): unknown {
  const rowKeys = Object.keys(row);
  
  // FASE 1: Exact match
  for (const k of keys) {
    const target = k.toLowerCase().trim();
    for (const rowKey of rowKeys) {
      if (rowKey.toLowerCase().trim() === target) {
        const val = row[rowKey];
        if (val !== undefined && val !== null) return val;
      }
    }
  }
  
  // FASE 2: Includes (fuzzy)
  for (const k of keys) {
    const target = k.toLowerCase().trim();
    for (const rowKey of rowKeys) {
      if (rowKey.toLowerCase().trim().includes(target)) {
        const val = row[rowKey];
        if (val !== undefined && val !== null) return val;
      }
    }
  }
  
  return null;
}
```

**Status:** ❌ Não implementado

---

#### 4.2 Substituir `col` por `colFuzzy` em Locais Críticos

**Arquivos a modificar:**
- `importAnaCare` (linha 261+)
- `importCandidatos` (linha 368+)
- `importBase1` (linha 668+)
- `importClickUp` (nova função)

**Estratégia:** Usar `colFuzzy` para campos críticos (nome, telefone, caso, zona), manter `col` para campos menos importantes.

**Status:** ❌ Não implementado

---

### **FASE 5: Endpoints de Agregação** 🔴 CRÍTICO

**Objetivo:** Criar APIs REST que retornem dados agregados para o Dashboard.

#### 5.1 Criar Controller `AnalyticsController`

**Arquivo:** `src/interfaces/controllers/AnalyticsController.ts` (já existe, expandir)

**Adicionar endpoints:**

```typescript
export class AnalyticsController {
  
  /**
   * GET /api/analytics/global
   * Retorna métricas globais para o painel principal do Dashboard.
   */
  async getGlobalMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, country = 'AR' } = req.query;
      
      const clickUpRepo = new ClickUpCaseRepository();
      const encuadreRepo = new EncuadreRepository();
      const workerRepo = new WorkerRepository();
      const publicationRepo = new PublicationRepository();
      
      // 1. Casos ativos (BUSQUEDA, REEMPLAZO)
      const activeCases = await clickUpRepo.findActiveCases(country as string);
      const busquedaCount = activeCases.filter(c => c.status === 'BUSQUEDA').length;
      const reemplazoCount = activeCases.filter(c => c.status === 'REEMPLAZO' || c.status === 'REEMPLAZOS').length;
      
      // 2. Postulantes em Talentum (workers com funnel_stage = QUALIFIED ou TALENTUM)
      const postulantesCount = await workerRepo.countByFunnelStage(['QUALIFIED', 'TALENTUM'], {
        startDate: startDate as string,
        endDate: endDate as string,
        country: country as string,
      });
      
      // 3. Candidatos em progreso (funnel_stage = PRE_TALENTUM)
      const candidatosCount = await workerRepo.countByFunnelStage(['PRE_TALENTUM'], {
        startDate: startDate as string,
        endDate: endDate as string,
        country: country as string,
      });
      
      // 4. Publicações por canal
      const publicationsByChannel = await publicationRepo.countByChannel({
        startDate: startDate as string,
        endDate: endDate as string,
        country: country as string,
      });
      
      // 5. Encuadres realizados
      const encuadresCount = await encuadreRepo.countAttended({
        startDate: startDate as string,
        endDate: endDate as string,
        country: country as string,
      });
      
      res.json({
        activeCasesCount: activeCases.length,
        busquedaCount,
        reemplazoCount,
        postulantesInTalentumCount: postulantesCount,
        candidatosEnProgresoCount: candidatosCount,
        totalPubs: publicationsByChannel.reduce((sum, p) => sum + p.count, 0),
        pubChartData: publicationsByChannel.map(p => ({ name: p.channel, value: p.count })),
        cantidadEncuadres: encuadresCount,
      });
    } catch (error) {
      console.error('Error in getGlobalMetrics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  /**
   * GET /api/analytics/cases/:caseNumber
   * Retorna métricas detalhadas de um caso específico.
   */
  async getCaseMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { caseNumber } = req.params;
      const { startDate, endDate } = req.query;
      
      const clickUpRepo = new ClickUpCaseRepository();
      const encuadreRepo = new EncuadreRepository();
      const workerApplicationRepo = new WorkerApplicationRepository();
      const publicationRepo = new PublicationRepository();
      const jobPostingRepo = new JobPostingARRepository();
      
      // 1. Buscar job_posting_id
      const jobPosting = await jobPostingRepo.findByCaseNumber(parseInt(caseNumber as string));
      if (!jobPosting) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      
      // 2. Info do ClickUp
      const clickUpCase = await clickUpRepo.findByCaseNumber(parseInt(caseNumber as string));
      
      // 3. Postulados (worker_job_applications)
      const postuladosCount = await workerApplicationRepo.countByJobPosting(jobPosting.id, {
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      // 4. Candidatos (encuadres com status != RECHAZADO/BLACKLIST)
      const candidatosCount = await encuadreRepo.countCandidatesByJobPosting(jobPosting.id, {
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      // 5. Invitados e Asistentes
      const { invitados, asistentes } = await encuadreRepo.countInvitedAndAttended(jobPosting.id, {
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      // 6. Seleccionados e Reemplazos
      const resultados = await encuadreRepo.countByResultado(jobPosting.id, {
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      // 7. Publicações por canal
      const publicationsByChannel = await publicationRepo.countByChannelForJobPosting(jobPosting.id, {
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      // 8. Historial de publicações
      const publicacionesList = await publicationRepo.findByJobPosting(jobPosting.id, {
        startDate: startDate as string,
        endDate: endDate as string,
        orderBy: 'published_at DESC',
      });
      
      res.json({
        clickUpInfo: clickUpCase,
        postuladosCount,
        candidatosCount,
        invitados,
        asistentes,
        asistenciaPct: invitados > 0 ? Math.round((asistentes / invitados) * 100) : 0,
        seleccionadosCount: resultados.find(r => r.resultado === 'SELECCIONADO')?.count || 0,
        reemplazosCount: resultados.find(r => r.resultado === 'REEMPLAZO')?.count || 0,
        pubChartData: publicationsByChannel.map(p => ({ name: p.channel, value: p.count })),
        publicacionesList: publicacionesList.map(p => ({
          fecha: p.publishedAt?.toISOString().split('T')[0] || 'Sin fecha',
          canal: p.channel,
          publicadoPor: p.recruiterName,
          descripcion: p.observations || '',
        })),
        resultadosChartData: resultados.map(r => ({ name: r.resultado, value: r.count })),
      });
    } catch (error) {
      console.error('Error in getCaseMetrics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  /**
   * GET /api/analytics/zones
   * Retorna distribuição de casos por zona.
   */
  async getZoneMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { country = 'AR' } = req.query;
      
      const clickUpRepo = new ClickUpCaseRepository();
      const zonesDistribution = await clickUpRepo.countByZone(country as string);
      
      const total = zonesDistribution.reduce((sum, z) => sum + z.count, 0);
      const nullCount = zonesDistribution.find(z => z.zone === null)?.count || 0;
      const validTotal = total - nullCount;
      const maxCount = Math.max(...zonesDistribution.filter(z => z.zone !== null).map(z => z.count));
      
      const zonas = zonesDistribution
        .filter(z => z.zone !== null)
        .map(z => ({
          name: z.zone,
          count: z.count,
          pct: validTotal > 0 ? Math.round((z.count / validTotal) * 100) : 0,
          pctOfTotal: total > 0 ? Math.round((z.count / total) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);
      
      res.json({
        zonas,
        nullCount,
        nullPct: total > 0 ? ((nullCount / total) * 100).toFixed(1) : "0.0",
        total,
        validTotal,
        maxCount,
      });
    } catch (error) {
      console.error('Error in getZoneMetrics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  /**
   * POST /api/analytics/reemplazos
   * Calcula seleccionados e reemplazos por caso.
   * (Equivalente ao botão "Calcular Reemplazos" do Dashboard)
   */
  async calculateReemplazos(req: Request, res: Response): Promise<void> {
    try {
      const { country = 'AR' } = req.query;
      
      const encuadreRepo = new EncuadreRepository();
      const publicationRepo = new PublicationRepository();
      const workerApplicationRepo = new WorkerApplicationRepository();
      
      // 1. Contar SELECCIONADO e REEMPLAZO por caso
      const reemplazosCounts = await encuadreRepo.countSelAndRemByCaseNumber(country as string);
      
      // 2. Última publicação por caso
      const lastPublications = await publicationRepo.findLastPublicationPerCase(country as string);
      
      // 3. Candidatos (NoTerminaronTalentum) por caso
      const candidatosCounts = await workerApplicationRepo.countCandidatesByCaseNumber(country as string);
      
      // 4. Postulados (Talentum) por caso
      const postuladosCounts = await workerApplicationRepo.countPostuladosByCaseNumber(country as string);
      
      res.json({
        reemplazosCounts, // { "502": { sel: 3, rem: 2 }, ... }
        lastPubDates: lastPublications.reduce((acc, p) => {
          acc[p.caseNumber] = p.timeAgo;
          return acc;
        }, {} as Record<string, string>),
        lastPubChannels: lastPublications.reduce((acc, p) => {
          acc[p.caseNumber] = p.channel;
          return acc;
        }, {} as Record<string, string>),
        candidatosCounts, // { "502": 15, ... }
        postuladosCounts, // { "502": 42, ... }
      });
    } catch (error) {
      console.error('Error in calculateReemplazos:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
```

**Status:** ❌ Não implementado

---

#### 5.2 Adicionar Métodos nos Repositories

**Arquivos a modificar:**

**`ClickUpCaseRepository.ts`:**
- `findActiveCases(country: string)`
- `countByZone(country: string)`

**`WorkerRepository.ts`:**
- `countByFunnelStage(stages: string[], filters: { startDate?, endDate?, country? })`

**`EncuadreRepository.ts`:**
- `countAttended(filters: { startDate?, endDate?, country? })`
- `countCandidatesByJobPosting(jobPostingId: string, filters)`
- `countInvitedAndAttended(jobPostingId: string, filters)`
- `countByResultado(jobPostingId: string, filters)`
- `countSelAndRemByCaseNumber(country: string)`

**`PublicationRepository.ts`:**
- `countByChannel(filters: { startDate?, endDate?, country? })`
- `countByChannelForJobPosting(jobPostingId: string, filters)`
- `findByJobPosting(jobPostingId: string, filters)`
- `findLastPublicationPerCase(country: string)`

**`WorkerApplicationRepository.ts`:**
- `countByJobPosting(jobPostingId: string, filters)`
- `countCandidatesByCaseNumber(country: string)`
- `countPostuladosByCaseNumber(country: string)`

**Status:** ❌ Não implementado

---

#### 5.3 Registrar Rotas no Express

**Arquivo:** `src/index.ts`

**Adicionar após linha de registro de outros controllers:**

```typescript
import { AnalyticsController } from './interfaces/controllers/AnalyticsController';

const analyticsController = new AnalyticsController();

app.get('/api/analytics/global', analyticsController.getGlobalMetrics.bind(analyticsController));
app.get('/api/analytics/cases/:caseNumber', analyticsController.getCaseMetrics.bind(analyticsController));
app.get('/api/analytics/zones', analyticsController.getZoneMetrics.bind(analyticsController));
app.post('/api/analytics/reemplazos', analyticsController.calculateReemplazos.bind(analyticsController));
```

**Status:** ❌ Não implementado

---

### **FASE 6: Adaptar Dashboard para Consumir API** 🔵 FUTURO

**Objetivo:** Modificar Dashboard para buscar dados via API ao invés de processar localmente.

#### 6.1 Criar Service Layer no Dashboard

**Arquivo:** `app/services/api.ts` (novo)

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export async function fetchGlobalMetrics(filters: {
  startDate?: string;
  endDate?: string;
  country?: string;
}) {
  const params = new URLSearchParams(filters as any);
  const res = await fetch(`${API_BASE_URL}/api/analytics/global?${params}`);
  if (!res.ok) throw new Error('Failed to fetch global metrics');
  return res.json();
}

export async function fetchCaseMetrics(caseNumber: string, filters: {
  startDate?: string;
  endDate?: string;
}) {
  const params = new URLSearchParams(filters as any);
  const res = await fetch(`${API_BASE_URL}/api/analytics/cases/${caseNumber}?${params}`);
  if (!res.ok) throw new Error('Failed to fetch case metrics');
  return res.json();
}

export async function fetchZoneMetrics(country: string = 'AR') {
  const res = await fetch(`${API_BASE_URL}/api/analytics/zones?country=${country}`);
  if (!res.ok) throw new Error('Failed to fetch zone metrics');
  return res.json();
}

export async function calculateReemplazos(country: string = 'AR') {
  const res = await fetch(`${API_BASE_URL}/api/analytics/reemplazos?country=${country}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to calculate reemplazos');
  return res.json();
}
```

**Status:** ❌ Não implementado

---

#### 6.2 Substituir Lógica Local por Chamadas API

**Arquivo:** `app/page.tsx`

**Modificar `useMemo` de `globalMetrics` (linha 1088):**

```typescript
const globalMetrics = useMemo(() => {
  // ANTES: processamento local
  // DEPOIS: chamada API
  const [metrics, setMetrics] = useState(null);
  
  useEffect(() => {
    fetchGlobalMetrics({
      startDate: customStartDate,
      endDate: customEndDate,
      country: 'AR',
    }).then(setMetrics);
  }, [dateFilter, customStartDate, customEndDate]);
  
  return metrics;
}, [dateFilter, customStartDate, customEndDate]);
```

**Status:** ❌ Não implementado (FUTURO)

---

## 📊 Checklist de Implementação

### **FASE 1: Importador ClickUp** 🔴 CRÍTICO

- [ ] 1.1 Criar migration `clickup_cases` table
- [ ] 1.2 Criar `ClickUpCaseRepository.ts`
  - [ ] Método `upsertByCaseNumber`
  - [ ] Método `findByCaseNumber`
  - [ ] Método `findActiveCases`
  - [ ] Método `findByZone`
  - [ ] Método `countByZone`
- [ ] 1.3 Adicionar `importClickUp` em `PlanilhaImporter`
- [ ] 1.4 Adicionar tipo `'clickup'` ao enum `SpreadsheetType`
- [ ] 1.5 Atualizar `detectType` para reconhecer ClickUp
- [ ] 1.6 Adicionar rota no `importBuffer`
- [ ] 1.7 Testar import com arquivo ClickUp real
- [ ] 1.8 Validar dados persistidos no PostgreSQL

### **FASE 2: Melhorar Extração de Casos** 🔴 CRÍTICO

- [ ] 2.1 Atualizar `parseTalentSearchCaseNumbers` com fallback robusto
- [ ] 2.2 Testar com casos reais:
  - [ ] Formato `"CASO 502, CASO 492"`
  - [ ] Formato `"502, 492, 418"` (números puros)
  - [ ] Formato `"502 - 492"` (com hífen)
  - [ ] Formato `"502; 492 & 418"` (pontuação mista)
- [ ] 2.3 Validar que não extrai falsos positivos (ex: diagnósticos com números)

### **FASE 3: Auto-Detecção de Header** ⚠️ IMPORTANTE

- [ ] 3.1 Criar função `findHeaderRow`
- [ ] 3.2 Atualizar `extractSheetData` para usar auto-detecção
- [ ] 3.3 Testar com arquivos que têm:
  - [ ] Header na linha 0 (caso normal)
  - [ ] Header na linha 2-5 (com metadados no topo)
  - [ ] Header na linha 10+ (arquivo mal-formatado)
- [ ] 3.4 Validar que não quebra imports existentes

### **FASE 4: Busca Fuzzy de Colunas** ⚠️ IMPORTANTE

- [ ] 4.1 Criar função `colFuzzy`
- [ ] 4.2 Substituir `col` por `colFuzzy` em:
  - [ ] `importAnaCare` (campos críticos)
  - [ ] `importCandidatos` (campos críticos)
  - [ ] `importBase1` (campos críticos)
  - [ ] `importClickUp` (todos os campos)
- [ ] 4.3 Testar com variações de nomes de colunas:
  - [ ] `"Zona"` vs `"Zona o Barrio Paciente"`
  - [ ] `"Telefono"` vs `"Numeros de telefono"`
  - [ ] `"Caso"` vs `"Caso Número (number)"`

### **FASE 5: Endpoints de Agregação** 🔴 CRÍTICO

#### 5.1 Repository Methods

**ClickUpCaseRepository:**
- [ ] `findActiveCases(country: string)`
- [ ] `countByZone(country: string)`

**WorkerRepository:**
- [ ] `countByFunnelStage(stages: string[], filters)`

**EncuadreRepository:**
- [ ] `countAttended(filters)`
- [ ] `countCandidatesByJobPosting(jobPostingId, filters)`
- [ ] `countInvitedAndAttended(jobPostingId, filters)`
- [ ] `countByResultado(jobPostingId, filters)`
- [ ] `countSelAndRemByCaseNumber(country)`

**PublicationRepository:**
- [ ] `countByChannel(filters)`
- [ ] `countByChannelForJobPosting(jobPostingId, filters)`
- [ ] `findByJobPosting(jobPostingId, filters)`
- [ ] `findLastPublicationPerCase(country)`

**WorkerApplicationRepository:**
- [ ] `countByJobPosting(jobPostingId, filters)`
- [ ] `countCandidatesByCaseNumber(country)`
- [ ] `countPostuladosByCaseNumber(country)`

#### 5.2 Controller Endpoints

- [ ] `GET /api/analytics/global`
  - [ ] Implementar lógica
  - [ ] Testar com Postman/curl
  - [ ] Validar formato de resposta
- [ ] `GET /api/analytics/cases/:caseNumber`
  - [ ] Implementar lógica
  - [ ] Testar com caso real
  - [ ] Validar formato de resposta
- [ ] `GET /api/analytics/zones`
  - [ ] Implementar lógica
  - [ ] Testar com dados reais
  - [ ] Validar formato de resposta
- [ ] `POST /api/analytics/reemplazos`
  - [ ] Implementar lógica
  - [ ] Testar cálculo de sel/rem
  - [ ] Validar formato de resposta

#### 5.3 Rotas Express

- [ ] Registrar rotas no `src/index.ts`
- [ ] Adicionar middleware de autenticação (se necessário)
- [ ] Adicionar CORS para Dashboard
- [ ] Testar endpoints end-to-end

### **FASE 6: Adaptar Dashboard** 🔵 FUTURO

- [ ] 6.1 Criar `app/services/api.ts`
- [ ] 6.2 Substituir `globalMetrics` por chamada API
- [ ] 6.3 Substituir `caseMetrics` por chamada API
- [ ] 6.4 Substituir `zonasMetrics` por chamada API
- [ ] 6.5 Substituir `calculateReemplazos` por chamada API
- [ ] 6.6 Remover processamento local de arquivos
- [ ] 6.7 Adicionar loading states
- [ ] 6.8 Adicionar error handling
- [ ] 6.9 Testar integração completa

---

## 🧪 Plano de Testes

### Testes Unitários

- [ ] `parseTalentSearchCaseNumbers` com todos os formatos
- [ ] `findHeaderRow` com diferentes posições de header
- [ ] `colFuzzy` com variações de nomes
- [ ] `normalizePhoneAR` com diferentes formatos

### Testes de Integração

- [ ] Import completo de arquivo ClickUp
- [ ] Import completo de arquivo Candidatos (com fallback de casos)
- [ ] Endpoints de analytics retornam dados corretos
- [ ] Filtros de data funcionam corretamente

### Testes E2E

- [ ] Upload de arquivo ClickUp → dados aparecem em `/api/analytics/global`
- [ ] Upload de Candidatos → contagem de postulantes correta
- [ ] Cálculo de reemplazos → cores corretas na tabela
- [ ] Dashboard consome API → métricas idênticas ao processamento local

---

## 📈 Métricas de Sucesso

### Critérios de Aceitação

1. **Importador ClickUp:**
   - ✅ Processa arquivo ClickUp sem erros
   - ✅ Extrai 100% dos casos ativos
   - ✅ Persiste zona, diagnóstico, prioridade corretamente

2. **Extração de Casos:**
   - ✅ Extrai casos no formato `"CASO NNN"` (100% de precisão)
   - ✅ Extrai casos em formato numérico puro (95%+ de precisão)
   - ✅ Não extrai falsos positivos (0% de falsos positivos)

3. **Endpoints de Agregação:**
   - ✅ `/api/analytics/global` retorna em <500ms
   - ✅ `/api/analytics/cases/:id` retorna em <300ms
   - ✅ Dados idênticos ao processamento local do Dashboard (100% de precisão)

4. **Dashboard Adaptado:**
   - ✅ Carrega métricas via API em <1s
   - ✅ Filtros de data funcionam corretamente
   - ✅ UX idêntica ao Dashboard atual

---

## 🚀 Ordem de Implementação Recomendada

### Sprint 1 (Semana 1) - Fundação
1. FASE 1.1-1.2: Criar tabela e repository ClickUp
2. FASE 2.1: Melhorar extração de casos
3. FASE 3.1-3.2: Auto-detecção de header

### Sprint 2 (Semana 2) - Import ClickUp
4. FASE 1.3-1.7: Implementar `importClickUp` completo
5. FASE 4.1-4.3: Busca fuzzy de colunas
6. Testes de integração do import

### Sprint 3 (Semana 3) - APIs
7. FASE 5.1: Implementar métodos nos repositories
8. FASE 5.2: Implementar endpoints do controller
9. FASE 5.3: Registrar rotas e testar

### Sprint 4 (Semana 4) - Integração
10. FASE 6.1-6.5: Adaptar Dashboard para consumir API
11. Testes E2E completos
12. Deploy e validação em produção

---

## 📝 Notas Importantes

### Decisões Arquiteturais

1. **Por que não processar ClickUp antes?**
   - Dashboard foi criado primeiro como MVP client-side
   - Worker-functions focou em workers/encuadres (dados operacionais)
   - ClickUp tem dados de "casos" (job_postings) que não eram prioridade inicial

2. **Por que fallback de extração de casos?**
   - Formato da coluna "Pre screenings" mudou ao longo do tempo
   - Alguns recrutadores digitam apenas números sem "CASO" prefix
   - Robustez é crítica para não perder dados

3. **Por que auto-detecção de header?**
   - Arquivos exportados do ClickUp às vezes têm linhas de metadados
   - Usuários podem adicionar notas no topo da planilha
   - Robustez evita falhas silenciosas

### Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Formato ClickUp muda | Alta | Alto | Testes automatizados + alertas |
| Performance de agregação | Média | Médio | Índices no PostgreSQL + cache |
| Dados inconsistentes | Baixa | Alto | Validação rigorosa no import |
| Breaking change na API | Baixa | Alto | Versionamento de API (v1, v2) |

### Dependências Externas

- PostgreSQL 14+
- Node.js 18+
- TypeScript 5+
- Express 4+
- XLSX library (já instalada)

---

## 🔗 Referências

- Dashboard atual: `@/Users/gabrielstein-dev/projects/enlite/DashboardReclutamientoEnlite-main`
- Worker-Functions: `@/Users/gabrielstein-dev/projects/enlite/worker-functions`
- Documentação de agentes: `@/DashboardReclutamientoEnlite-main/Agents.MD`
- Documentação técnica: `@/DashboardReclutamientoEnlite-main/AgentsDev.MD`

---

**Última atualização:** 22 de março de 2026  
**Responsável:** Lucas (via Cascade AI)  
**Status:** 🔴 Aguardando implementação
