/**
 * Seed de parceiros de webhook.
 *
 * Insere um parceiro na tabela webhook_partners com o displayName
 * da API Key do GCP Console e os paths permitidos.
 *
 * Uso:
 *   npx ts-node scripts/seed-webhook-partners.ts \
 *     --name talentum \
 *     --display-name "API-Key-Talentum" \
 *     --paths "talentum/*"
 *
 * A chave de API já existe no GCP Console — este script apenas
 * registra o mapeamento de autorização no banco.
 */

import { Pool } from 'pg';

async function main() {
  const args = process.argv.slice(2);
  const name = getArg(args, '--name');
  const displayName = getArg(args, '--display-name');
  const pathsRaw = getArg(args, '--paths');

  if (!name || !displayName || !pathsRaw) {
    console.error('Uso: npx ts-node scripts/seed-webhook-partners.ts --name <name> --display-name <displayName> --paths <path1,path2>');
    process.exit(1);
  }

  const allowedPaths = pathsRaw.split(',').map(p => p.trim());

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const result = await pool.query(
      `INSERT INTO webhook_partners (name, display_name, allowed_paths)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET
         display_name  = EXCLUDED.display_name,
         allowed_paths = EXCLUDED.allowed_paths,
         updated_at    = NOW()
       RETURNING id, name, display_name, allowed_paths`,
      [name, displayName, allowedPaths],
    );

    const row = result.rows[0];
    console.log(`Parceiro registrado:`);
    console.log(`  ID:           ${row.id}`);
    console.log(`  Name:         ${row.name}`);
    console.log(`  Display Name: ${row.display_name}`);
    console.log(`  Paths:        ${row.allowed_paths.join(', ')}`);
  } finally {
    await pool.end();
  }
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
