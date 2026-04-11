# WordPress Integration — jobs.enlite.health

> Guia de acesso a REST API do WordPress para operacoes de vagas.
> Ultima atualizacao: 2026-04-11

---

## Indice

1. [Contexto](#contexto)
2. [Acesso a REST API](#acesso-a-rest-api)
3. [Autenticacao](#autenticacao)
4. [Custom Post Types](#custom-post-types)
5. [Endpoints Uteis](#endpoints-uteis)
6. [Correlacao WP x Banco](#correlacao-wp-x-banco)
7. [Exemplos Praticos](#exemplos-praticos)

---

## Contexto

O site **jobs.enlite.health** e um WordPress hospedado no **Cloudways**. Nao temos acesso SSH ao servidor — toda interacao e feita via REST API (`/wp-json/wp/v2/`).

O WordPress exibe vagas como custom post types separados por pais. Atualmente so ha vagas publicadas para Argentina.

---

## Acesso a REST API

**Base URL**: `https://jobs.enlite.health/wp-json/wp/v2/`

**Requisitos**:
- Application Password (gerado em wp-admin > Users > Application Passwords)
- Autenticacao via HTTP Basic Auth

**Nota**: O dominio esta atras do Cloudflare (IPs 104.21.39.118 / 172.67.145.65 sao do proxy). O IP real do servidor nao e exposto.

---

## Autenticacao

Usar HTTP Basic Auth com usuario + Application Password:

```bash
curl -u 'USUARIO:APP_PASSWORD' https://jobs.enlite.health/wp-json/wp/v2/...
```

O Application Password tem espacos (ex: `waNB scSu JIf5 6KqN FvQo eZ7i`) — isso e normal, incluir os espacos na autenticacao.

**Como gerar um novo Application Password**:
1. wp-admin > Users > selecionar usuario
2. Scroll ate "Application Passwords"
3. Dar um nome (ex: "Claude CLI") > Generate
4. Copiar a senha gerada (so aparece uma vez)
5. Pode revogar a qualquer momento na mesma tela

---

## Custom Post Types

| Tipo | REST base | Descricao |
|---|---|---|
| `vagas_ar` | `/wp-json/wp/v2/vagas_ar` | Vagas Argentina |
| `vagas_br` | `/wp-json/wp/v2/vagas_br` | Vagas Brasil |
| `vagas_en` | `/wp-json/wp/v2/vagas_en` | Vagas EUA |

Para listar todos os post types disponiveis:
```bash
curl -s -u 'USER:PASS' 'https://jobs.enlite.health/wp-json/wp/v2/types'
```

---

## Endpoints Uteis

### Listar vagas publicadas

```bash
# Primeira pagina (max 100 por pagina)
curl -s -u 'USER:PASS' \
  'https://jobs.enlite.health/wp-json/wp/v2/vagas_ar?per_page=100&status=publish&page=1'
```

### Contar total de vagas

O header `X-WP-Total` retorna a contagem:
```bash
curl -s -I -u 'USER:PASS' \
  'https://jobs.enlite.health/wp-json/wp/v2/vagas_ar?per_page=1&status=publish' \
  | grep x-wp-total
```

### Buscar vaga por slug (case_number)

```bash
curl -s -u 'USER:PASS' \
  'https://jobs.enlite.health/wp-json/wp/v2/vagas_ar?slug=230'
```

### Obter campos especificos (reduzir payload)

```bash
curl -s -u 'USER:PASS' \
  'https://jobs.enlite.health/wp-json/wp/v2/vagas_ar?per_page=100&_fields=id,slug,title,status'
```

### Criar uma vaga

```bash
curl -s -u 'USER:PASS' -X POST \
  'https://jobs.enlite.health/wp-json/wp/v2/vagas_ar' \
  -H 'Content-Type: application/json' \
  -d '{"title": "747", "slug": "747", "status": "publish"}'
```

### Atualizar uma vaga

```bash
curl -s -u 'USER:PASS' -X PUT \
  'https://jobs.enlite.health/wp-json/wp/v2/vagas_ar/POST_ID' \
  -H 'Content-Type: application/json' \
  -d '{"status": "draft"}'
```

### Deletar uma vaga

```bash
# Move para lixeira
curl -s -u 'USER:PASS' -X DELETE \
  'https://jobs.enlite.health/wp-json/wp/v2/vagas_ar/POST_ID'

# Deleta permanentemente
curl -s -u 'USER:PASS' -X DELETE \
  'https://jobs.enlite.health/wp-json/wp/v2/vagas_ar/POST_ID?force=true'
```

---

## Correlacao WP x Banco

O vinculo entre WordPress e o banco (`job_postings`) e feito pelo **case_number**:

| WordPress | Banco (`job_postings`) |
|---|---|
| `slug` do post | `case_number` |
| `id` do post (WP internal) | *nao mapeado ainda* |
| `title.rendered` | `case_number` (mesmo valor do slug) |

**Importante**: O `slug` no WP e o `case_number`, NAO o `vacancy_number`. Um caso clinico pode ter multiplas vacantes, mas no WP aparece como um unico post por case.

### Query para cruzar WP x Banco

```sql
-- Vagas no banco que correspondem ao WP (substituir os numeros pelos slugs reais)
SELECT case_number, vacancy_number, status, title
FROM job_postings
WHERE country = 'AR' AND case_number IN (110, 120, 140, ...)
ORDER BY case_number;
```

---

## Exemplos Praticos

### Listar todas as vagas AR do WP com seus case_numbers

```bash
for page in 1 2; do
  curl -s -u 'USER:PASS' \
    "https://jobs.enlite.health/wp-json/wp/v2/vagas_ar?per_page=100&status=publish&page=$page&_fields=id,slug" \
    | python3 -c "import sys,json; [print(f'wp_id={v[\"id\"]} case={v[\"slug\"]}') for v in json.load(sys.stdin)]"
done
```

### Script Python para cruzamento completo

```python
import subprocess, json

def fetch_wp_vagas(user, password, post_type='vagas_ar'):
    all_vagas = []
    for page in range(1, 10):
        result = subprocess.run([
            'curl', '-s', '-u', f'{user}:{password}',
            f'https://jobs.enlite.health/wp-json/wp/v2/{post_type}?per_page=100&status=publish&page={page}&_fields=id,slug'
        ], capture_output=True, text=True)
        data = json.loads(result.stdout)
        if not isinstance(data, list) or len(data) == 0:
            break
        all_vagas.extend(data)
    return {int(v['slug']): v['id'] for v in all_vagas}

# Retorna dict: {case_number: wp_post_id}
vagas = fetch_wp_vagas('USER', 'APP_PASSWORD')
print(f'Total: {len(vagas)} vagas')
```

---

## Estado Atual da Integracao (2026-04-11)

- **Nao existe campo `wp_post_id`** na tabela `job_postings` — o vinculo nao e persistido
- **Nao existe WordPressApiClient** no backend — toda operacao e manual via curl/REST API
- O scraper existente (`JobScraperService.ts`) faz scraping HTML do site, nao usa a REST API
- **163 vagas** publicadas no WP (todas `vagas_ar`), todas com correspondencia no banco
- **39 vagas** no banco (nao-closed) sem post no WordPress

### Futuro

Para sincronizacao automatica, seria necessario:
1. Migration adicionando `wp_post_id` em `job_postings`
2. `WordPressApiClient` no backend (similar ao `TalentumApiClient`)
3. Use case de publish/unpublish (similar ao `PublishVacancyToTalentumUseCase`)
4. Backfill do `wp_post_id` para as 163 vagas existentes
