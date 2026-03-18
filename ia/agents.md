# AI Agents - Enlite Frontend

## 1. Test Guardian Agent
**Responsabilidade:** Garantir cobertura e qualidade dos testes

**Funções:**
- Verificar cobertura de testes unitários (mínimo 80%)
- Validar testes de integração para fluxos críticos
- Garantir testes E2E para jornadas de usuário
- Verificar mocks e stubs adequados
- Validar testes de componentes React
- Checar testes de hooks customizados
- Garantir testes de serviços e repositórios

**Critérios de Aprovação:**
- ✅ Cobertura >= 80% em domain e application
- ✅ Testes passando sem warnings
- ✅ Snapshots atualizados quando necessário
- ✅ Testes isolados (sem dependências externas)

---

## 2. Architecture Enforcer Agent
**Responsabilidade:** Validar conformidade com Clean Architecture e SOLID

**Funções:**
- Verificar separação de camadas (domain, application, infrastructure, presentation)
- Garantir que domain não depende de infrastructure
- Validar Single Responsibility Principle (SRP)
- Verificar Open/Closed Principle (OCP)
- Garantir Liskov Substitution Principle (LSP)
- Validar Interface Segregation Principle (ISP)
- Verificar Dependency Inversion Principle (DIP)
- Checar uso correto de injeção de dependências

**Critérios de Aprovação:**
- ✅ Domain layer pura (sem dependências externas)
- ✅ Use cases com responsabilidade única
- ✅ Interfaces segregadas adequadamente
- ✅ Dependências apontando para abstrações
- ✅ Componentes React com responsabilidade única

---

## 3. Line Count Validator Agent
**Responsabilidade:** Garantir que arquivos não excedam 100 linhas

**Funções:**
- Contar linhas de código em cada arquivo
- Alertar quando arquivo ultrapassar 80 linhas (warning)
- Bloquear quando arquivo ultrapassar 100 linhas (error)
- Sugerir refatorações para quebrar arquivos grandes
- Validar que quebras mantêm coesão

**Critérios de Aprovação:**
- ✅ Nenhum arquivo com mais de 100 linhas
- ✅ Arquivos coesos e com responsabilidade única
- ✅ Imports não contam para limite (apenas código)
- ✅ Comentários JSDoc contam para limite

**Ações Corretivas:**
- Extrair componentes menores
- Criar hooks customizados
- Separar lógica de negócio
- Criar arquivos de constantes/tipos

---

## 4. Code Quality Agent
**Responsabilidade:** Garantir Clean Code e boas práticas

**Funções:**
- Verificar nomenclatura descritiva
- Validar ausência de código duplicado
- Checar complexidade ciclomática (máx 10)
- Garantir funções pequenas (máx 20 linhas)
- Validar ausência de magic numbers
- Verificar tratamento de erros adequado
- Checar tipagem TypeScript estrita

**Critérios de Aprovação:**
- ✅ Nomes descritivos e auto-explicativos
- ✅ DRY (Don't Repeat Yourself)
- ✅ Funções com no máximo 20 linhas
- ✅ Sem any types (strict mode)
- ✅ Error boundaries implementados

---

## 5. Security & Compliance Agent
**Responsabilidade:** Garantir segurança e compliance (HIPAA)

**Funções:**
- Validar que PII não é exposta em logs
- Verificar sanitização de inputs
- Garantir tokens armazenados de forma segura
- Validar políticas Cerbos corretamente aplicadas
- Checar autenticação Google Identity
- Verificar HTTPS em produção
- Validar CORS adequadamente configurado

**Critérios de Aprovação:**
- ✅ Sem PII em console.log ou error logs
- ✅ Inputs validados e sanitizados
- ✅ Tokens em httpOnly cookies ou secure storage
- ✅ Cerbos policies validadas
- ✅ Google Identity configurado corretamente
