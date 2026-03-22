import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const excelDir = './docs/excel';
const files = fs.readdirSync(excelDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'));

for (const file of files) {
  const filePath = path.join(excelDir, file);
  console.log(`\n=== ${file} ===\n`);
  
  try {
    if (file.endsWith('.csv')) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim());
        console.log('Colunas:', headers.join(', '));
      }
    } else {
      const workbook = XLSX.readFile(filePath);
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, header: 1 }) as unknown[][];
        if (rows.length > 0) {
          console.log(`\nSheet: ${sheetName}`);
          console.log('Colunas:', (rows[0] as string[]).join(', '));
          console.log(`Total rows: ${rows.length - 1}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error reading ${file}:`, (err as Error).message);
  }
}
