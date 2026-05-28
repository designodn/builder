#!/usr/bin/env python3
"""
aggregate-sessions.py — собирает session-telemetry issues в tests/sessions.jsonl
и обновляет docs/LEADERBOARD.md с агрегированными счётчиками.

Запускается из .github/workflows/aggregate-sessions.yml (cron + workflow_dispatch).
Unit-тесты для `compute_leaderboard()`: `tools/test-aggregate-sessions.py`.

Алгоритм:
1. Через gh CLI получает все issues с label `session-telemetry` (open + closed).
2. Из body каждой извлекает JSON-блок (```json ... ```).
3. Валидирует обязательные поля (session_id, designer_login, component).
4. Дедуп по session_id — если запись уже в sessions.jsonl, пропускаем.
5. Аппендит новые в tests/sessions.jsonl (по одной JSON-строке на сессию).
6. Пересчитывает агрегаты, перезаписывает docs/LEADERBOARD.md.

Workflow потом коммитит, если есть diff.

Идемпотентен: повторный запуск без новых issues = no-op.
"""

import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

REPO = "kotik-botik/kotik-botik"
SESSIONS_JSONL = Path("tests/sessions.jsonl")
LEADERBOARD_MD = Path("docs/LEADERBOARD.md")
TELEMETRY_SCHEMA = Path("rules/schema/session-telemetry.schema.json")

REQUIRED_FIELDS = ("session_id", "designer_login", "component")
JSON_BLOCK_RE = re.compile(r"```json\s*\n(.*?)\n```", re.DOTALL)

# Загружаем schema для мягкой валидации. Только warning, не hard fail —
# старые записи без новых полей должны проходить (поля опциональны в schema).
# Если jsonschema не установлен или schema не найдена — валидация пропускается,
# но мы громко сообщаем об этом в stderr. Иначе A-056 soft-валидация
# незаметно деградирует до нуля при обновлении CI image / локального env.
_schema_validator = None
try:
    import jsonschema  # type: ignore
    if TELEMETRY_SCHEMA.exists():
        _telemetry_schema = json.loads(TELEMETRY_SCHEMA.read_text(encoding="utf-8"))
        _schema_validator = jsonschema.Draft202012Validator(_telemetry_schema)
    else:
        sys.stderr.write(
            f"WARN: aggregate-sessions: TELEMETRY_SCHEMA не найден ({TELEMETRY_SCHEMA}), "
            f"soft-валидация A-056 отключена.\n"
        )
except ImportError:
    sys.stderr.write(
        "WARN: aggregate-sessions: модуль 'jsonschema' не установлен "
        "(pip install jsonschema), soft-валидация A-056 отключена.\n"
    )
except Exception as e:
    sys.stderr.write(
        f"WARN: aggregate-sessions: не удалось загрузить TELEMETRY_SCHEMA: {e}. "
        f"Soft-валидация A-056 отключена.\n"
    )


def _warn_schema(data: dict, context: str) -> None:
    if _schema_validator is None:
        return
    errors = list(_schema_validator.iter_errors(data))
    if errors:
        sid = data.get("session_id", "(no session_id)")
        print(
            f"WARNING: schema violation in {context} [{sid}]:",
            file=sys.stderr,
        )
        for err in errors[:3]:
            print(f"  {err.json_path} — {err.message}", file=sys.stderr)

# Имена полей `user_feedback_*` в телеметрии сохранены намеренно, хотя
# slash-команда переименована в `/fb` (конфликт с нативным `/feedback`
# в Claude Code). Поля — это публичная схема телеметрии в
# session-telemetry issues; переименование сломает агрегатор и историю
# в sessions.jsonl. Не «чинить» в один проход — нужна миграция схемы.

# Известные значения `user_feedback_baseline_source` — всё, что не из этого
# списка, попадает в `other`-bucket. Если добавляешь новый источник
# в builder.md — добавь его сюда.
KNOWN_BASELINE_SOURCES: tuple = ("search", "list", None)


def fetch_issues() -> list[dict]:
    """Все session-telemetry issues — open и closed, через REST + пагинацию.

    Используем REST `/repos/{owner}/{repo}/issues` (а не search/issues),
    потому что у search API hard-cap 1000 результатов на запрос. REST
    `issues` пагинируется без верхнего предела через `gh api --paginate`.

    Фильтруем PR'ы вручную — endpoint /issues возвращает и issues, и PR'ы
    (у PR'а есть поле `pull_request`).
    """
    result = subprocess.run(
        [
            "gh", "api", "--paginate",
            f"/repos/{REPO}/issues",
            "-f", "labels=session-telemetry",
            "-f", "state=all",
            "-f", "per_page=100",
            "--jq", ".[] | select(.pull_request == null) | {number, body, createdAt: .created_at, state}",
        ],
        capture_output=True, text=True, check=True,
    )
    # `gh api --paginate` с --jq эмитит по одному JSON-объекту в строку
    # на каждой странице (NDJSON). Парсим построчно с логированием битых.
    issues = []
    for lineno, line in enumerate(result.stdout.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            issues.append(json.loads(line))
        except json.JSONDecodeError as e:
            print(
                f"WARNING: skipping malformed jq line {lineno}: {e}",
                file=sys.stderr,
            )
    return issues


def extract_telemetry(body: str, issue_number: int | None = None) -> dict | None:
    """Достаёт JSON из ```json-блока. None если не нашёл или невалидно.

    На невалидный JSON логируем в stderr — issue body мог поехать
    из-за сломанного шаблона builder.md или ручной правки.

    TODO (item 4 из backlog PR #170 ревью): добавить парс новых полей
    из PR #169 / #170:
      - gates_passed: [{id, status, reason, ts}, ...]
      - text_layout: [{frame, hierarchy[]}, ...]
      - json_layout: [{frame, imports[], slots{}}, ...]
    Из gates_passed считать метрики `gate_fail_rate{gate=G-I2}` за 7-дневное
    окно, `gate_dwell_time` (продолжительность этапа между двумя ts).
    Без этого новые поля forward-compatible, но без consumer'а — лежат
    в issue body «впрок». См. issue (заводится в этом же PR).
    """
    if not body:
        return None
    match = JSON_BLOCK_RE.search(body)
    if not match:
        return None
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError as e:
        print(
            f"WARNING: malformed JSON in issue #{issue_number}: {e}",
            file=sys.stderr,
        )
        return None
    # Обязательные поля
    if not all(data.get(f) for f in REQUIRED_FIELDS):
        return None
    _warn_schema(data, f"issue #{issue_number}")
    return data


def load_existing() -> tuple[list[dict], set[str]]:
    """Существующие записи и множество уже виденных session_id."""
    if not SESSIONS_JSONL.exists():
        return [], set()
    records = []
    seen = set()
    for line in SESSIONS_JSONL.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        records.append(rec)
        if rec.get("session_id"):
            seen.add(rec["session_id"])
    return records, seen


def _exclude_auto_mode(records: list[dict]) -> list[dict]:
    """Filters out adversarial `/test --full` sessions.

    Маркер `_session.auto_mode = true` ставится в Шаге 0.5 test.md.
    Synthetic-сессии не должны попадать ни в leaderboard, ни в drift-
    summary, ни в rule-contributions — иначе все три аггрегата
    деградируют от synthetic-данных. Schema объявляет `auto_mode` как
    boolean — фильтр строгий (`is not True`), strings/ints не ловит
    намеренно (валидируются на приёме).
    """
    return [r for r in records if r.get("auto_mode") is not True]


def compute_leaderboard(records: list[dict]) -> str:
    """Формирует Markdown с агрегатами. Без публичных имён."""
    records = _exclude_auto_mode(records)
    total = len(records)
    designers = {r.get("designer_login") for r in records if r.get("designer_login")}
    successful = sum(1 for r in records if r.get("import_success") is True)
    success_pct = (successful / total * 100) if total else 0

    pulse_counts = Counter(
        (r.get("pulse") or {}).get("mood", "skipped") for r in records
    )
    component_counts = Counter(r.get("component") for r in records if r.get("component"))
    component_success = Counter(
        r.get("component") for r in records
        if r.get("component") and r.get("import_success") is True
    )

    # Personal thanks (Под-шаг 8.X) — мониторинг покрытия фичи и прав search'а.
    # Считаем по всем записям, у которых поле явно присутствует. Старые
    # сессии (до фичи) не считаем ни в числителе, ни в знаменателе.
    pt_records = [r for r in records if "personal_thanks_emitted" in r]
    pt_total = len(pt_records)
    pt_emitted = sum(1 for r in pt_records if r.get("personal_thanks_emitted") is True)
    pt_emitted_pct = (pt_emitted / pt_total * 100) if pt_total else 0

    baseline_sources = Counter(
        r.get("user_feedback_baseline_source")
        for r in records
        if "user_feedback_baseline_source" in r
    )
    baseline_total = sum(baseline_sources.values())
    baseline_search = baseline_sources.get("search", 0)
    baseline_list = baseline_sources.get("list", 0)
    baseline_null = baseline_sources.get(None, 0)
    # `other` ловит дрейф значений: если в будущем кто-то запишет
    # неожиданное `"unknown"` или опечатку, оно не потеряется в выводе.
    baseline_other = sum(
        n for k, n in baseline_sources.items() if k not in KNOWN_BASELINE_SOURCES
    )
    baseline_ok_pct = (
        (baseline_search + baseline_list) / baseline_total * 100
    ) if baseline_total else 0

    # Пропущенные gate'ы перед Figma (A-056). Считаем только сессии,
    # дошедшие до этапа figma_build — у них обязаны быть оба апрува
    # (Шаг 6 I и Шаг 7 чек-лист). Поля могут отсутствовать в старых
    # записях — тогда сессия не учитывается ни в числителе, ни в
    # знаменателе. Старый архив без полей не шумит.
    #
    # Внимание к асимметрии: внутренний фильтр — `or` (хоть одно из gate-
    # полей задано → сессия в знаменателе), счётчики ниже — `is not True`
    # (отсутствие поля = пропущенный gate). Это намеренный perimeter:
    # Builder обязан выставить ОБА поля до `figma_build = true`; одно
    # заданное + второе отсутствующее — это уже частичный пропуск, а не
    # «нет данных». Не «причёсывать» до симметричного `and` — это
    # сломает test_skipped_gates_asymmetric_field_presence и тихо
    # схлопнет метрику для гибридных сессий.
    gate_records = [
        r for r in records
        if (r.get("stages") or {}).get("figma_build") is True
        and ("i_approval_received" in r or "checklist_approved" in r)
    ]
    gate_total = len(gate_records)
    gate_skipped_i = sum(
        1 for r in gate_records if r.get("i_approval_received") is not True
    )
    gate_skipped_checklist = sum(
        1 for r in gate_records if r.get("checklist_approved") is not True
    )
    gate_skipped_either = sum(
        1 for r in gate_records
        if r.get("i_approval_received") is not True
        or r.get("checklist_approved") is not True
    )

    # Намеренно БЕЗ timestamp в файле — иначе каждый прогон даёт diff, и
    # workflow коммитит «обновили timestamp» каждый день. Дата прогона
    # видна в git log по commit-timestamp коммита workflow'а.
    lines = [
        "# Leaderboard (заглушка)",
        "",
        "> Автоматически обновляется workflow'ом `aggregate-sessions.yml` раз в сутки.",
        "> Сейчас — счётчики без публичных имён дизайнеров. Игровая механика — позже.",
        "> Время последнего обновления — в `git log` коммита от `github-actions[bot]`.",
        "",
        "## Summary",
        "",
        f"- **Всего сессий:** {total}",
        f"- **Уникальных дизайнеров:** {len(designers)}",
        f"- **Успешных Figma-сборок:** {successful} ({success_pct:.0f}% от завершённых)",
        f"- **Pulse:positive:** {pulse_counts.get('positive', 0)}",
        f"- **Pulse:negative:** {pulse_counts.get('negative', 0)}",
        f"- **Pulse:mixed:** {pulse_counts.get('mixed', 0)}",
        f"- **Pulse:neutral:** {pulse_counts.get('neutral', 0)}",
        f"- **Pulse:skipped:** {pulse_counts.get('skipped', 0)}",
        "",
    ]

    # Personal thanks coverage — секция появляется, только если есть хоть одна
    # сессия с этими полями. На старом архиве без поля — секция скрыта.
    if pt_total or baseline_total:
        lines.extend([
            "## Personal thanks (Под-шаг 8.X)",
            "",
            f"- **Сессий с полем `personal_thanks_emitted`:** {pt_total}",
            f"- **`personal_thanks_emitted = true`:** {pt_emitted} ({pt_emitted_pct:.0f}%)",
            f"- **`user_feedback_baseline_source` — search:** {baseline_search}",
            f"- **`user_feedback_baseline_source` — list (fallback):** {baseline_list}",
            f"- **`user_feedback_baseline_source` — null (упало или kill-switch):** {baseline_null}",
        ])
        if baseline_other > 0:
            # Видимый сигнал, если в значениях появились неожиданные строки.
            # Перечисляем сами значения, чтобы было сразу понятно что чинить.
            other_values = sorted(
                str(k) for k in baseline_sources
                if k not in KNOWN_BASELINE_SOURCES
            )
            lines.append(
                f"- **`user_feedback_baseline_source` — other:** {baseline_other} "
                f"({', '.join(other_values)})"
            )
        lines.extend([
            f"- **Baseline собрался (search+list):** {baseline_ok_pct:.0f}% от сессий с полем",
            "",
        ])

    # Skipped gates (A-056) — секция появляется, только если есть сессии
    # с полями `i_approval_received`/`checklist_approved`. На старом архиве
    # без полей секция скрыта, шума не даёт.
    if gate_total:
        gate_skipped_pct = (gate_skipped_either / gate_total * 100) if gate_total else 0
        lines.extend([
            "## Пропущенные gate'ы перед Figma (A-056)",
            "",
            f"- **Сессий с figma_build = true и telemetry-полями:** {gate_total}",
            f"- **Пропустили I-апрув (Шаг 6 раскладка):** {gate_skipped_i}",
            f"- **Пропустили чек-лист (Шаг 7 содержимое):** {gate_skipped_checklist}",
            f"- **Любой из двух gate'ов пропущен:** {gate_skipped_either} ({gate_skipped_pct:.0f}%)",
            "",
        ])

    if component_counts:
        lines.extend([
            "## По компонентам (топ-10 по числу сессий)",
            "",
            "| Компонент | Сессий | Успешно |",
            "|---|---:|---:|",
        ])
        for comp, count in component_counts.most_common(10):
            succ = component_success.get(comp, 0)
            # Экранируем `|` и backticks в имени, чтобы вредоносный issue
            # body не сломал markdown-таблицу. Bare-minimum hardening.
            safe = (
                comp.replace("|", "\\|")
                .replace("`", "ʼ")
                .replace("\n", " ")
                .replace("\r", " ")
            )
            lines.append(f"| `{safe}` | {count} | {succ} |")
        lines.append("")

    return "\n".join(lines) + "\n"


def compute_drift_summary(
    records: list[dict],
    window_days: int = 7,
    now: datetime | None = None,
) -> str:
    """Markdown-summary дрейфа за последние `window_days` дней.

    Используется `/fbAnalyzer` в pinned digest — секция «Personal thanks drift».
    Если в значениях `user_feedback_baseline_source` появилось что-то
    неожиданное, эта секция засветит сигнал, не дожидаясь правки руками.

    `now` параметризовано для детерминированных тестов. В проде — `None`,
    берётся текущий UTC.
    """
    records = _exclude_auto_mode(records)
    if now is None:
        now = datetime.now(timezone.utc)
    cutoff_seconds = window_days * 24 * 3600

    recent = []
    for r in records:
        ts_str = r.get("ts_end") or r.get("ts_start")
        if not ts_str:
            continue
        try:
            # `Z`-суффикс → `+00:00` для fromisoformat — оставлено
            # для совместимости с Python 3.10 (нативно `Z` понимает 3.11+).
            ts = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue
        if ts.tzinfo is None:
            # Naive timestamp — считаем UTC, иначе total_seconds упадёт.
            ts = ts.replace(tzinfo=timezone.utc)
        if (now - ts).total_seconds() <= cutoff_seconds:
            recent.append(r)

    if not recent:
        return f"_За последние {window_days} дней сессий нет._\n"

    baseline_sources = Counter(
        r.get("user_feedback_baseline_source")
        for r in recent
        if "user_feedback_baseline_source" in r
    )
    other_values = sorted(
        str(k) for k in baseline_sources if k not in KNOWN_BASELINE_SOURCES
    )
    other_count = sum(
        n for k, n in baseline_sources.items() if k not in KNOWN_BASELINE_SOURCES
    )

    pt_total = sum(1 for r in recent if "personal_thanks_emitted" in r)
    pt_emitted = sum(
        1 for r in recent if r.get("personal_thanks_emitted") is True
    )

    lines = [
        f"- Сессий за {window_days} дней: {len(recent)}",
        f"- С `personal_thanks_emitted = true`: {pt_emitted}/{pt_total}",
    ]
    if other_count > 0:
        lines.append(
            f"- ⚠️ Дрейф `user_feedback_baseline_source`: {other_count} "
            f"({', '.join(other_values)})"
        )
    else:
        lines.append("- Дрейф `user_feedback_baseline_source`: нет")
    return "\n".join(lines) + "\n"


def _plural_vklad(n: int) -> str:
    """Русское согласование «вклад / вклада / вкладов» по числительному.

    1, 21, 31 → «вклад»; 2-4, 22-24 → «вклада»; 0, 5-20, 25-30 → «вкладов».
    """
    n10 = n % 10
    n100 = n % 100
    if n10 == 1 and n100 != 11:
        return "вклад"
    if n10 in (2, 3, 4) and n100 not in (12, 13, 14):
        return "вклада"
    return "вкладов"


def compute_rule_contributions_summary(
    records: list[dict],
    window_days: int = 7,
    now: datetime | None = None,
) -> str:
    """Markdown-summary вкладов дизайнеров в правила за `window_days` дней.

    Используется `/fbAnalyzer` в pinned digest — секция «Вклады дизайнеров
    в правила». Группирует записи `rule_contributions[]` из всех recent
    сессий по `slug`. Если у одного slug ≥2 вкладов от разных дизайнеров —
    выделяет как кандидат на скорый доразбор.

    Hint'ы с `<no contribution>` фильтруются — это маркер «дизайнер
    отказался отвечать», в digest не идёт.
    """
    records = _exclude_auto_mode(records)
    if now is None:
        now = datetime.now(timezone.utc)
    cutoff_seconds = window_days * 24 * 3600

    contributions: dict[str, list[dict]] = {}
    for r in records:
        ts_str = r.get("ts_end") or r.get("ts_start")
        if not ts_str:
            continue
        try:
            ts = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if (now - ts).total_seconds() > cutoff_seconds:
            continue

        designer = r.get("designer_login", "unknown")
        session_id = r.get("session_id", "")
        for c in r.get("rule_contributions", []) or []:
            slug = c.get("slug")
            hint = c.get("hint", "")
            if not slug or hint == "<no contribution>" or not hint:
                continue
            contributions.setdefault(slug, []).append({
                "component": c.get("component", slug),
                "designer": designer,
                "hint": hint,
                "session_id": session_id,
            })

    if not contributions:
        return "—\n"

    lines = []
    for slug in sorted(contributions.keys()):
        items = contributions[slug]
        unique_designers = {item["designer"] for item in items}
        component = items[0]["component"]
        marker = ""
        if len(unique_designers) >= 2:
            marker = " · 🔥 ≥2 дизайнеров — кандидат приоритизации"
        lines.append(
            f"- **{component}** (`{slug}`) — {len(items)} {_plural_vklad(len(items))}{marker}:"
        )
        for item in items:
            session_ref = f" (session {item['session_id']})" if item["session_id"] else ""
            lines.append(f"  - @{item['designer']}: «{item['hint']}»{session_ref}")
    return "\n".join(lines) + "\n"


def compute_divergence_issues(records: list[dict]) -> list[dict]:
    """Извлекает кандидатов для auto:bug:divergence-* / auto:bug:structural-gap
    из rule_contributions[] всех session-telemetry записей.

    Используется /fbAnalyzer Шаг 2.5 — конвертация real-session diagnostics
    в actionable GitHub issues. Идемпотентность обеспечивается dedup-key'ом
    из 5 полей (session_id, slug, slotProp, path, divergence_step). Reшение
    о фактическом создании issue в GitHub принимает скилл — эта функция
    только готовит кандидатов.

    Возвращает list of {
      dedup_key: str,  # join("|", [session_id, slug, slotProp, path, step])
      session_id: str,
      slug: str,
      slotProp: str,
      path: str,       # joined path-array, "" если нет
      type: str,       # "structural-gap" | "divergence"
      divergence_step: str,  # для divergence; "" для structural-gap
      label: str,      # auto:bug:divergence-<step> или auto:bug:structural-gap
      hint: str,       # человеческое описание для issue body
      contrib: dict,   # full original rule_contribution для JSON-блока в body
    }

    Фильтры:
    - type == "usage-hint" → исключаем (только digest summary, см. spec).
    - type == "structural-gap" → включаем, label = auto:bug:structural-gap.
    - type == "divergence" + divergence_step → включаем, label = auto:bug:divergence-<step>.
    - Любой другой type / отсутствие session_id / отсутствие slug → пропуск.
    """
    # Маппинг divergence_step → label suffix. Если step не в этом списке,
    # вешаем auto:bug:divergence-unknown как fallback (вместо "unknown" дословно).
    KNOWN_STEPS = {
        "forgotten_text": "text",
        "role_no_match": "role-no-match",
        "role_conflict": "role-conflict",
        "unresolved_gap": "unresolved-gap",
        "unresolvable_force": "unresolvable-force",
        "unknown": "unknown",
        "H": "h",
        "I-drilldown": "i-drilldown",
    }

    out: list[dict] = []
    seen_keys: set[str] = set()

    for rec in records:
        session_id = rec.get("session_id")
        if not session_id:
            continue
        contribs = rec.get("rule_contributions") or []
        if not isinstance(contribs, list):
            continue
        for c in contribs:
            if not isinstance(c, dict):
                continue
            ctype = c.get("type")
            if ctype == "usage-hint":
                continue  # только digest, см. spec
            slug = c.get("slug")
            if not slug:
                continue
            slot_prop = c.get("slotProp") or ""
            path_val = c.get("path") or []
            path_str = "/".join(path_val) if isinstance(path_val, list) else str(path_val)

            if ctype == "structural-gap":
                label_suffix = "structural-gap"
                divergence_step = ""
                hint_base = "Builder Шаг 6 E.2 — slot без guidance"
            elif ctype == "divergence":
                step = c.get("divergence_step") or "unknown"
                suffix = KNOWN_STEPS.get(step, "unknown")
                label_suffix = f"divergence-{suffix}"
                divergence_step = step
                hint_base = f"divergence_step={step}"
            else:
                continue  # неизвестный type

            dedup_key = "|".join([session_id, slug, slot_prop, path_str, divergence_step])
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)

            label = f"auto:bug:{label_suffix}"
            out.append({
                "dedup_key": dedup_key,
                "session_id": session_id,
                "slug": slug,
                "slotProp": slot_prop,
                "path": path_str,
                "type": ctype,
                "divergence_step": divergence_step,
                "label": label,
                "hint": hint_base,
                "contrib": c,
            })
    return out


def main() -> int:
    issues = fetch_issues()
    existing_records, seen_ids = load_existing()

    new_records = []
    skipped_no_json = 0
    skipped_dup = 0
    in_run_collisions = 0

    seen_in_this_run: dict[str, int] = {}

    for issue in issues:
        data = extract_telemetry(issue.get("body", ""), issue.get("number"))
        if not data:
            skipped_no_json += 1
            continue
        sid = data["session_id"]
        if sid in seen_ids:
            skipped_dup += 1
            continue
        # Collision: тот же session_id у двух разных issues в текущем фетче.
        # Не data corruption (мы берём первого, jsonl остаётся консистентным),
        # но это аномалия — должна быть видна в логе.
        if sid in seen_in_this_run:
            in_run_collisions += 1
            print(
                f"WARNING: session_id collision: {sid} встречается в issues "
                f"#{seen_in_this_run[sid]} и #{issue.get('number')}. "
                f"Беру первое, остальные отбрасываю.",
                file=sys.stderr,
            )
            continue
        seen_in_this_run[sid] = issue.get("number")
        seen_ids.add(sid)
        new_records.append(data)

    # Раздельные счётчики: cross-run (уже в sessions.jsonl) vs in-run
    # (тот же session_id у двух разных issues в одном фетче — аномалия,
    # сигнал что builder.md теряет уникальность UUID, issue #82).
    print(
        f"Issues: {len(issues)}, "
        f"new: {len(new_records)}, "
        f"already-seen (cross-run): {skipped_dup}, "
        f"in-run collisions: {in_run_collisions}, "
        f"no-valid-json: {skipped_no_json}"
    )

    # Дописать в sessions.jsonl
    if new_records:
        SESSIONS_JSONL.parent.mkdir(parents=True, exist_ok=True)
        with SESSIONS_JSONL.open("a", encoding="utf-8") as f:
            for rec in new_records:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # Перепиcать LEADERBOARD.md (всегда — даже без новых, чтобы обновить timestamp)
    all_records = existing_records + new_records
    LEADERBOARD_MD.parent.mkdir(parents=True, exist_ok=True)
    LEADERBOARD_MD.write_text(compute_leaderboard(all_records), encoding="utf-8")

    return 0


if __name__ == "__main__":
    # CLI: --drift-summary [N] — печатает markdown-summary за N дней
    # (default 7, min 1) из tests/sessions.jsonl. Используется
    # /fbAnalyzer в digest. Read-only, ничего не пишет.
    if "--drift-summary" in sys.argv:
        idx = sys.argv.index("--drift-summary")
        window_days = 7
        if idx + 1 < len(sys.argv):
            try:
                window_days = max(1, int(sys.argv[idx + 1]))
            except ValueError:
                pass  # оставляем 7
        existing_records, _ = load_existing()
        print(compute_drift_summary(existing_records, window_days=window_days), end="")
        sys.exit(0)

    # CLI: --rule-contributions [N] — markdown-summary вкладов дизайнеров
    # в правила за N дней (default 7, min 1). /fbAnalyzer вставляет вывод
    # в digest без модификации. Read-only.
    if "--rule-contributions" in sys.argv:
        idx = sys.argv.index("--rule-contributions")
        window_days = 7
        if idx + 1 < len(sys.argv):
            try:
                window_days = max(1, int(sys.argv[idx + 1]))
            except ValueError:
                pass
        existing_records, _ = load_existing()
        print(
            compute_rule_contributions_summary(
                existing_records, window_days=window_days
            ),
            end="",
        )
        sys.exit(0)

    # CLI: --divergence-candidates [session-json-file] — выдаёт JSON list
    # кандидатов для /fbAnalyzer Шаг 2.5 (auto-extracted divergences).
    # Если файл не указан — читает из stdin (один JSON object = один _session,
    # либо JSONL для batch). Скилл вызывает после extract_telemetry на body
    # session-telemetry issue. Read-only.
    if "--divergence-candidates" in sys.argv:
        idx = sys.argv.index("--divergence-candidates")
        if idx + 1 < len(sys.argv):
            with open(sys.argv[idx + 1], "r", encoding="utf-8") as f:
                raw = f.read()
        else:
            raw = sys.stdin.read()
        try:
            parsed = json.loads(raw)
            records = parsed if isinstance(parsed, list) else [parsed]
        except json.JSONDecodeError:
            # Попробовать JSONL
            records = []
            for line in raw.strip().split("\n"):
                if line.strip():
                    records.append(json.loads(line))
        candidates = compute_divergence_issues(records)
        print(json.dumps(candidates, ensure_ascii=False, indent=2))
        sys.exit(0)

    sys.exit(main())
