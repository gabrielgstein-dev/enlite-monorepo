# Proposta: Navegação Fluida no Painel Admin

> Diagnóstico + fundamentos UX + plano de implementação

---

## 1. O diagnóstico: por que a tela fica branca

O problema não é cosmético — é estrutural. Há **três causas independentes** que se somam:

### Causa 1 — `AdminLayout` é lazy-loaded junto com cada rota

```tsx
// App.tsx — problema aqui
const AdminLayout = lazy(() => import('./components/templates/AdminLayout/AdminLayout'));

<Route path="/admin/vacancies" element={
  <Suspense fallback={<AdminFallback />}>   // ← suspende o LAYOUT inteiro
    <AdminProtectedRoute>
      <AdminLayout>                          // ← layout desmonta/remonta
        <AdminVacanciesPage />
      </AdminLayout>
    </AdminProtectedRoute>
  </Suspense>
} />
```

Quando o usuário navega de `/admin` para `/admin/vacancies`, o React desmonta o `AdminLayout` completo, mostra o `AdminFallback` (tela branca + spinner), carrega o novo bundle, e remonta tudo do zero. **O sidebar some. O header some. Parece que o app caiu.**

### Causa 2 — Cada rota tem seu próprio `<Suspense>` isolado

Cada rota está envolvida em seu próprio boundary de Suspense. Isso significa que a transição entre qualquer duas rotas admin sempre passa pelo estado de fallback — sem exceção.

### Causa 3 — O `isLoading` das páginas renderiza `min-h-screen`

Dentro de cada página:

```tsx
// AdminVacanciesPage.tsx — problema aqui
if (isLoading) {
  return (
    <div className="w-full min-h-screen flex items-center justify-center">
      <RefreshCw className="w-12 h-12 text-primary animate-spin" />
    </div>
  );
}
```

Mesmo que o layout estivesse persistindo, o conteúdo da página o substitui inteiramente por um spinner que ocupa 100% da tela.

---

## 2. Fundamentos de UX: o que a pesquisa diz

### 2.1 — O princípio da continuidade espacial

Estudos de UX de sistemas administrativos (Nielsen Norman Group, 2024) mostram que o usuário constrói um **mapa mental** do app. Quando o sidebar e o header persistem durante a navegação, o usuário sabe **onde está** no espaço do app. Quando tudo desaparece, esse mapa mental é destruído — o usuário precisa reconstruí-lo a cada navegação. Isso causa a sensação de "ser jogado para fora do app".

**Regra de ouro:** o shell de navegação (sidebar, topbar) nunca deve desaparecer durante a navegação interna.

### 2.2 — Skeleton screens vs. spinners

O spinner diz: *"espera, não sei quanto tempo vai demorar"*.
O skeleton diz: *"o conteúdo vai aparecer aqui, nessa forma, em breve"*.

Pesquisa da Luke Wroblewski (inventor do conceito) e estudos do LinkedIn (que foi o primeiro a adotar em escala) mostram que **skeleton screens reduzem a percepção de tempo de carregamento em 30-40%**, mesmo quando o tempo real é igual. O motivo é cognitivo: o cérebro interpreta o skeleton como "conteúdo a caminho" em vez de "sistema travado".

Para áreas administrativas com tabelas e métricas, o skeleton é especialmente eficaz porque o usuário já sabe o que esperar (uma tabela, um card de métricas) e o skeleton confirma isso.

### 2.3 — Optimistic navigation

Aplicações percebidas como rápidas frequentemente não carregam dados mais rápido — elas **mostram a próxima tela imediatamente** e preenchem os dados depois. O Gmail faz isso: você clica em um email e o layout da mensagem aparece instantaneamente enquanto o conteúdo carrega. Isso é chamado de *optimistic navigation*.

### 2.4 — Transições de conteúdo

Uma transição de `opacity: 0 → 1` com 150-200ms no conteúdo da página comunica ao usuário que "algo mudou aqui" sem ser disruptiva. Não precisa de animações complexas — apenas um fade simples elimina o salto brusco entre estados.

### 2.5 — O custo do contexto perdido

Quando a tela fica branca, o usuário perde:
- A posição atual no sidebar (qual item está ativo)
- O título da seção em que estava
- A sensação de continuidade espacial

Isso aumenta a **carga cognitiva** — o usuário gasta energia mental reconstruindo onde está, em vez de focar na tarefa.

---

## 3. A solução: três mudanças cirúrgicas

A boa notícia: a estrutura do projeto já suporta tudo isso. As mudanças são **cirúrgicas e de baixo risco**.

### Mudança 1 — Nested Routes: layout como rota pai

**O padrão de React Router v6 para apps com shell persistente é usar nested routes.**
O layout se torna o pai, e as páginas se tornam os filhos. O React só remonta o que muda.

```tsx
// App.tsx — DEPOIS
// AdminLayout NÃO é mais lazy-loaded
import { AdminLayout } from './components/templates/AdminLayout/AdminLayout';

<Route
  path="/admin"
  element={
    <AdminErrorBoundary>
      <AdminProtectedRoute>
        <AdminLayout />  {/* renderiza uma vez, persiste */}
      </AdminProtectedRoute>
    </AdminErrorBoundary>
  }
>
  {/* filhos — só o conteúdo muda */}
  <Route index element={
    <Suspense fallback={<TableSkeleton />}>
      <AdminUsersPage />
    </Suspense>
  } />
  <Route path="uploads" element={
    <Suspense fallback={<UploadsSkeleton />}>
      <AdminUploadsPage />
    </Suspense>
  } />
  <Route path="vacancies" element={
    <Suspense fallback={<TableSkeleton />}>
      <AdminVacanciesPage />
    </Suspense>
  } />
  <Route path="vacancies/:id" element={
    <Suspense fallback={<DetailSkeleton />}>
      <VacancyDetailPage />
    </Suspense>
  } />
  <Route path="vacancies/:id/match" element={
    <Suspense fallback={<TableSkeleton />}>
      <VacancyMatchPage />
    </Suspense>
  } />
  <Route path="recruitment" element={
    <Suspense fallback={<DashboardSkeleton />}>
      <AdminRecruitmentPage />
    </Suspense>
  } />
</Route>
```

`AdminLayout` precisa ter um `<Outlet />` onde antes tinha `{children}`:

```tsx
// AdminLayout.tsx — DEPOIS
import { Outlet } from 'react-router-dom';

export function AdminLayout() {
  return (
    <div className="flex h-screen">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />  {/* antes: {children} */}
      </main>
    </div>
  );
}
```

**Resultado:** sidebar e header nunca desmontam. O React só atualiza o `<Outlet />`.

### Mudança 2 — Skeleton screens contextuais

Em vez de cada página retornar um `min-h-screen` spinner quando `isLoading`, as páginas retornam skeletons que imitam o layout do conteúdo real.

**Exemplo para páginas com tabela:**

```tsx
// src/presentation/components/ui/skeletons/TableSkeleton.tsx
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      {/* Header da página */}
      <div className="flex justify-between items-center">
        <div className="h-8 w-48 bg-gray-200 rounded-lg" />
        <div className="h-9 w-32 bg-gray-200 rounded-lg" />
      </div>
      {/* Filtros */}
      <div className="flex gap-3">
        <div className="h-9 w-64 bg-gray-200 rounded-lg" />
        <div className="h-9 w-32 bg-gray-200 rounded-lg" />
      </div>
      {/* Tabela */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="h-11 bg-gray-100 border-b border-gray-100" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-50">
            <div className="h-4 flex-1 bg-gray-200 rounded" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-6 w-16 bg-gray-200 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Nas páginas, o `isLoading` vira:**

```tsx
// AdminVacanciesPage.tsx — DEPOIS
if (isLoading) return <TableSkeleton rows={10} />;
// (sem min-h-screen, sem spinner)
```

**Skeletons a criar:**
| Skeleton | Usado em |
|---|---|
| `TableSkeleton` | AdminVacanciesPage, AdminUsersPage |
| `DashboardSkeleton` | AdminRecruitmentPage (métricas + gráficos) |
| `DetailSkeleton` | VacancyDetailPage |
| `UploadsSkeleton` | AdminUploadsPage |

### Mudança 3 — Fade-in no conteúdo

Uma única classe CSS aplicada ao container do conteúdo na `AdminLayout`:

```css
/* globals.css */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.page-content {
  animation: fadeIn 150ms ease-out;
}
```

```tsx
// AdminLayout.tsx
<main className="flex-1 overflow-auto">
  <div key={location.pathname} className="page-content">
    <Outlet />
  </div>
</main>
```

O `key={location.pathname}` faz o React recriar o div a cada navegação, disparando a animação novamente. 150ms é imperceptível como "animação" mas elimina o salto brusco.

---

## 4. Por que essa solução é melhor

| Critério | Antes | Depois |
|---|---|---|
| Sidebar desaparece ao navegar | Sempre | Nunca |
| Tela branca entre rotas | Sempre | Nunca |
| Feedback visual durante carregamento | Spinner genérico | Skeleton do shape real |
| Tempo percebido de carregamento | Alto | 30-40% menor (percepção) |
| Carga cognitiva do usuário | Alta | Baixa |
| Complexidade do código | Média | Menor (nested routes simplificam) |
| Risco de regressão | — | Baixo (mudanças cirúrgicas) |

**Nenhum bundle extra.** Não instala nenhuma biblioteca nova.
**Não muda a lógica de negócio.** Só muda estrutura de rotas e estados de loading.
**Não reescreve componentes.** O `AdminLayout` muda ~3 linhas.

---

## 5. Plano de implementação

### Fase 1 — Nested Routes (30 min, alto impacto)

1. Remover `lazy()` de `AdminLayout`
2. Reestruturar rotas admin em `App.tsx` para nested routes
3. Substituir `{children}` por `<Outlet />` no `AdminLayout`
4. Testar navegação entre rotas — sidebar deve persistir

### Fase 2 — Skeleton screens (1-2h, impacto visual alto)

1. Criar `TableSkeleton`, `DashboardSkeleton`, `DetailSkeleton`, `UploadsSkeleton`
2. Substituir `if (isLoading) return <spinner>` nas 4 páginas admin
3. Ajustar Suspense fallbacks para usar os skeletons específicos

### Fase 3 — Fade-in (15 min, polimento)

1. Adicionar keyframe `fadeIn` no CSS global
2. Aplicar no container do `<Outlet />` com `key={location.pathname}`

### Ordem recomendada

Fazer Fase 1 primeiro e comitar separado — é o maior ganho com menor risco.
Fases 2 e 3 podem ser feitas juntas num segundo commit.

---

## 6. Referências e fundamentos

- **Nielsen Norman Group** — "Progress Indicators Make Users Wait Less" (2024)
- **Luke Wroblewski** — "Mobile First" + skeleton screen concept (2013)
- **Lincoln Loop** — "Skeleton Screens: A Better User Experience" (2016)
- **React Router v6 docs** — Layout Routes pattern
- **Web.dev** — "Optimize Largest Contentful Paint" — perceived performance

---

## Resumo executivo

A tela branca acontece porque o `AdminLayout` é lazy-loaded e desmonta a cada navegação. A solução é mover o layout para ser uma rota pai (nested routes), o que é o padrão correto do React Router v6 para shells persistentes. Os skeletons substituem spinners genéricos por placeholders contextuais, e o fade-in elimina o salto visual. Total de linhas alteradas: ~50. Risco: baixo. Ganho de percepção de qualidade: alto.
