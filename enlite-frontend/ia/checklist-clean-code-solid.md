# ✅ Clean Code & SOLID — Checklist de Implementação

> **Uso obrigatório:** Antes de entregar qualquer implementação — função, módulo, feature, arquitetura — percorra esta checklist e garanta que cada item foi respeitado ou conscientemente justificado.

---

## 🔤 1. NOMENCLATURA

- [ ] **Nomes revelam intenção** — o nome diz o *quê* faz, não *como* faz (`getUserById`, não `getData`)
- [ ] **Sem abreviações ambíguas** — `usr`, `tmp`, `d`, `e` são proibidos sem contexto claro
- [ ] **Consistência léxica** — um conceito = um nome em todo o codebase (`fetch` vs `get` vs `retrieve`: escolha um)
- [ ] **Classes = substantivos** (`UserRepository`, `OrderService`)
- [ ] **Funções = verbos** (`calculateTotal`, `sendEmail`, `validateToken`)
- [ ] **Booleanos com prefixo semântico** (`isActive`, `hasPermission`, `canDelete`)
- [ ] **Constantes em UPPER_SNAKE_CASE** para valores mágicos (`MAX_RETRY_COUNT = 3`)
- [ ] **Sem contexto redundante** — se a classe é `User`, o campo é `.name`, não `.userName`

---

## 🧩 2. FUNÇÕES

- [ ] **Uma única responsabilidade** — se você precisar de "e" para descrever o que ela faz, quebre
- [ ] **Pequena e focada** — idealmente até 20 linhas; se ultrapassar, questione
- [ ] **Máximo 3 parâmetros** — mais que isso, use um objeto de configuração
- [ ] **Sem side effects ocultos** — função que parece consultar não deve alterar estado silenciosamente
- [ ] **Sem flags booleanas como parâmetro** (`doSomething(true)`) — separe em duas funções
- [ ] **Retorno previsível** — não retorne `null | string | undefined | object` dependendo do humor
- [ ] **Nível de abstração uniforme** — não misture lógica de negócio com manipulação de string no mesmo bloco
- [ ] **Early return em vez de if aninhado** — fail fast, não piramide de callbacks/condicionais

---

## 💬 3. COMENTÁRIOS

- [ ] **Código se auto-documenta** — se precisa de comentário para explicar *o quê*, renomeie
- [ ] **Comentários explicam o *porquê*, não o *quê*** — `// workaround para bug do Safari #4521`
- [ ] **Sem comentários desatualizados** — comentário errado é pior que sem comentário
- [ ] **Sem código comentado** — se não está sendo usado, delete (Git guarda o histórico)
- [ ] **JSDoc/TSDoc apenas em APIs públicas** com tipos, parâmetros e exemplo de uso

---

## 📐 4. FORMATAÇÃO & ESTRUTURA

- [ ] **Conceitos relacionados próximos** — funções que se chamam devem ficar próximas no arquivo
- [ ] **Leitura de cima para baixo** — funções de alto nível antes, auxiliares abaixo
- [ ] **Linhas curtas** — limite de 100-120 caracteres
- [ ] **Espaço vertical como separador lógico** — grupos de código separados por linha em branco
- [ ] **Um único nível de indentação por função** (regra de Uncle Bob)
- [ ] **Sem formatação manual** — use Prettier / ESLint / formatter da stack

---

## 🗃️ 5. ORGANIZAÇÃO DE CLASSES

- [ ] **Campos públicos antes dos privados**
- [ ] **Construtores logo após declaração de campos**
- [ ] **Métodos públicos antes dos privados**
- [ ] **Métodos privados auxiliares logo abaixo de quem os chama**
- [ ] **Lei de Demeter respeitada** — um objeto não deve conhecer a estrutura interna de outro (`user.getAddress().getCity()` → violação)

---

## 🏗️ 6. SOLID

### S — Single Responsibility Principle
- [ ] **Cada classe/módulo tem UM motivo para mudar**
- [ ] **Lógica de negócio separada de persistência, separada de apresentação**
- [ ] **Services não acumulam responsabilidades** — `UserService` não envia email, não faz upload de arquivo
- [ ] **Teste de sanidade:** consiga descrever a classe em 1 frase sem usar "e" ou "ou"

### O — Open/Closed Principle
- [ ] **Extensível sem modificar código existente**
- [ ] **Comportamentos variáveis encapsulados em abstrações** (interfaces, estratégias, handlers)
- [ ] **Condicionais do tipo `if (type === 'A') ... else if (type === 'B')` são red flags** → use polimorfismo ou Strategy
- [ ] **Novos casos de uso adicionam novos arquivos, não editam os existentes**

### L — Liskov Substitution Principle
- [ ] **Subclasses não quebram o contrato da classe base**
- [ ] **Sobrescritas não lançam exceções que a base não lança**
- [ ] **Sobrescritas não enfraquecem pré-condições nem fortalecem pós-condições**
- [ ] **Teste de sanidade:** trocar a classe base pela derivada não quebra nenhum cliente

### I — Interface Segregation Principle
- [ ] **Nenhuma classe é obrigada a implementar métodos que não usa**
- [ ] **Interfaces são específicas e coesas** — prefira `Readable`, `Writable`, `Closeable` a `FileSystemHandler`
- [ ] **Clientes dependem apenas do que precisam**

### D — Dependency Inversion Principle
- [ ] **Módulos de alto nível não dependem de módulos de baixo nível** — ambos dependem de abstrações
- [ ] **Dependências injetadas, não instanciadas internamente** (`new ConcreteRepository()` dentro de um Service é violação)
- [ ] **Interfaces/abstrações definidas pelo consumidor, não pelo provedor**
- [ ] **Frameworks e bibliotecas externas isolados atrás de interfaces próprias**

---

## 🧱 7. TRATAMENTO DE ERROS

- [ ] **Nunca retorne `null` onde erro é possível** — lance uma exceção ou use Result/Either pattern
- [ ] **Erros de negócio como classes específicas** (`UserNotFoundException`, não `new Error('not found')`)
- [ ] **Nunca capture erro e faça nada** (`catch (e) {}` é proibido)
- [ ] **Logging de erro com contexto suficiente** — quem chamou, com quais parâmetros, stack trace
- [ ] **Erros não vazam detalhes internos para a camada de cima** (ex: stack trace SQL para o controller)

---

## 🧪 8. TESTABILIDADE

- [ ] **Funções puras favorecidas** — mesmo input → mesmo output, sem dependência de estado externo
- [ ] **Dependências injetáveis** — tudo que é externo pode ser mockado
- [ ] **Sem lógica em construtores** — construtores só inicializam, nunca executam fluxo
- [ ] **Nomes de teste descrevem comportamento:** `should_return_error_when_user_not_found`
- [ ] **Cada teste valida uma única coisa**
- [ ] **Arrange / Act / Assert claramente separados** no corpo do teste

---

## 🔁 9. DRY — Don't Repeat Yourself

- [ ] **Lógica duplicada extraída em funções/helpers compartilhados**
- [ ] **Constantes centralizadas**, não espalhadas por toda a codebase
- [ ] **Nenhum bloco de código copy-paste** sem justificativa técnica documentada

---

## 🏛️ 10. ARQUITETURA & CAMADAS

- [ ] **Camadas não se saltam** — Controller não acessa Repository diretamente; passa pelo Service
- [ ] **Domínio não depende de infraestrutura** — entidades/value objects sem imports de ORM, framework, HTTP
- [ ] **Separação entre o que muda junto** (coesão) e **o que muda por razões diferentes** (separação)
- [ ] **Dependências apontam para dentro** (em direção ao domínio), nunca para fora
- [ ] **DTOs nas bordas** — entidades de domínio não saem do core para a camada de apresentação
- [ ] **Ports & Adapters** — interfaces no domínio, implementações na infra

---

## ⚙️ 11. CÓDIGO MORTO & COMPLEXIDADE

- [ ] **Sem código inacessível** (dead code após `return`, branches impossíveis)
- [ ] **Complexidade ciclomática baixa** — idealmente ≤ 10 por função; acima de 15 é débito técnico
- [ ] **Nesting máximo de 2-3 níveis** — mais que isso, extraia funções
- [ ] **Sem variáveis declaradas e não utilizadas**
- [ ] **Sem imports não utilizados**

---

## 🔒 12. SEGURANÇA BÁSICA (INVARIANTES)

- [ ] **Validação de entrada nas bordas do sistema** (controllers, event handlers, queue consumers)
- [ ] **Objetos de domínio sempre em estado válido** — construtor/factory valida antes de criar
- [ ] **Dados sensíveis fora de logs**
- [ ] **Sem segredos hardcoded** (senhas, tokens, chaves em código-fonte)

---

## 📦 13. DEPENDÊNCIAS EXTERNAS

- [ ] **Bibliotecas de terceiros isoladas atrás de abstrações** — troca de lib não cascateia pelo sistema
- [ ] **Versões pinadas** no package.json / go.mod / requirements.txt
- [ ] **Sem dependência de implementação interna de framework** além do que é documentado como API pública

---

## 🚦 GATE FINAL — Perguntas de Sanidade

Antes de dar o código como pronto, responda **sim** para todas:

| # | Pergunta |
|---|----------|
| 1 | Consigo descrever cada classe/função em 1 frase sem "e"? |
| 2 | Posso trocar qualquer dependência por um mock sem alterar a lógica? |
| 3 | Um novo dev consegue entender o código sem perguntar nada? |
| 4 | Adicionar um novo comportamento exige novo arquivo, não editar existente? |
| 5 | Os testes cobrem o comportamento, não a implementação interna? |
| 6 | Nenhuma camada sabe mais do que precisa saber? |
| 7 | O código está preparado para falhar de forma rastreável e controlada? |

---

> **Referências:** *Clean Code* — Robert C. Martin (2008) · *Clean Architecture* — Robert C. Martin (2017) · *SOLID Principles* — Robert C. Martin (2000)
