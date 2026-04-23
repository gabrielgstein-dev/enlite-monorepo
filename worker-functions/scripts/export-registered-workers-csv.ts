#!/usr/bin/env ts-node
/**
 * export-registered-workers-csv.ts
 *
 * Script one-shot para exportar prestadores (workers) com documentação completa
 * (status = 'REGISTERED') para CSV, descriptografando campos PII via KMSEncryptionService.
 *
 * Saída: /tmp/prestadores_documentacion_completa_2026-04-21.csv
 *
 * ── Pré-requisitos ──────────────────────────────────────────────────────────
 *   - gcloud autenticado no projeto enlite-prd
 *   - Cloud SQL Proxy rodando na porta 5435 apontando para enlite-ar-db
 *   - Credenciais Application Default com permissão no KMS keyring enlite-keyring
 *
 * ── Como executar ──────────────────────────────────────────────────────────
 *   1. Inicie o Cloud SQL Proxy (em background, se não estiver rodando):
 *        cloud-sql-proxy --port 5435 enlite-prd:southamerica-west1:enlite-ar-db &
 *
 *   2. Obtenha a senha do Secret Manager:
 *        DB_PASSWORD=$(gcloud secrets versions access latest --secret=enlite-ar-db-password)
 *
 *   3. Execute:
 *        PROD_DATABASE_URL="postgresql://enlite_app:${DB_PASSWORD}@127.0.0.1:5435/enlite_ar" \
 *          GCP_PROJECT_ID=enlite-prd \
 *          npx ts-node -r tsconfig-paths/register scripts/export-registered-workers-csv.ts
 *
 * ── Escolhas arquiteturais ─────────────────────────────────────────────────
 *   - KMSEncryptionService: reutilizado de src/shared/security/KMSEncryptionService.ts.
 *     O método decrypt() retorna '' para campos nulos/vazios — tratado como campo ausente.
 *
 *   - JOIN com worker_service_areas: tabela é 1-N por worker.
 *     Critério de seleção: DISTINCT ON (w.id) ORDER BY w.id, sa.created_at DESC
 *     → pega o endereço cadastrado mais recentemente por worker.
 *     Motivo: o endereço mais recente é o mais provável de estar correto/atualizado.
 *
 *   - phone: lido da coluna plaintext workers.phone (não phone_encrypted), que é a
 *     coluna operacional usada pelas queries existentes (WorkerAuthRepository, WorkerRepository).
 *
 *   - Erros de decrypt por worker: logados e campo deixado vazio — batch não aborta.
 *
 *   - CSV: RFC 4180 implementado manualmente (sem dependência externa).
 */

/* eslint-disable no-console */
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

// Caminho relativo ao script → resolve para src/ corretamente com ts-node
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { KMSEncryptionService } = require(
  path.join(__dirname, '..', 'src', 'shared', 'security', 'KMSEncryptionService'),
) as { KMSEncryptionService: typeof import('../src/shared/security/KMSEncryptionService').KMSEncryptionService };

// ── Configuração ────────────────────────────────────────────────────────────

const OUTPUT_FILE = '/tmp/prestadores_documentacion_completa_2026-04-21.csv';

const PROD_DATABASE_URL = process.env.PROD_DATABASE_URL;

if (!PROD_DATABASE_URL) {
  console.error('PROD_DATABASE_URL é obrigatório.');
  console.error('Consulte os comentários no topo deste arquivo para instruções de execução.');
  process.exit(1);
}

// ── Tipo de linha raw vindo do banco ────────────────────────────────────────

interface WorkerRow {
  id: string;
  email: string;
  phone: string | null;
  profession: string | null;
  document_type: string | null;
  country: string | null;
  first_name_encrypted: string | null;
  last_name_encrypted: string | null;
  gender_encrypted: string | null;
  birth_date_encrypted: string | null;
  document_number_encrypted: string | null;
  // service area (pode ser null se LEFT JOIN não encontrar)
  address_line: string | null;
  city: string | null;
  postal_code: string | null;
}

// ── CSV RFC 4180 ────────────────────────────────────────────────────────────

/**
 * Escapa um valor de célula conforme RFC 4180:
 *   - Se contiver vírgula, aspas duplas ou quebra de linha → envolve em aspas duplas.
 *   - Aspas duplas internas são duplicadas.
 *   - null/undefined → string vazia (sem aspas).
 */
function csvCell(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: Array<string | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

// ── Query principal ─────────────────────────────────────────────────────────

const QUERY = `
  SELECT DISTINCT ON (w.id)
    w.id,
    w.email,
    w.phone,
    w.profession,
    w.document_type,
    w.country,
    w.first_name_encrypted,
    w.last_name_encrypted,
    w.gender_encrypted,
    w.birth_date_encrypted,
    w.document_number_encrypted,
    sa.address_line,
    sa.city,
    sa.postal_code
  FROM workers w
  LEFT JOIN worker_service_areas sa ON sa.worker_id = w.id
  WHERE w.status = 'REGISTERED'
  ORDER BY w.id, sa.created_at DESC NULLS LAST
`;

// ── Descriptografia segura (não aborta o batch) ─────────────────────────────

async function safeDecrypt(
  kms: InstanceType<typeof KMSEncryptionService>,
  ciphertext: string | null | undefined,
  workerId: string,
  fieldName: string,
): Promise<string> {
  if (!ciphertext) return '';
  try {
    return await kms.decrypt(ciphertext);
  } catch (err: any) {
    console.warn(`  [WARN] worker ${workerId} — falha ao descriptografar ${fieldName}: ${err.message}`);
    return '';
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: PROD_DATABASE_URL });
  const kms = new KMSEncryptionService();

  try {
    console.log('Conectando ao banco de produção...');
    const result = await pool.query<WorkerRow>(QUERY);
    const rows = result.rows;
    console.log(`Workers com status REGISTERED encontrados: ${rows.length}`);

    if (rows.length === 0) {
      console.log('Nenhum worker encontrado. CSV não gerado.');
      return;
    }

    // Cabeçalho
    const header = 'Nombre,Apellido,Género,Tipo de Profesional,Teléfono,Domicilio,Ciudad,Código Postal,Fecha de nacimiento,CUIT/CUIL,Email';
    const lines: string[] = [header];

    // Processar em série para não sobrecarregar o KMS (cada worker = 5 chamadas decrypt)
    // Se necessário, pode ser paralelizado em lotes (Promise.all com chunks de 10-20).
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const idx = i + 1;

      if (idx % 10 === 0 || idx === rows.length) {
        console.log(`  Processando ${idx}/${rows.length}...`);
      }

      const [firstName, lastName, gender, birthDate, documentNumber] = await Promise.all([
        safeDecrypt(kms, row.first_name_encrypted, row.id, 'first_name_encrypted'),
        safeDecrypt(kms, row.last_name_encrypted,  row.id, 'last_name_encrypted'),
        safeDecrypt(kms, row.gender_encrypted,     row.id, 'gender_encrypted'),
        safeDecrypt(kms, row.birth_date_encrypted, row.id, 'birth_date_encrypted'),
        safeDecrypt(kms, row.document_number_encrypted, row.id, 'document_number_encrypted'),
      ]);

      lines.push(csvRow([
        firstName,
        lastName,
        gender,
        row.profession,
        row.phone,
        row.address_line,
        row.city,
        row.postal_code,
        birthDate,
        documentNumber,
        row.email,
      ]));
    }

    const csvContent = lines.join('\r\n') + '\r\n';
    fs.writeFileSync(OUTPUT_FILE, csvContent, 'utf8');

    console.log(`\nExportacao concluida.`);
    console.log(`  Total de registros: ${rows.length}`);
    console.log(`  Arquivo: ${OUTPUT_FILE}`);
    console.log(`  Tamanho: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
