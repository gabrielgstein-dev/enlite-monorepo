import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const errors = [];

function getImports(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const imports = [];
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
}

function validateDomainLayer(filePath, imports) {
  const invalidImports = imports.filter(imp => 
    imp.includes('@infrastructure') || 
    imp.includes('@application') || 
    imp.includes('@presentation')
  );
  
  if (invalidImports.length > 0) {
    errors.push(`❌ Domain layer violation in ${filePath}: imports ${invalidImports.join(', ')}`);
  }
}

function validateApplicationLayer(filePath, imports) {
  const invalidImports = imports.filter(imp => 
    imp.includes('@infrastructure') || 
    imp.includes('@presentation')
  );
  
  if (invalidImports.length > 0) {
    errors.push(`❌ Application layer violation in ${filePath}: imports ${invalidImports.join(', ')}`);
  }
}

function scanDirectory(dir, layer) {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanDirectory(fullPath, layer);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const imports = getImports(fullPath);
      
      if (layer === 'domain') {
        validateDomainLayer(fullPath, imports);
      } else if (layer === 'application') {
        validateApplicationLayer(fullPath, imports);
      }
    }
  }
}

console.log('🏗️  Validating Clean Architecture...\n');

scanDirectory('./src/domain', 'domain');
scanDirectory('./src/application', 'application');

if (errors.length > 0) {
  console.log('Architecture Violations:');
  errors.forEach(e => console.log(e));
  console.log(`\n❌ Found ${errors.length} architecture violation(s)\n`);
  process.exit(1);
} else {
  console.log('✅ Clean Architecture validated successfully\n');
}
