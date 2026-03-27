/**
 * generate-test-fixtures.js
 *
 * Gera arquivos de fixture para os testes E2E do import pipeline.
 * Executar uma vez: node scripts/generate-test-fixtures.js
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const FIXTURES_DIR = path.join(__dirname, '../tests/e2e/fixtures');

if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

// ──────────────────────────────────────────────
// 1. Talentum CSV  (tipo: talent_search)
//    Detectado por: filename.endsWith('.csv')
//    + colunas 'Pre screenings' e 'Numeros de telefono'
// ──────────────────────────────────────────────
function generateTalentumCSV() {
  const rows = [
    ['Nombre', 'Apellido', 'Numeros de telefono', 'Emails', 'CUIT', 'Status', 'Pre screenings', 'Linkedin'],
    ['María', 'García', '5491112345678', 'maria.garcia@test.com', '27123456789', 'QUALIFIED', '001', ''],
    ['Juan', 'López', '5491187654321', 'juan.lopez@test.com', '20987654321', 'PRE_TALENTUM', '', ''],
    ['Ana', 'Martínez', '', '', '', 'QUALIFIED', '002', ''], // sem phone E sem email → gera erro contável
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  fs.writeFileSync(path.join(FIXTURES_DIR, 'talentum_sample.csv'), csv, 'utf-8');
  console.log('✓ talentum_sample.csv');
}

// ──────────────────────────────────────────────
// 2. Planilha Operativa XLSX  (tipo: planilla_operativa)
//    Detectado por: sheet name contém '_base1'
// ──────────────────────────────────────────────
function generatePlanilhaOperativaXLSX() {
  const wb = XLSX.utils.book_new();

  // Aba _Base1
  const base1Rows = [
    ['CASO', 'TELEFONO', 'NOMBRE Y APELLIDO', 'FECHA RECLUTAMIENTO', 'FECHA ENCUADRE', 'HORA ENCUADRE', 'CORREO', 'OCUPACION', 'RECLUTADOR', 'RESULTADO'],
    ['001', '5491112345678', 'María García', '2026-01-10', '2026-01-15', '10:00', 'maria.garcia@test.com', 'AT', 'Reclutador1', 'INGRESÓ'],
    ['001', '5491187654321', 'Juan López', '2026-01-11', '2026-01-16', '14:00', 'juan.lopez@test.com', 'Cuidador', 'Reclutador1', 'RECHAZADO'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(base1Rows), '_Base1');

  // Aba _Índice (opcional mas realista)
  const indiceRows = [
    ['CASO', 'ESTADO', 'PRIORIDAD', 'DEPENDENCIA', 'COORDINADOR'],
    ['001', 'ACTIVO', 'ALTA', '8hs', 'Coordinador1'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(indiceRows), '_Índice');

  XLSX.writeFile(wb, path.join(FIXTURES_DIR, 'planilha_operativa.xlsx'));
  console.log('✓ planilha_operativa.xlsx');
}

// ──────────────────────────────────────────────
// 3. ClickUp XLSX  (tipo: clickup)
//    Detectado por: filename contém 'clickup'
// ──────────────────────────────────────────────
function generateClickUpXLSX() {
  const wb = XLSX.utils.book_new();

  const rows = [
    ['Task Type', 'Task ID', 'Estado', 'Caso Número (Number)', 'Nombre de Paciente', 'Apellido del Paciente', 'Número de WhatsApp Paciente', 'Provincia del Paciente', 'Priority', 'Date Created'],
    ['task', 'CU-001', 'BÚSQUEDA', '101', 'Carlos', 'Fernández', '5491155554444', 'Buenos Aires', 'urgent', '2026-01-01'],
    ['task', 'CU-002', 'ACTIVO', '102', 'Laura', 'Ruiz', '5491166667777', 'Córdoba', 'normal', '2026-01-02'],
    ['milestone', 'CU-003', 'CERRADO', '', '', '', '', '', 'low', '2026-01-03'], // não é 'task' — deve ser ignorado
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  XLSX.writeFile(wb, path.join(FIXTURES_DIR, 'clickup_sample.xlsx'));
  console.log('✓ clickup_sample.xlsx');
}

// ──────────────────────────────────────────────
// 4. Ana Care XLSX  (tipo: ana_care)
//    Detectado por: filename contém 'ana_care'
// ──────────────────────────────────────────────
function generateAnaCareXLSX() {
  const wb = XLSX.utils.book_new();

  const rows = [
    ['Nombre y Apellido', 'Teléfono', 'Email', 'Fecha de nacimiento', 'CUIT', 'Tipo', 'Domicilio', 'Delegación', 'Género'],
    ['Rosa Méndez', '5491144443333', 'rosa.mendez@test.com', '1985-03-15', '27444555666', 'AT', 'Av. Corrientes 1234', 'CABA', 'Femenino'],
    ['Pedro Sosa', '5491177778888', 'pedro.sosa@test.com', '1990-07-22', '20777888999', 'Cuidador', 'Rivadavia 500', 'GBA', 'Masculino'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  XLSX.writeFile(wb, path.join(FIXTURES_DIR, 'ana_care_sample.xlsx'));
  console.log('✓ ana_care_sample.xlsx');
}

// ──────────────────────────────────────────────
// 5. Arquivo inválido para testes de erro
// ──────────────────────────────────────────────
function generateInvalidFiles() {
  // Texto puro (não é Excel nem CSV válido com headers reconhecidos)
  fs.writeFileSync(path.join(FIXTURES_DIR, 'invalid_text.txt'), 'Este arquivo não é uma planilha válida.\nSem headers reconhecidos.\n', 'utf-8');
  console.log('✓ invalid_text.txt');

  // CSV vazio (sem linhas)
  fs.writeFileSync(path.join(FIXTURES_DIR, 'empty.csv'), '', 'utf-8');
  console.log('✓ empty.csv');
}

generateTalentumCSV();
generatePlanilhaOperativaXLSX();
generateClickUpXLSX();
generateAnaCareXLSX();
generateInvalidFiles();

console.log(`\nFixtures geradas em: ${FIXTURES_DIR}`);
