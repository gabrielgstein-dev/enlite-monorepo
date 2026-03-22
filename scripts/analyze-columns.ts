#!/usr/bin/env ts-node
import * as XLSX from 'xlsx';
import * as path from 'path';

const excelDir = path.join(__dirname, '../docs/excel');

console.log('=== ANÁLISE COMPLETA DE COLUNAS DISPONÍVEIS ===\n');

// Ana Care Control.xlsx
console.log('📄 1. Ana Care Control.xlsx');
console.log('─'.repeat(80));
const anaCare = XLSX.readFile(path.join(excelDir, 'Ana Care Control.xlsx'));
const anaCareSheet = anaCare.Sheets[anaCare.SheetNames[0]];
const anaCareRows = XLSX.utils.sheet_to_json(anaCareSheet, { defval: null });
const anaCareColumns = Object.keys(anaCareRows[0] || {});
console.log('Colunas disponíveis:', anaCareColumns.length);
anaCareColumns.forEach((col, i) => console.log(`  ${i + 1}. ${col}`));
console.log('Total rows:', anaCareRows.length);

// CANDIDATOS.xlsx
console.log('\n📄 2. CANDIDATOS.xlsx');
console.log('─'.repeat(80));
const candidatos = XLSX.readFile(path.join(excelDir, 'CANDIDATOS.xlsx'));
console.log('Sheets:', candidatos.SheetNames.join(', '));

// Talentum
if (candidatos.Sheets['Talentum']) {
  console.log('\n  📋 Aba: Talentum');
  const talentumRows = XLSX.utils.sheet_to_json(candidatos.Sheets['Talentum'], { defval: null });
  const talentumColumns = Object.keys(talentumRows[0] || {});
  console.log('  Colunas disponíveis:', talentumColumns.length);
  talentumColumns.forEach((col, i) => console.log(`    ${i + 1}. ${col}`));
  console.log('  Total rows:', talentumRows.length);
}

// NoTerminaronTalentum
if (candidatos.Sheets['NoTerminaronTalentum']) {
  console.log('\n  📋 Aba: NoTerminaronTalentum');
  const noTerminaronRows = XLSX.utils.sheet_to_json(candidatos.Sheets['NoTerminaronTalentum'], { defval: null });
  const noTerminaronColumns = Object.keys(noTerminaronRows[0] || {});
  console.log('  Colunas disponíveis:', noTerminaronColumns.length);
  noTerminaronColumns.forEach((col, i) => console.log(`    ${i + 1}. ${col}`));
  console.log('  Total rows:', noTerminaronRows.length);
}

// NoUsarMás
if (candidatos.Sheets['NoUsarMás']) {
  console.log('\n  📋 Aba: NoUsarMás');
  const noUsarRows = XLSX.utils.sheet_to_json(candidatos.Sheets['NoUsarMás'], { defval: null });
  const noUsarColumns = Object.keys(noUsarRows[0] || {});
  console.log('  Colunas disponíveis:', noUsarColumns.length);
  noUsarColumns.forEach((col, i) => console.log(`    ${i + 1}. ${col}`));
  console.log('  Total rows:', noUsarRows.length);
}

// CSV TalentSearch
console.log('\n📄 3. export_2026-03-20.csv (TalentSearch)');
console.log('─'.repeat(80));
const csv = XLSX.readFile(path.join(excelDir, 'export_2026-03-20.csv'));
const csvRows = XLSX.utils.sheet_to_json(csv.Sheets[csv.SheetNames[0]], { defval: null });
const csvColumns = Object.keys(csvRows[0] || {});
console.log('Colunas disponíveis:', csvColumns.length);
csvColumns.forEach((col, i) => console.log(`  ${i + 1}. ${col}`));
console.log('Total rows:', csvRows.length);

console.log('\n✅ Análise concluída!');
