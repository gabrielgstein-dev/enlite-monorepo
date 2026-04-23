// WorkerRepositoryExtension.ts
//
// DEPRECATED: Este arquivo foi mantido apenas por compatibilidade de histórico.
// A implementação de updatePersonalInfo com KMS está em WorkerRepository.ts.
// NÃO usar este arquivo — as colunas plaintext (first_name, last_name, etc.)
// foram removidas na migration 023_encrypt_all_pii.sql.
//
// Todos os writes de dados pessoais devem passar por WorkerRepository.updatePersonalInfo()
// que usa KMSEncryptionService para criptografar antes de persistir.
