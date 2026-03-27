import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const MAX_LINES = 100;
const WARN_LINES = 80;
const errors = [];
const warnings = [];

function countLines(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return content.split('\n').length;
}

function scanDirectory(dir, baseDir = dir) {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist') {
        scanDirectory(fullPath, baseDir);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const lines = countLines(fullPath);
      const relativePath = fullPath.replace(baseDir + '/', '');
      
      if (lines > MAX_LINES) {
        errors.push(`❌ ${relativePath}: ${lines} lines (max: ${MAX_LINES})`);
      } else if (lines > WARN_LINES) {
        warnings.push(`⚠️  ${relativePath}: ${lines} lines (warning at ${WARN_LINES})`);
      }
    }
  }
}

console.log('🔍 Validating file line counts...\n');
scanDirectory('./src');

if (warnings.length > 0) {
  console.log('Warnings:');
  warnings.forEach(w => console.log(w));
  console.log('');
}

if (errors.length > 0) {
  console.log('Errors:');
  errors.forEach(e => console.log(e));
  console.log(`\n❌ ${errors.length} file(s) exceed ${MAX_LINES} lines\n`);
  process.exit(1);
} else {
  console.log(`✅ All files are within ${MAX_LINES} lines limit\n`);
}
