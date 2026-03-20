# 🗄️ Guia de Migration SQL - Fullmap Alignment

## 🎯 Objetivo

Adicionar campos faltantes do fullmap.md ao schema atual, mantendo compatibilidade com dados existentes.

---

## 📋 Migration 002: Add Fullmap Fields

### Arquivo: `migrations/002_add_fullmap_fields.sql`

```sql
-- Migration 002: Add Fullmap Fields
-- Adiciona campos necessários para alinhar com fullmap.md

-- 1. Adicionar novos campos à tabela workers
ALTER TABLE workers
  -- Separar nome completo
  ADD COLUMN first_name VARCHAR(80),
  ADD COLUMN last_name VARCHAR(80),
  
  -- Dados demográficos
  ADD COLUMN sex VARCHAR(20),
  ADD COLUMN gender VARCHAR(20),
  ADD COLUMN birth_date DATE,
  
  -- Documentação
  ADD COLUMN document_type VARCHAR(10),
  ADD COLUMN document_number VARCHAR(30),
  
  -- Foto de perfil
  ADD COLUMN profile_photo_url TEXT,
  
  -- Dados profissionais
  ADD COLUMN languages TEXT[] DEFAULT '{}',
  ADD COLUMN profession VARCHAR(50),
  ADD COLUMN knowledge_level VARCHAR(30),
  ADD COLUMN title_certificate VARCHAR(80),
  ADD COLUMN experience_types TEXT[] DEFAULT '{}',
  ADD COLUMN years_experience VARCHAR(20),
  ADD COLUMN preferred_types TEXT[] DEFAULT '{}',
  ADD COLUMN preferred_age_range VARCHAR(30),
  
  -- Compliance
  ADD COLUMN terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN privacy_accepted_at TIMESTAMPTZ,
  
  -- Multi-região
  ADD COLUMN country CHAR(2) DEFAULT 'AR';

-- 2. Migrar dados existentes (separar full_name)
UPDATE workers
SET 
  first_name = CASE 
    WHEN position(' ' in full_name) > 0 
    THEN split_part(full_name, ' ', 1)
    ELSE full_name
  END,
  last_name = CASE 
    WHEN position(' ' in full_name) > 0 
    THEN substring(full_name from position(' ' in full_name) + 1)
    ELSE ''
  END
WHERE full_name IS NOT NULL;

-- 3. Atualizar worker_service_areas para match fullmap schema
ALTER TABLE worker_service_areas
  RENAME COLUMN radius_km TO service_radius_km;

ALTER TABLE worker_service_areas
  ADD COLUMN address_complement TEXT;

ALTER TABLE worker_service_areas
  RENAME COLUMN latitude TO lat;

ALTER TABLE worker_service_areas
  RENAME COLUMN longitude TO lng;

-- 4. Atualizar worker_quiz_responses para match fullmap schema
ALTER TABLE worker_quiz_responses
  ADD COLUMN section_id VARCHAR(50);

ALTER TABLE worker_quiz_responses
  RENAME COLUMN question_text TO question_id;

ALTER TABLE worker_quiz_responses
  RENAME COLUMN answer_value TO answer_id;

ALTER TABLE worker_quiz_responses
  DROP COLUMN is_correct,
  DROP COLUMN score;

-- Adicionar constraint unique
ALTER TABLE worker_quiz_responses
  ADD CONSTRAINT unique_worker_question UNIQUE (worker_id, question_id);

-- 5. Criar tabela worker_index para scatter-gather multi-região
CREATE TABLE IF NOT EXISTS worker_index (
  id         UUID PRIMARY KEY,
  country    CHAR(2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  status     VARCHAR(20) NOT NULL,
  step       SMALLINT NOT NULL
);

CREATE INDEX idx_worker_index_country ON worker_index(country);
CREATE INDEX idx_worker_index_created ON worker_index(created_at DESC);
CREATE INDEX idx_worker_index_status ON worker_index(status);

-- 6. Popular worker_index com dados existentes
INSERT INTO worker_index (id, country, created_at, status, step)
SELECT id, country, created_at, status, current_step
FROM workers
ON CONFLICT (id) DO NOTHING;

-- 7. Criar trigger para manter worker_index sincronizado
CREATE OR REPLACE FUNCTION sync_worker_index()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO worker_index (id, country, created_at, status, step)
    VALUES (NEW.id, NEW.country, NEW.created_at, NEW.status, NEW.current_step)
    ON CONFLICT (id) DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE worker_index
    SET status = NEW.status, step = NEW.current_step
    WHERE id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM worker_index WHERE id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workers_sync_index
  AFTER INSERT OR UPDATE OR DELETE ON workers
  FOR EACH ROW EXECUTE FUNCTION sync_worker_index();

-- 8. Adicionar constraints de validação
ALTER TABLE workers
  ADD CONSTRAINT valid_sex CHECK (sex IN ('Masculino', 'Feminino', 'Outro', NULL)),
  ADD CONSTRAINT valid_country CHECK (country IN ('AR', 'BR'));

-- 9. Comentários para documentação
COMMENT ON COLUMN workers.first_name IS 'Primeiro nome do worker';
COMMENT ON COLUMN workers.last_name IS 'Sobrenome do worker';
COMMENT ON COLUMN workers.sex IS 'Sexo biológico';
COMMENT ON COLUMN workers.gender IS 'Identidade de gênero';
COMMENT ON COLUMN workers.languages IS 'Array de idiomas falados';
COMMENT ON COLUMN workers.experience_types IS 'Array de tipos de experiência';
COMMENT ON COLUMN workers.preferred_types IS 'Array de tipos de atendimento preferidos';
COMMENT ON COLUMN workers.country IS 'País de operação (AR=Argentina, BR=Brasil)';
COMMENT ON TABLE worker_index IS 'Índice global para scatter-gather multi-região';
```

---

## 🔄 Rollback (se necessário)

### Arquivo: `migrations/002_rollback.sql`

```sql
-- Rollback Migration 002

-- 1. Remover trigger e função
DROP TRIGGER IF EXISTS workers_sync_index ON workers;
DROP FUNCTION IF EXISTS sync_worker_index();

-- 2. Remover tabela worker_index
DROP TABLE IF EXISTS worker_index;

-- 3. Reverter alterações em worker_quiz_responses
ALTER TABLE worker_quiz_responses
  DROP CONSTRAINT IF EXISTS unique_worker_question;

ALTER TABLE worker_quiz_responses
  DROP COLUMN IF EXISTS section_id;

ALTER TABLE worker_quiz_responses
  RENAME COLUMN question_id TO question_text;

ALTER TABLE worker_quiz_responses
  RENAME COLUMN answer_id TO answer_value;

ALTER TABLE worker_quiz_responses
  ADD COLUMN is_correct BOOLEAN,
  ADD COLUMN score INTEGER;

-- 4. Reverter alterações em worker_service_areas
ALTER TABLE worker_service_areas
  RENAME COLUMN service_radius_km TO radius_km;

ALTER TABLE worker_service_areas
  DROP COLUMN IF EXISTS address_complement;

ALTER TABLE worker_service_areas
  RENAME COLUMN lat TO latitude;

ALTER TABLE worker_service_areas
  RENAME COLUMN lng TO longitude;

-- 5. Remover campos adicionados em workers
ALTER TABLE workers
  DROP COLUMN IF EXISTS first_name,
  DROP COLUMN IF EXISTS last_name,
  DROP COLUMN IF EXISTS sex,
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS birth_date,
  DROP COLUMN IF EXISTS document_type,
  DROP COLUMN IF EXISTS document_number,
  DROP COLUMN IF EXISTS profile_photo_url,
  DROP COLUMN IF EXISTS languages,
  DROP COLUMN IF EXISTS profession,
  DROP COLUMN IF EXISTS knowledge_level,
  DROP COLUMN IF EXISTS title_certificate,
  DROP COLUMN IF EXISTS experience_types,
  DROP COLUMN IF EXISTS years_experience,
  DROP COLUMN IF EXISTS preferred_types,
  DROP COLUMN IF EXISTS preferred_age_range,
  DROP COLUMN IF EXISTS terms_accepted_at,
  DROP COLUMN IF EXISTS privacy_accepted_at,
  DROP COLUMN IF EXISTS country;
```

---

## 🚀 Como Executar

### Desenvolvimento Local

```bash
# 1. Conectar ao PostgreSQL local
PGPASSWORD=enlite_password psql -h localhost -U enlite_admin -d enlite_production

# 2. Executar migration
\i backend-functions/migrations/002_add_fullmap_fields.sql

# 3. Verificar
\d workers
SELECT * FROM worker_index LIMIT 5;

# 4. Sair
\q
```

### Produção (Cloud SQL)

```bash
# 1. Conectar via Cloud SQL Proxy
./cloud-sql-proxy enlite-production:southamerica-west1:enlite-ar-db --port=5432

# 2. Em outro terminal
psql "host=127.0.0.1 port=5432 dbname=enlite_ar user=enlite_app"

# 3. Executar migration
\i backend-functions/migrations/002_add_fullmap_fields.sql

# 4. Verificar
SELECT COUNT(*) FROM workers;
SELECT COUNT(*) FROM worker_index;
```

---

## ✅ Checklist Pós-Migration

- [ ] Todos os campos foram adicionados
- [ ] Dados existentes foram migrados (first_name/last_name)
- [ ] Tabela worker_index criada e populada
- [ ] Trigger de sincronização funcionando
- [ ] Constraints de validação ativos
- [ ] Indexes criados
- [ ] Rollback testado em ambiente de dev

---

## 📊 Validação

### Queries de Validação

```sql
-- 1. Verificar campos adicionados
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'workers' 
  AND column_name IN ('first_name', 'last_name', 'sex', 'gender', 'country')
ORDER BY column_name;

-- 2. Verificar migração de nomes
SELECT id, full_name, first_name, last_name 
FROM workers 
WHERE full_name IS NOT NULL 
LIMIT 10;

-- 3. Verificar worker_index sincronizado
SELECT 
  (SELECT COUNT(*) FROM workers) as workers_count,
  (SELECT COUNT(*) FROM worker_index) as index_count;

-- 4. Verificar trigger funcionando
-- Inserir um worker de teste
INSERT INTO workers (auth_uid, email, full_name, country)
VALUES ('test-123', 'test@example.com', 'Test User', 'AR')
RETURNING id;

-- Verificar se apareceu no worker_index
SELECT * FROM worker_index WHERE id = '<id-retornado>';

-- Limpar teste
DELETE FROM workers WHERE auth_uid = 'test-123';
```

---

## 🔍 Troubleshooting

### Erro: "column already exists"

**Causa:** Migration já foi executada parcialmente.

**Solução:**
```sql
-- Verificar quais colunas já existem
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'workers';

-- Executar apenas as partes faltantes da migration
```

### Erro: "constraint violation"

**Causa:** Dados existentes não atendem aos novos constraints.

**Solução:**
```sql
-- Verificar dados problemáticos
SELECT * FROM workers WHERE country NOT IN ('AR', 'BR');

-- Corrigir antes de adicionar constraint
UPDATE workers SET country = 'AR' WHERE country IS NULL;
```

### worker_index não sincroniza

**Causa:** Trigger não foi criado corretamente.

**Solução:**
```sql
-- Verificar se trigger existe
SELECT * FROM pg_trigger WHERE tgname = 'workers_sync_index';

-- Recriar trigger
DROP TRIGGER IF EXISTS workers_sync_index ON workers;
CREATE TRIGGER workers_sync_index...
```

---

## 📝 Notas Importantes

1. **Backup:** Sempre faça backup antes de executar migrations em produção
2. **Downtime:** Esta migration pode ser executada sem downtime (apenas ADDs)
3. **Performance:** Indexes serão criados - pode levar alguns minutos em tabelas grandes
4. **Multi-região:** A tabela `worker_index` prepara o sistema para Brasil (BR)
