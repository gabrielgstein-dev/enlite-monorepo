# /new-converter — Criar novo Converter de arquivo

Usado quando: **uma nova fonte de dados (planilha, CSV, exportação)** precisa ser integrada ao sistema de import.

Fontes existentes para referência: `TalentumConverter`, `ClickUpConverter`, `PlanilhaOperativaConverter`, `AnaCareConverter`.

---

## Passos obrigatórios (nessa ordem)

### 1. Criar o DTO da linha

Arquivo: `src/infrastructure/converters/XyzRowDTO.ts` (ou inline no converter se for simples)

```typescript
export interface XyzRowDTO {
  // Campos brutos da planilha, ainda como string/null
  // Nomes em camelCase, sufixo "Raw" para valores não normalizados
  rawName: string | null;
  rawPhone: string | null;
  email: string | null;
  // ...
}
```

Regras do DTO:
- Campos opcionais são `| null`, nunca `| undefined`
- Nomes refletem o campo do domínio, não o nome da coluna da planilha
- Sem lógica de negócio — só a forma dos dados

---

### 2. Criar o Converter

Arquivo: `src/infrastructure/converters/XyzConverter.ts`

```typescript
import XLSX from 'xlsx';
import { IFileConverter, ImportFileType } from '../../domain/ports/IFileConverter';
import { col, colFuzzy, normalizePhoneAR, normalizeProperName, normalizeEmail } from '../scripts/import-utils';
import { XyzRowDTO } from './XyzRowDTO';

export class XyzConverter implements IFileConverter<XyzRowDTO> {
  readonly type: ImportFileType = 'xyz'; // adicionar ao tipo ImportFileType

  /**
   * Detecta se este converter é responsável pelo arquivo.
   * Baseado em: nome do arquivo e/ou presença de colunas-chave.
   */
  canHandle(buffer: Buffer, filename: string): boolean {
    return filename.toLowerCase().includes('xyz');
    // OU: verificar coluna-chave na primeira linha da planilha
  }

  async parse(buffer: Buffer): Promise<XyzRowDTO[]> {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    const result: XyzRowDTO[] = [];

    for (const row of rows as Record<string, unknown>[]) {
      // Usar col() para match exato, colFuzzy() para match por substring
      const rawName = col(row, 'Nome', 'Nombre', 'Worker Name') ?? null;
      const rawPhone = col(row, 'Celular', 'Teléfono', 'Phone') ?? null;

      // Ignorar linhas completamente vazias
      if (!rawName && !rawPhone) continue;

      result.push({
        rawName: normalizeProperName(rawName),
        rawPhone: normalizePhoneAR(rawPhone),
        email: normalizeEmail(col(row, 'Email') ?? null),
      });
    }

    return result;
  }
}
```

Regras do Converter:
- **Nunca** acessar banco de dados
- **Nunca** lançar exceção por linha inválida — retornar `null` nos campos problemáticos
- **Sempre** usar `col()` ou `colFuzzy()` de `import-utils.ts` para ler colunas
- **Sempre** usar as funções de normalização de `import-utils.ts`
- Linhas totalmente vazias são ignoradas (continue)

---

### 3. Registrar no ConverterRegistry

Arquivo: `src/infrastructure/converters/index.ts`

```typescript
import { XyzConverter } from './XyzConverter';

const CONVERTERS: IFileConverter<unknown>[] = [
  new AnaCareConverter(),
  new ClickUpConverter(),
  new PlanilhaOperativaConverter(),
  new TalentumConverter(),
  new XyzConverter(), // ← adicionar aqui
];
```

Ordem importa: converters mais específicos primeiro (evitar falso positivo em `canHandle()`).

---

### 4. Adicionar tipo ao `ImportFileType`

Arquivo: `src/domain/ports/IFileConverter.ts`

```typescript
export type ImportFileType =
  | 'talentum'
  | 'clickup'
  | 'planilla_operativa'
  | 'ana_care'
  | 'xyz'; // ← adicionar
```

---

### 5. Implementar a persistência no `PlanilhaImporter`

Arquivo: `src/infrastructure/scripts/import-planilhas.ts` (ou seu substituto)

Adicionar método `persistXyz(rows: XyzRowDTO[], jobId: string, onProgress?)` que:
- Itera as linhas
- Chama o repositório adequado com `upsert()`
- Atualiza `progress` a cada `CHUNK_SIZE` linhas
- Captura erros por linha (nunca re-throw)

---

### 6. Adicionar comando CLI

Arquivo: `package.json`

```json
"import:xyz": "ts-node -e \"require('./scripts/import-xyz')\"",
"import:xyz:dry": "ts-node -e \"require('./scripts/import-xyz')\" -- --dry-run"
```

Criar `scripts/import-xyz.ts` (máximo 50 linhas, sem lógica de negócio).

---

### 7. Criar fixture e testes

```
tests/fixtures/xyz-sample.xlsx    ← planilha anonimizada com dados representativos
tests/unit/converters/XyzConverter.test.ts
```

Testes obrigatórios:
- `canHandle()` retorna `true` para arquivo válido
- `canHandle()` retorna `false` para outro tipo de arquivo
- `parse()` retorna DTO correto para linha válida
- `parse()` retorna `null` nos campos para linha com dados inválidos
- `parse()` ignora linhas totalmente vazias
- Normalização de telefone (com e sem código de país)
- Normalização de nome (title case)

---

### 8. Atualizar `docs/IMPLEMENTATION_RULES.md`

Adicionar a nova fonte na tabela de tipos suportados.

---

## Checklist final

- [ ] DTO tipado criado
- [ ] `canHandle()` implementado e testado
- [ ] `parse()` usa apenas `import-utils.ts` para normalização
- [ ] Converter registrado em `converters/index.ts`
- [ ] `ImportFileType` atualizado
- [ ] Persistência implementada no Importer
- [ ] Sequência pós-import incluída (linkWorkersByPhone, sync)
- [ ] Comando CLI em `package.json`
- [ ] Script CLI criado (< 80 linhas, sem lógica)
- [ ] Fixture anonimizada criada em `tests/fixtures/`
- [ ] Testes unitários do converter criados
- [ ] `docs/IMPLEMENTATION_RULES.md` atualizado
