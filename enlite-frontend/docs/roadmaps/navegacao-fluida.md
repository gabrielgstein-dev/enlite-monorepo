# Roadmap: Navegação Fluida no Painel Admin

> Objetivo: eliminar telas brancas durante navegação interna, substituir spinners genéricos por skeletons contextuais e adicionar transição suave de conteúdo.
>
> Tempo estimado total: ~3h
> Risco: baixo — nenhuma lógica de negócio é alterada

---

## Visão geral das fases

| Fase | O que muda | Impacto | Status |
|---|---|---|---|
| 1 | Nested Routes — layout persistente | Alto | ✅ Concluído |
| 2 | Skeleton screens nas páginas | Alto | ✅ Concluído |
| 3 | Fade-in de conteúdo | Baixo (polimento) | ✅ Concluído |

---

## Fase 1 — Nested Routes: `AdminLayout` como rota pai ✅

> **Implementado.** Arquivos alterados: `App.tsx`, `AdminLayout.tsx`.

### Por que primeiro

É a mudança de maior impacto e mais baixo risco. Sozinha já elimina a tela branca entre rotas admin. As fases 2 e 3 são melhorias incrementais sobre este alicerce.

### Arquivos que mudam

| Arquivo | O que muda |
|---|---|
| `src/presentation/App.tsx` | Reestrutura rotas admin para nested routes; remove `lazy()` das páginas internas |
| `src/presentation/components/templates/AdminLayout/AdminLayout.tsx` | Troca `{children}` por `<Outlet />` e remove `lazy()` |

### Decisão: onde manter `lazy()` e onde remover

`lazy()` só vale a pena na **fronteira entre módulos** — para que o bundle admin nunca seja baixado por workers. Entre páginas admin (quando o usuário já está dentro do painel), o ganho é mínimo e o custo é o `Suspense` obrigatório em cada rota.

**Estratégia adotada:**

| Componente | lazy? | Por quê |
|---|---|---|
| `AdminLayout` | Não — import direto | É o shell; lazy causa tela branca |
| `AdminProtectedRoute` | Sim — mantém lazy | Fronteira worker/admin; carregado uma vez |
| `AdminLoginGuard` | Sim — mantém lazy | Idem |
| Todas as páginas admin | Não — import direto | Usuário já está no bundle admin; `Suspense` desnecessário |

Com páginas importadas diretamente, **`Suspense` não é necessário nas rotas filhas**. O único `Suspense` que fica é o que envolve `AdminProtectedRoute` (que ainda é lazy).

### Passo a passo

#### 1.1 — Converter imports: `lazy()` → import direto para layout e páginas

**Antes (App.tsx linhas 11–21):**
```tsx
const AdminLoginPage = lazy(() => ...);
const AdminChangePasswordPage = lazy(() => ...);
const AdminUsersPage = lazy(() => ...);
const AdminUploadsPage = lazy(() => ...);
const AdminVacanciesPage = lazy(() => ...);
const AdminRecruitmentPage = lazy(() => ...);
const VacancyDetailPage = lazy(() => ...);
const VacancyMatchPage  = lazy(() => ...);
const AdminLayout = lazy(() => ...);          // ← causa tela branca
const AdminProtectedRoute = lazy(() => ...);  // ← mantém lazy
const AdminLoginGuard = lazy(() => ...);      // ← mantém lazy
```

**Depois:**
```tsx
// Import direto — páginas e layout carregam junto com o bundle admin
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminChangePasswordPage } from './pages/admin/AdminChangePasswordPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminUploadsPage } from './pages/admin/AdminUploadsPage';
import { AdminVacanciesPage } from './pages/admin/AdminVacanciesPage';
import { AdminRecruitmentPage } from './pages/admin/AdminRecruitmentPage';
import VacancyDetailPage from './pages/admin/VacancyDetailPage';
import VacancyMatchPage from './pages/admin/VacancyMatchPage';
import { AdminLayout } from './components/templates/AdminLayout/AdminLayout';

// Mantém lazy — são a fronteira worker/admin
const AdminProtectedRoute = lazy(() => ...);
const AdminLoginGuard = lazy(() => ...);
```

> ⚠️ **Ponto de atenção — tree shaking:** ao mover para import direto, verifique se os arquivos de página usam export nomeado (`export function`) ou default (`export default`). `VacancyDetailPage` e `VacancyMatchPage` usam `export default` — o import deve ser `import VacancyDetailPage from '...'`, sem chaves.

#### 1.2 — Reestruturar rotas em `App.tsx`

**Antes** (rotas planas, cada uma com seu próprio `AdminLayout`):
```tsx
<Route path="/admin" element={
  <Suspense fallback={<AdminFallback />}>
    <AdminProtectedRoute>
      <AdminLayout><AdminUsersPage /></AdminLayout>
    </AdminProtectedRoute>
  </Suspense>
} />
<Route path="/admin/vacancies" element={
  <Suspense fallback={<AdminFallback />}>
    <AdminProtectedRoute>
      <AdminLayout><AdminVacanciesPage /></AdminLayout>
    </AdminProtectedRoute>
  </Suspense>
} />
// ... mesmo padrão para todas as rotas admin
```

**Depois** (nested routes — layout como pai, páginas como filhos, sem `Suspense` nas rotas filhas):
```tsx
<Route
  path="/admin"
  element={
    <AdminErrorBoundary>
      <Suspense fallback={<AdminFallback />}>  {/* apenas para AdminProtectedRoute, que ainda é lazy */}
        <AdminProtectedRoute>
          <AdminLayout />
        </AdminProtectedRoute>
      </Suspense>
    </AdminErrorBoundary>
  }
>
  {/* Páginas importadas diretamente — sem Suspense, sem skeleton de rota */}
  <Route index element={<AdminUsersPage />} />
  <Route path="uploads" element={<AdminUploadsPage />} />
  <Route path="vacancies" element={<AdminVacanciesPage />} />
  <Route path="vacancies/:id" element={<VacancyDetailPage />} />
  <Route path="vacancies/:id/match" element={<VacancyMatchPage />} />
  <Route path="recruitment" element={<AdminRecruitmentPage />} />
</Route>
```

O feedback visual de carregamento de dados fica por conta dos skeletons dentro de cada página (Fase 2) — não do `Suspense` de rota.

> ⚠️ **Ponto de atenção:** `/admin/change-password` **não entra** nas nested routes. Essa rota é um fluxo especial (força troca de senha) que não usa `AdminLayout`. Mantê-la como rota plana separada está correto.

#### 1.3 — Substituir `{children}` por `<Outlet />` no `AdminLayout`

**Arquivo:** `src/presentation/components/templates/AdminLayout/AdminLayout.tsx`

**Antes:**
```tsx
import { ReactNode } from 'react';
// ...
interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  // ...
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <AppSidebar ... />
      <main className="flex-1 ml-[200px] overflow-y-auto">
        <div className="container mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
```

**Depois:**
```tsx
import { Outlet } from 'react-router-dom';
// ReactNode e a interface AdminLayoutProps são removidos
// ...

export function AdminLayout() {
  // ...
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <AppSidebar ... />
      <main className="flex-1 ml-[200px] overflow-y-auto">
        <div className="container mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

> ⚠️ **Ponto de atenção:** O arquivo atual tem dois `console.log` de debug nas linhas 12 e 18. Aproveite para remover nesta edição.

### O que testar na Fase 1

| Teste | Como verificar | Critério de aceite |
|---|---|---|
| Sidebar persiste durante navegação | Clicar em todos os itens do menu | Sidebar nunca desaparece |
| Header persiste durante navegação | Idem | Header nunca desaparece |
| Rota `/admin` carrega corretamente | Acessar `/admin` diretamente | Página de usuários aparece |
| Todas as rotas admin funcionam | Navegar para cada uma | Conteúdo correto em cada rota |
| `/admin/change-password` ainda funciona | Acessar a rota | Não é afetada pelas mudanças |
| `/admin/login` ainda funciona | Logout e login | Fluxo de autenticação intacto |
| Refresh na página (F5) em qualquer rota admin | F5 em `/admin/vacancies` | Página recarrega corretamente |
| Redirect ao acessar admin sem auth | Abrir aba anônima e acessar `/admin` | Redireciona para `/admin/login` |

### Pontos de atenção gerais — Fase 1

- **`ml-[200px]`** no `main` do layout: está hardcoded no arquivo. Vai continuar funcionando — só anote que se o sidebar mudar de largura, esse valor precisa ser atualizado.
- **TypeScript:** remover a interface `AdminLayoutProps` vai gerar erros de compilação nos arquivos que passavam `children` para `AdminLayout`. Verifique se há algum outro arquivo além de `App.tsx` que instancia `AdminLayout` com `children`.
- **Teste de regressão:** o fluxo de `mustChangePassword` (redirect para `/admin/change-password`) não usa `AdminLayout`, então não é afetado.

---

## Fase 2 — Skeleton screens ✅

> **Implementado.** Criados os 4 skeletons em `components/ui/skeletons/`. Spinners substituídos nas páginas.

### Por que depois da Fase 1

Os skeletons só fazem sentido depois que o layout está persistente. Com o layout sumindo a cada navegação (Fase 0), o skeleton seria inútil.

### Arquivos que mudam

| Arquivo | O que muda |
|---|---|
| `src/presentation/components/ui/skeletons/TableSkeleton.tsx` | ✅ Criado |
| `src/presentation/components/ui/skeletons/DashboardSkeleton.tsx` | ✅ Criado |
| `src/presentation/components/ui/skeletons/DetailSkeleton.tsx` | ✅ Criado |
| `src/presentation/components/ui/skeletons/UploadsSkeleton.tsx` | ✅ Criado |
| `src/presentation/components/ui/skeletons/index.ts` | ✅ Criado (re-exports) |
| `src/presentation/pages/admin/AdminVacanciesPage.tsx` | ✅ Spinner substituído por `<TableSkeleton />` |
| `src/presentation/pages/admin/AdminRecruitmentPage.tsx` | ✅ Spinner substituído por `<DashboardSkeleton />` |
| `src/presentation/pages/admin/VacancyDetailPage.tsx` | ✅ Spinner substituído por `<DetailSkeleton />` |
| `src/presentation/pages/admin/AdminUsersPage.tsx` | ✅ Spinner inline substituído por `<TableSkeleton />` |
| `src/presentation/App.tsx` | N/A — com páginas em import direto, `Suspense` nas rotas filhas foi removido; skeletons ficam nas páginas |

> **Nota sobre `AdminUsersPage`:** ao contrário das outras páginas, ela não tem um early-return para `isLoading`. O loading é inline (sem substituir a tela inteira). Verifique o comportamento atual antes de decidir adicionar o skeleton.

### Estrutura dos skeletons

Seguindo o padrão atomic design do projeto, os skeletons ficam em `components/ui/skeletons/` — uma subcategoria utilitária, não um átomo de interface, pois são específicos de layout de página.

#### `TableSkeleton` — usado em: AdminVacanciesPage, AdminUsersPage, VacancyMatchPage

Deve imitar: título da página + botão de ação + filtros + linhas de tabela.

```tsx
// Estrutura visual esperada:
// [Título ████████]              [Botão ██████]
// [Filtro ████████] [Filtro ████]
// ┌────────────────────────────────────────┐
// │ ████  ████████████  ████  ██████      │  ← header da tabela
// ├────────────────────────────────────────┤
// │ ████  ████████████  ████  ██████      │  ← linha 1
// │ ████  ██████        ████  ██████      │  ← linha 2
// │ ... (8 linhas)                         │
// └────────────────────────────────────────┘
```

#### `DashboardSkeleton` — usado em: AdminRecruitmentPage

Deve imitar: título + tabs + 4 cards de métricas + gráfico de barras.

```tsx
// Estrutura visual esperada:
// [Título ████████████]
// [Tab ███] [Tab ███] [Tab ███]
// ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
// │  ██  │ │  ██  │ │  ██  │ │  ██  │  ← metric cards
// │ ████ │ │ ████ │ │ ████ │ │ ████ │
// └──────┘ └──────┘ └──────┘ └──────┘
// ┌────────────────────────────────────┐
// │                                    │  ← gráfico de barras
// │  ▄  ▄  ▄  ▄  ▄  ▄  ▄  ▄  ▄  ▄   │
// └────────────────────────────────────┘
```

#### `DetailSkeleton` — usado em: VacancyDetailPage

Deve imitar: breadcrumb + título + grid de cards de detalhes.

```tsx
// Estrutura visual esperada:
// ← [Breadcrumb ████]
// [Título ██████████████]     [Botão ██]
// ┌────────────┐  ┌────────────┐
// │ Card       │  │ Card       │  ← VacancyStatusCard, VacancyPatientCard
// │ ████       │  │ ████       │
// └────────────┘  └────────────┘
// ┌────────────┐  ┌────────────┐
// │ Card       │  │ Card       │  ← VacancyRequirementsCard, VacancyScheduleCard
// └────────────┘  └────────────┘
```

#### `UploadsSkeleton` — usado em: AdminUploadsPage

Deve imitar: título + 4 drop zones lado a lado.

```tsx
// Estrutura visual esperada:
// [Título ████████]
// ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
// │  ⬆   │ │  ⬆   │ │  ⬆   │ │  ⬆   │  ← upload zones
// │ ████ │ │ ████ │ │ ████ │ │ ████ │
// └──────┘ └──────┘ └──────┘ └──────┘
```

### Padrão de implementação de cada skeleton

```tsx
// Padrão obrigatório:
// - animate-pulse no container externo
// - bg-gray-200 rounded-{tamanho} para cada bloco
// - Sem lógica, sem imports de negócio — só divs e classes Tailwind
// - Props opcionais para variar (ex: rows={8})

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-4 animate-pulse" role="status" aria-label="Carregando...">
      {/* ... */}
    </div>
  );
}
```

> ⚠️ **Ponto de atenção:** Sempre incluir `role="status"` e `aria-label` para acessibilidade. Leitores de tela precisam saber que o conteúdo está carregando.

### Ajuste nas páginas

O padrão de substituição em cada página é idêntico:

```tsx
// Antes (em AdminVacanciesPage, AdminRecruitmentPage, VacancyDetailPage):
if (isLoading) {
  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] flex items-center justify-center">
      <RefreshCw className="w-12 h-12 text-primary animate-spin" />
    </div>
  );
}

// Depois:
if (isLoading) return <TableSkeleton />;         // AdminVacanciesPage
if (isLoading) return <DashboardSkeleton />;     // AdminRecruitmentPage
if (isLoading) return <DetailSkeleton />;        // VacancyDetailPage
```

### O que testar na Fase 2

| Teste | Como verificar | Critério de aceite |
|---|---|---|
| Skeleton aparece ao navegar para página | Throttle rede para "Slow 3G" no DevTools | Skeleton visível antes dos dados |
| Skeleton não ultrapassa o container do layout | Inspecionar altura do skeleton | Nenhum skeleton tem `min-h-screen` |
| Skeleton imita o shape da página real | Comparar skeleton vs página carregada | Proporcionalidade similar |
| Skeleton some quando dados chegam | Aguardar carregamento | Transição limpa de skeleton → conteúdo |
| Acessibilidade | Testar com leitor de tela (VoiceOver/NVDA) | `role="status"` anunciado corretamente |
| Estado de erro não é afetado | Desligar backend e navegar | Mensagem de erro ainda aparece corretamente |

### Pontos de atenção — Fase 2

- **`AdminUsersPage` tem loading inline** (sem early-return). Antes de modificar, verifique o comportamento atual: se já mostra o conteúdo gradualmente sem tela branca, pode não precisar de skeleton.
- **`VacancyMatchPage`** — verifique se tem `isLoading` antes de criar o skeleton. Pode não ter estado de loading.
- **Cores do skeleton:** usar `bg-gray-200` é seguro com o design atual (`bg-gray-50` de fundo). Evite `bg-gray-300` que pode ter contraste excessivo.
- **`animate-pulse`** usa a cor de foreground do Tailwind — verifique que não conflita com a cor primária `#180149` do projeto.
- **Altura dos skeletons:** não use `min-h-screen`. O skeleton deve ter altura aproximada ao conteúdo real, para não causar "salto de layout" (layout shift) quando o conteúdo carregar.

---

## Fase 3 — Fade-in de conteúdo

### Por que por último

Puro polimento. Não afeta funcionalidade. Pode ser feito a qualquer momento depois da Fase 1.

### Arquivos que mudam

| Arquivo | O que muda |
|---|---|
| `src/index.css` (ou equivalente de CSS global) | Adiciona keyframe `fadeIn` |
| `src/presentation/components/templates/AdminLayout/AdminLayout.tsx` | Aplica a classe no wrapper do `<Outlet />` |

### Passo a passo

#### 3.1 — Adicionar keyframe no CSS global

```css
/* Adicionar no arquivo de CSS global do projeto */
@keyframes page-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-enter {
  animation: page-fade-in 150ms ease-out;
}
```

> ⚠️ **Ponto de atenção:** Primeiro, verifique se o projeto usa Tailwind com `extend` para animações custom, ou se tem um arquivo CSS global separado. Procure por `@layer` ou `@keyframes` existentes para seguir o padrão já adotado.

#### 3.2 — Aplicar no `AdminLayout`

```tsx
import { Outlet, useLocation } from 'react-router-dom';

export function AdminLayout() {
  const location = useLocation();
  // ...
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <AppSidebar ... />
      <main className="flex-1 ml-[200px] overflow-y-auto">
        <div
          key={location.pathname}
          className="container mx-auto p-6 page-enter"
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

O `key={location.pathname}` é crítico: ele força o React a desmontar e remontar o `div`, disparando a animação CSS a cada mudança de rota. Sem ele, a animação só roda na primeira renderização.

### O que testar na Fase 3

| Teste | Como verificar | Critério de aceite |
|---|---|---|
| Animação dispara ao navegar | Clicar em itens do menu | Fade-in sutil visível (150ms) |
| Animação não é intrusiva | Avaliação subjetiva | Parece natural, não distrai |
| Sem "flash" de animação ao carregar a página | Refresh (F5) em qualquer rota | Animação acontece normalmente |
| Usuário com `prefers-reduced-motion` | Testar no SO | A animação não deve executar |

### Ponto de atenção — `prefers-reduced-motion`

Usuários com sensibilidade a movimento (epilepsia, vertigem) configuram o sistema operacional para reduzir animações. O CSS deve respeitar isso:

```css
@media (prefers-reduced-motion: no-preference) {
  .page-enter {
    animation: page-fade-in 150ms ease-out;
  }
}
```

Assim, a animação só roda quando o usuário não tem preferência de redução de movimento configurada.

---

## Checklist de validação final (após todas as fases)

### Comportamento de navegação
- [ ] Navegar entre todas as rotas admin sem tela branca
- [ ] Sidebar persiste em todas as navegações
- [ ] Header persiste em todas as navegações
- [ ] Item ativo do sidebar muda corretamente ao navegar
- [ ] F5 (refresh) em qualquer rota admin funciona
- [ ] Navegação pelo botão "Voltar" do browser funciona

### Estados de carregamento
- [ ] Cada página admin mostra seu skeleton específico ao carregar
- [x] Nenhum skeleton tem `min-h-screen` (não cobre o layout)
- [ ] Skeleton tem shape aproximado ao conteúdo real
- [x] Spinners removidos do early-return de `isLoading`
- [ ] Estados de erro continuam funcionando após remoção dos spinners

### Autenticação e autorização
- [ ] Acesso a `/admin` sem autenticação redireciona para `/admin/login`
- [ ] Login funciona e redireciona para `/admin`
- [ ] Logout funciona e redireciona para `/admin/login`
- [ ] Fluxo `mustChangePassword` redireciona para `/admin/change-password`
- [ ] `/admin/change-password` funciona (rota não está nas nested routes)
- [ ] `/admin/login` com `AdminLoginGuard` funciona (admin já logado é redirecionado)

### Transições
- [ ] Fade-in de 150ms ao navegar entre rotas
- [ ] Animação respeita `prefers-reduced-motion`
- [ ] Sem layout shift (CLS) ao transitar de skeleton para conteúdo

### Regressão geral
- [ ] Nenhuma página admin perdeu funcionalidade
- [ ] Upload de arquivos funciona na `AdminUploadsPage`
- [ ] Filtros e paginação funcionam na `AdminVacanciesPage`
- [ ] Tabs da `AdminRecruitmentPage` funcionam
- [ ] Enriquecimento de vagas funciona na `VacancyDetailPage`
- [ ] CRUD de admins funciona na `AdminUsersPage`

---

## Mapa de dependências entre fases

```
Fase 1 (Nested Routes)
    │
    ├── é pré-requisito para Fase 2 e Fase 3
    │   (skeletons e fade-in só fazem sentido com layout persistente)
    │
    ▼
Fase 2 (Skeletons) ─── independente de Fase 3
    │
    ▼
Fase 3 (Fade-in) ─── pode ser feita logo após Fase 1

Ordem recomendada de commits:
  commit 1: Fase 1
  commit 2: Fase 2 + Fase 3 (juntas, pois são rápidas)
```

---

## Arquivos de referência

| Arquivo | Relevância |
|---|---|
| `src/presentation/App.tsx` | Estrutura de rotas — ponto central das mudanças da Fase 1 |
| `src/presentation/components/templates/AdminLayout/AdminLayout.tsx` | Shell do admin — muda nas fases 1 e 3 |
| `src/presentation/pages/admin/AdminVacanciesPage.tsx:64` | `isLoading` que gera tela branca — Fase 2 |
| `src/presentation/pages/admin/AdminRecruitmentPage.tsx:57` | `isLoading` que gera tela branca — Fase 2 |
| `src/presentation/pages/admin/VacancyDetailPage.tsx:33` | `isLoading` que gera tela branca — Fase 2 |
| `ia/ux-navigation-fluida.md` | Documento de proposta com fundamentos e justificativas |
