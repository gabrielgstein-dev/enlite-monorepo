#!/usr/bin/env python3
"""
Cruza TODAS as vagas do banco com TODAS as tarefas da lista
"Estado de Pacientes" (901304883903) no ClickUp.

Diferente da v1 (que filtrava 3 status), aqui buscamos tudo dos dois lados
e mapeamos para os 7 canonicos do roadmap (SEARCHING, SEARCHING_REPLACEMENT,
RAPID_RESPONSE, PENDING_ACTIVATION, ACTIVE, SUSPENDED, CLOSED) antes de
comparar — pra evitar falsos positivos por divergencia de capitalizacao
ou variantes PT/ES.

Detecta falso positivo critico: vaga com status PUBLICO no banco
(SEARCHING / SEARCHING_REPLACEMENT / RAPID_RESPONSE) mas que no ClickUp
esta fechada / suspensa / em ativacao pendente — apareceria pro candidato
no site WP como vaga ativa quando nao e.

Pre-requisitos:
  - CLICKUP_API_TOKEN exportado (via .env do worker-functions)
  - CSV do banco em /tmp/db_vacantes_full.csv gerado pelo agente DBA
    com colunas: case_number, vacancy_number, title, status,
    has_site_link, site_link_url, description_preview, country,
    pathology_types, updated_at, clickup_task_id

Uso:
  set -a && source worker-functions/.env && set +a
  python3 worker-functions/scripts/compare-vacantes-clickup.py

Saidas:
  /tmp/clickup_vacantes_full.csv          — todas as tasks do ClickUp
  /tmp/clickup_vs_banco_full.csv          — cruzamento completo
  /tmp/clickup_vs_banco_risco_falso_positivo.csv  — apenas casos de falso positivo
"""
import csv
import os
import sys
import urllib.parse
import urllib.request
import json
from collections import defaultdict

LIST_ID = "901304883903"
DB_CSV = "/tmp/db_vacantes_full.csv"
OUT_CLICKUP = "/tmp/clickup_vacantes_full.csv"
OUT_COMPARE = "/tmp/clickup_vs_banco_full.csv"
OUT_RISCO = "/tmp/clickup_vs_banco_risco_falso_positivo.csv"

# DB → canonical (cobre as 18 strings historicas em prod)
DB_TO_CANONICAL: dict[str, str] = {
    "BUSQUEDA": "SEARCHING",
    "searching": "SEARCHING",
    "SEARCHING": "SEARCHING",
    "REEMPLAZOS": "SEARCHING_REPLACEMENT",
    "replacement": "SEARCHING_REPLACEMENT",
    "SEARCHING_REPLACEMENT": "SEARCHING_REPLACEMENT",
    "rta_rapida": "RAPID_RESPONSE",
    "EQUIPO RESPUESTA RAPIDA": "RAPID_RESPONSE",
    "FULLY_STAFFED": "RAPID_RESPONSE",  # caso o sync ja tenha escrito
    "RAPID_RESPONSE": "RAPID_RESPONSE",
    "ACTIVACION PENDIENTE": "PENDING_ACTIVATION",
    "PENDING_ACTIVATION": "PENDING_ACTIVATION",
    "EN ESPERA": "PENDING_ACTIVATION",
    "ACTIVO": "ACTIVE",
    "ACTIVE": "ACTIVE",
    "active": "ACTIVE",
    "SUSPENDIDO TEMPORALMENTE": "SUSPENDED",
    "SUSPENDED": "SUSPENDED",
    "CLOSED": "CLOSED",
    "paused": "CLOSED",
    "closed": "CLOSED",
}

# ClickUp → canonical (cobre PT/ES/com-tilde/sem-tilde)
CLICKUP_TO_CANONICAL: dict[str, str] = {
    "busqueda": "SEARCHING",
    "búsqueda": "SEARCHING",
    "vacante abierta": "SEARCHING",
    "vacante abierto": "SEARCHING",
    "reemplazo": "SEARCHING_REPLACEMENT",
    "reemplazos": "SEARCHING_REPLACEMENT",
    "equipo de respuesta rapida": "RAPID_RESPONSE",
    "equipo de respuesta rápida": "RAPID_RESPONSE",
    "equipo respuesta rapida": "RAPID_RESPONSE",
    "equipo respuesta rápida": "RAPID_RESPONSE",
    "equipe de resposta rapida": "RAPID_RESPONSE",
    "equipe de resposta rápida": "RAPID_RESPONSE",
    "activación pendiente": "PENDING_ACTIVATION",
    "activacion pendiente": "PENDING_ACTIVATION",
    "en espera": "PENDING_ACTIVATION",
    "activo": "ACTIVE",
    "suspendido temporalmente": "SUSPENDED",
    "suspendido temporariamente": "SUSPENDED",
    "baja": "CLOSED",
    "alta": "CLOSED",
    "closed": "CLOSED",
    "admisión": "ADMISSION",
    "admision": "ADMISSION",
}

# Status canonicos que aparecem no endpoint publico
PUBLIC_STATUSES: set[str] = {"SEARCHING", "SEARCHING_REPLACEMENT", "RAPID_RESPONSE"}


def db_canonical(s: str | None) -> str:
    if not s:
        return "CLOSED"  # NULL → CLOSED conforme decisao de PO
    return DB_TO_CANONICAL.get(s.strip(), f"UNKNOWN({s.strip()})")


def clickup_canonical(s: str | None) -> str:
    if not s:
        return ""
    return CLICKUP_TO_CANONICAL.get(s.strip().lower(), f"UNKNOWN({s.strip()})")


def fetch_all_tasks(token: str) -> list[dict]:
    """Busca TODAS as tarefas (incluindo closed e subtasks) — sem filtro de status."""
    tasks: list[dict] = []
    page = 0
    while True:
        qs = urllib.parse.urlencode([
            ("archived", "false"),
            ("page", str(page)),
            ("subtasks", "true"),
            ("include_closed", "true"),
        ])
        url = f"https://api.clickup.com/api/v2/list/{LIST_ID}/task?{qs}"
        req = urllib.request.Request(url, headers={"Authorization": token})
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode())
        batch = payload.get("tasks", [])
        tasks.extend(batch)
        print(f"  page {page}: +{len(batch)} (total {len(tasks)})", file=sys.stderr)
        if payload.get("last_page") or not batch:
            break
        page += 1
    return tasks


def extract_caso(task: dict) -> str | None:
    for cf in task.get("custom_fields", []):
        if cf.get("name") == "Caso Número":
            v = cf.get("value")
            return str(v).strip() if v not in (None, "") else None
    return None


def main() -> int:
    token = os.environ.get("CLICKUP_API_TOKEN")
    if not token:
        print("ERROR: CLICKUP_API_TOKEN nao esta no ambiente.", file=sys.stderr)
        return 2
    if not os.path.exists(DB_CSV):
        print(f"ERROR: {DB_CSV} nao existe. Rode o agente DBA antes.", file=sys.stderr)
        return 2

    print(f"[1/3] Baixando ClickUp list {LIST_ID} (tudo: include_closed=true)", file=sys.stderr)
    raw = fetch_all_tasks(token)
    print(f"       {len(raw)} tarefas retornadas\n", file=sys.stderr)

    # Resolve case_number herdando do parent quando subtask
    by_id = {t["id"]: t for t in raw}
    caso_direct = {tid: extract_caso(t) for tid, t in by_id.items()}

    def resolve_caso(tid: str | None, depth: int = 0) -> str | None:
        if not tid or depth > 5:
            return None
        if caso_direct.get(tid):
            return caso_direct[tid]
        parent = by_id.get(tid, {}).get("parent")
        return resolve_caso(parent, depth + 1) if parent else None

    flat: list[dict] = []
    for t in raw:
        flat.append({
            "task_id": t["id"],
            "name": t.get("name", ""),
            "status": (t.get("status") or {}).get("status", ""),
            "parent": t.get("parent"),
            "caso_number": resolve_caso(t["id"]),
            "url": t.get("url", ""),
        })

    # Agrega por caso: prefere a tarefa parent (sem parent) com caso direto
    by_caso: dict[str, dict] = {}
    for r in flat:
        caso = r["caso_number"]
        if not caso:
            continue
        existing = by_caso.get(caso)
        is_parent = r["parent"] is None
        if existing is None:
            by_caso[caso] = r
        else:
            if is_parent and existing["parent"] is not None:
                by_caso[caso] = r

    # Escreve CSV ClickUp completo
    with open(OUT_CLICKUP, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "caso_number", "task_id", "name", "status", "status_canonical",
            "parent", "url",
        ])
        w.writeheader()
        for caso, r in sorted(by_caso.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
            w.writerow({
                "caso_number": caso,
                "task_id": r["task_id"],
                "name": r["name"],
                "status": r["status"],
                "status_canonical": clickup_canonical(r["status"]),
                "parent": r["parent"] or "",
                "url": r["url"],
            })

    # Carrega banco
    db_by_caso: dict[str, dict] = {}
    db_no_caso: list[dict] = []
    with open(DB_CSV, newline="") as f:
        for row in csv.DictReader(f):
            caso = (row.get("case_number") or "").strip()
            if not caso:
                db_no_caso.append(row)
                continue
            existing = db_by_caso.get(caso)
            if existing is None or row.get("updated_at", "") > existing.get("updated_at", ""):
                db_by_caso[caso] = row

    # Cruzamento + deteccao de falso positivo
    print(f"[2/3] Cruzando por case_number\n", file=sys.stderr)
    all_casos = sorted(set(by_caso) | set(db_by_caso), key=lambda c: int(c) if c.isdigit() else 0)

    counts_situacao: dict[str, int] = defaultdict(int)
    counts_risco: int = 0
    counts_publico_db: int = 0
    counts_publico_db_sem_site: int = 0
    rows_out: list[dict] = []
    rows_risco: list[dict] = []

    for caso in all_casos:
        cu = by_caso.get(caso)
        db = db_by_caso.get(caso)

        cu_canon = clickup_canonical(cu["status"]) if cu else ""
        db_canon = db_canonical(db["status"]) if db else ""

        # Classificacao macro
        if cu and db:
            sit = "OK" if cu_canon == db_canon else "DIVERGENTE"
        elif cu:
            sit = "SO_CLICKUP"
        else:
            sit = "SO_BANCO"
        counts_situacao[sit] += 1

        # Falso positivo: banco diz publico mas ClickUp diz outro / nao existe
        is_publico_db = db_canon in PUBLIC_STATUSES
        is_publico_cu = cu_canon in PUBLIC_STATUSES
        risco_fp = is_publico_db and not is_publico_cu
        if is_publico_db:
            counts_publico_db += 1
            has_site = (db.get("has_site_link", "") in ("t", "true", "True", "1")) if db else False
            if not has_site:
                counts_publico_db_sem_site += 1
        if risco_fp:
            counts_risco += 1

        row = {
            "case_number": caso,
            "situacao": sit,
            "risco_falso_positivo": "SIM" if risco_fp else "",
            "clickup_task_id": cu["task_id"] if cu else "",
            "clickup_name": cu["name"] if cu else "",
            "clickup_status": cu["status"] if cu else "",
            "clickup_status_canonical": cu_canon,
            "banco_vacancy_number": db["vacancy_number"] if db else "",
            "banco_status": db["status"] if db else "",
            "banco_status_canonical": db_canon,
            "banco_title": db["title"] if db else "",
            "banco_has_site_link": (db.get("has_site_link", "") if db else ""),
            "banco_site_link_url": (db.get("site_link_url", "") if db else ""),
            "banco_clickup_task_id": (db.get("clickup_task_id", "") if db else ""),
            "clickup_url": cu["url"] if cu else "",
        }
        rows_out.append(row)
        if risco_fp:
            rows_risco.append(row)

    fieldnames = [
        "case_number", "situacao", "risco_falso_positivo",
        "clickup_task_id", "clickup_name", "clickup_status", "clickup_status_canonical",
        "banco_vacancy_number", "banco_status", "banco_status_canonical", "banco_title",
        "banco_has_site_link", "banco_site_link_url", "banco_clickup_task_id",
        "clickup_url",
    ]

    with open(OUT_COMPARE, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows_out)

    with open(OUT_RISCO, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows_risco)

    # Resumo
    print("[3/3] Resumo:", file=sys.stderr)
    print(f"  Total ClickUp tasks com case:  {len(by_caso)}", file=sys.stderr)
    print(f"  Total banco rows com case:      {len(db_by_caso)}", file=sys.stderr)
    print(f"  Banco sem case_number:          {len(db_no_caso)}", file=sys.stderr)
    print(f"", file=sys.stderr)
    print(f"  Situacao:", file=sys.stderr)
    for k in ("OK", "DIVERGENTE", "SO_CLICKUP", "SO_BANCO"):
        print(f"    {k:12s} {counts_situacao[k]}", file=sys.stderr)
    print(f"", file=sys.stderr)
    print(f"  Vagas com status PUBLICO no banco:        {counts_publico_db}", file=sys.stderr)
    print(f"   - sem social_short_links.site:           {counts_publico_db_sem_site}", file=sys.stderr)
    print(f"   - com risco de FALSO POSITIVO:           {counts_risco}", file=sys.stderr)
    print(f"     (apareceriam no WP mas ClickUp diz nao publicar)", file=sys.stderr)
    print(f"", file=sys.stderr)
    print(f"  Arquivos:", file=sys.stderr)
    print(f"    {OUT_CLICKUP}", file=sys.stderr)
    print(f"    {OUT_COMPARE}", file=sys.stderr)
    print(f"    {OUT_RISCO}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
