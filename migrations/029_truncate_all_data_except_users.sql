-- ============================================================
-- Script: Truncate All Data Tables Except Users/Admins
--
-- Limpa todas as tabelas de dados para re-importação limpa.
-- MANTÉM: users e admins_extension (superadmins)
-- ============================================================

-- Desativar foreign key checks temporariamente para permitir truncate em cascata
-- Ordem: tabelas filhas primeiro, depois tabelas pai

-- 1. Tabelas de relacionamento e histórico
TRUNCATE TABLE worker_job_applications RESTART IDENTITY CASCADE;
TRUNCATE TABLE worker_employment_history RESTART IDENTITY CASCADE;
TRUNCATE TABLE encuadres RESTART IDENTITY CASCADE;

-- 2. Tabelas de worker
TRUNCATE TABLE worker_service_areas RESTART IDENTITY CASCADE;
TRUNCATE TABLE worker_documents RESTART IDENTITY CASCADE;
TRUNCATE TABLE worker_payment_info RESTART IDENTITY CASCADE;

-- 3. Tabela principal de workers
TRUNCATE TABLE workers RESTART IDENTITY CASCADE;

-- 4. Outras tabelas operacionais
TRUNCATE TABLE blacklist RESTART IDENTITY CASCADE;
TRUNCATE TABLE publications RESTART IDENTITY CASCADE;
TRUNCATE TABLE import_jobs RESTART IDENTITY CASCADE;

-- 5. Tabelas de casos/vagas
TRUNCATE TABLE job_postings RESTART IDENTITY CASCADE;

-- Nota: users e admins_extension NÃO são truncadas (superadmins preservados)
