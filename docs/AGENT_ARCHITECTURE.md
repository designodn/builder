# Agent Architecture

## Полный пайплайн `/builder`

Источник правды для последовательности и переходов между шагами — `.claude/commands/builder.md` секция «Гейты». Здесь — концептуальная карта.

```
Дизайнер: промпт + референсы
   │
   ▼  [G-V1: Figma MCP подключён]
Шаг 3 — Research                    инлайн в .claude/commands/builder.md (sub-agent не зарегистрирован)
   │ researchOutput (≥3 уточняющих ответа)
   ▼  [G-V2: research собран]
Шаг 4 — Эксперты (опционально)      sub-agents .claude/agents/{analytics,product,experience}.md
   │ гибридный output: prose дизайнеру + JSON-хвост в _session.expertOutputs.<role>
   ▼
Шаг 5 — CJM                         sub-agent .claude/agents/cjm.md
   │ вход: researchOutput + expertOutputs
   │ выход: markdown-CJM (дизайнеру) + cjm_handoff JSON (для picker)
   │ дизайнер: «апрув CJM»
   ▼  [G-V3: CJM апрувнут]
Шаг 6 — План
   │  6.0: sub-agent .claude/agents/component-picker.md
   │       вход: cjm_handoff, platform, expertOutputs.product
   │       выход: component_picks, ambiguities[], lookup_failures[]
   │  E.0: sub-agent .claude/agents/slot-reasoner.md
   │       вход: cjm_handoff + expertOutputs + component_picks + plan_from_D + rule_bundle + semantic_roles_enabled
   │       выход: builder_picks[] (slot/variant decisions с confidence) + divergences[]
   │  E.0.5: sub-agent .claude/agents/text-collector.md
   │       вход: builder_picks + cjm_handoff + brief + rule_bundle
   │       выход: text_picks[] (тексты для textProps/textNode по компонентам closure плана)
   │  E.1: уточнения по ambiguities (Builder задаёт дизайнеру)
   │  F: G-P-skeleton (валидация плана против rules/skeleton.json)
   │  H: покрытие состояний (дизайнер выбирает)
   ▼  [G-V4: states_covered определён]
Шаг 6 I — финальная раскладка
   │ дизайнер: «апрув»
   ▼  [G-V5: final layout апрувнут]
Шаг 7 — чек-лист построения
   │ sub-agent .claude/agents/text-layout.md → Builder кладёт результат в _session.text_layout[]
   │   (вход: cjm_handoff + component_picks + states_covered; фильтрует фреймы по states_covered)
   │ sub-agent .claude/agents/ascii-mockup.md → markdown с ASCII-мокапами (high-level или drill-down)
   │   (вход: text_layout + cjm_handoff + component_picks; режим — по sentinel `DRILL_DOWN_SCREEN:` в первой строке prompt'а)
   │ дизайнер видит мокапы внутри чек-листа; апрув «ок / поехали»
   ▼  [G-V6: чек-лист апрувнут]
═══════════════════════════════════════════════════════════════
   ниже — internal scratchpad'ы Builder'а, дизайнер не видит
   ═══════════════════════════════════════════════════════════════
G-I1 internal — text-layout         (НЕ повторный вызов — используется _session.text_layout[] из кэша Шага 7)
   │ кэш гарантирует: апрувнутая дизайнером иерархия идёт в G-I2/G-I3 без LLM-нондетерминизма повторного вызова
   ▼  [G-I1: иерархия построена для всех фреймов]
G-I2 internal — json-layout         .claude/agents/json-layout.md
   │ вход: _session.text_layout[] + _session.component_picks (picker'овские prop-key hints)
   │ верификация slot prop names через slotKey/boolKey (см. BUILDER_GOTCHAS.md A-058)
   │ 0 throw'ов на ambiguous — иначе FAIL-3, halt
   │ Builder кладёт результат в _session.json_layout[]
   ▼  [G-I2: ключи резолвлены, ambiguity нет]
G-I3 — figma-implementer            .claude/agents/figma-implementer.md
   │ use_figma(code: ...) на основе json_layout
   │ обработка errors[] → scope-deg report при non-empty
   ▼  [G-I3: errors:[]]
Figma-файл готов, дизайнер видит ссылку
   │
   ▼
Шаг 8 — telemetry-writer            .claude/agents/telemetry-writer.md
   │ вход: финальный _session.* + level (nastya/designer)
   │ создаёт session-telemetry issue + опциональную 8.bis auto-issue (bug:missing-rule)
   │ при ошибках — не падает, возвращает status: FAIL/OK + errors[]
   ▼  [issue URLs возвращены, Builder продолжает к 8.X — personal thanks]
```

**Замечание о видимости.** `text-layout` и `ascii-mockup` — гибридные: они internal (дизайнер их не вызывает, диалога нет), но **output `ascii-mockup` показывается дизайнеру** внутри чек-листа Шага 7. Это специальный случай: subagent рендерит markdown, Builder в main convo встраивает его в чек-лист без модификации.

**Ключевые точки:**

- **G-V (visible) гейты** — каждый соответствует существующему apruv'у дизайнера. Apruv — это **переход** между V-гейтами. Без apruv'а Builder ждёт.
- **G-I (internal) гейты** — переходы автоматические, но требуют PASS-условия. JSON Layout зависит от Text Layout (последовательно, не параллельно).
- **`use_figma` НИКОГДА** не вызывается без всех V-PASS + G-I1 PASS + G-I2 PASS.
- При FAIL любого гейта Builder останавливается до явного исправления состояния (apruv от дизайнера, refine паттерна для slotKey, и т.п.).

Старый «3-агентный pipeline с apruv'ами между Text Layout / JSON Layout / Builder» — снят: дизайнер апрувит **итоги** (CJM, final layout, чек-лист), внутренние слои Builder проходит сам с PASS/FAIL санити-чеками.

## Уровни системы

**Данные (agents/ + registry/)**
- `agents/library-catalog/` — собирает метаданные библиотек из Figma
- `agents/component-catalog/` — собирает каталог компонентов из Figma
- `agents/shared/` — общие типы TypeScript и Figma API-клиент
- `registry/` — manifest библиотек (`libraries.json`) + derived cache (`index.json`, генерится из `rules/components/*.rule.json`). Sources of truth для компонентов — в `rules/components/`.

**Конфигурация**
- `config/planner-rules.json` — фильтры каталога (preferApprovedOnly, excludeAssemblies)
- `config/project-rules.json` — ограничения проекта (maxCTAs, platforms)
- `tokens/swap-slots/` — prop-слоты (иконки, системные компоненты, булевы шаблоны)
- `rules.md` — семантические правила использования компонентов
- `tokens/icons-config.json` — конфиг маппинга иконок по размеру

**Sub-agents (`.claude/agents/`)** — source-of-truth для всех runtime-вызовов через `Agent` tool:
- `analytics`, `product`, `experience` — Шаг 4 эксперты
- `cjm` — Шаг 5 построение Customer Journey Map
- `component-picker` — Шаг 6.0 резолв CJM → DS-компоненты
- `slot-reasoner` — Шаг 6 E.0 reasoning по slot'ам и variants (выбор preferred / hide / gap + confidence)
- `text-collector` — Шаг 6 E.0.5 сборка реальных текстов из brief / CJM для textProps/textNode по closure плана
- `text-layout` — G-I1 иерархия фреймов
- `ascii-mockup` — Шаг 7 рендер моноширинных мокапов для чек-листа
- `json-layout` — G-I2 резолв slot prop names
- `figma-implementer` — G-I3 владелец `use_figma`
- `platform-propagator` — Шаг 7.5 копирование собранных фреймов из source-секции в iOS / Web / Mob
- `passport-filler` — Шаг 7.6 заполнение карточки `Шаблон фичи 2.0` (TEXT-ноды, variants designer/product, таблица)
- `telemetry-writer` — Шаг 8 создание session-telemetry issue + опциональной 8.bis auto-issue (`bug:missing-rule`)
- `code-reviewer`, `debugger` — meta-инструменты вне `/builder`
- `architect` — архитектурный ревьюер с тремя режимами (**review**, **pre-emptive**, **follow-up**) + **Staleness Watch** во всех режимах (сканирует watched architectural docs на broken refs / missing listings / renamed paths; AUTO-FIX для узкого класса cross-reference правок под Настей через identity-check `mcp__github__get_me`, PROPOSE-FIX для остального, DEFER для substantive content). Pre-read `docs/ARCHITECTURE_LESSONS.md` обязателен. Edit ограничен watched-list: `docs/ARCHITECTURE_LESSONS.md` (append-only), `docs/AGENT_ARCHITECTURE.md`, `docs/AGENT_ROLES.md`, `docs/AGENT_PORTABILITY.md` (cross-reference fixes only, не restructure)

## Гибридный output prose + JSON (общая механика)

Все агенты, чей output виден дизайнеру (`analytics`, `product`, `experience`, `cjm`), возвращают **гибрид**:

- **prose** — markdown для дизайнера, показывается в main conversation
- **`json`-fenced блок** — machine-readable handoff для следующего стейджа, парсится Builder'ом

Правила парсинга:

- JSON-блок ровно один, **в самом конце ответа**, в fenced-блоке с языком `json`. Ничего после него — ни комментариев, ни закрывающего абзаца.
- Builder парсит **последний** fenced-блок с языком `json` (защита от quoted-JSON-snippet'ов в prose от агентов с WebFetch — `experience` может процитировать чужой ```json``` из docs, handoff'ом считается только финальный fence).
- При невалидном JSON / отсутствии блока:
  - Для экспертов (`analytics` / `product` / `experience`) — fallback `{ raw_text }` в `_session.expertOutputs.<role>.raw_text`; cjm-агент обрабатывает в degraded-ветке (см. `.claude/agents/cjm.md` Шаг 1).
  - Для `cjm` и `component-picker` — retry-промпт «верни только JSON», второй неудачный раз → halt + `/fb bug:builder-error`.

Точные shape'ы JSON-handoff'ов — в `.claude/agents/<name>.md` соответствующего агента (frontmatter `description` + body). Этот файл — карта, не дубликат shape'ов (single-source-of-truth, см. `docs/ARCHITECTURE_LESSONS.md`).

## Передача в prompt subagent'у — sentinel protocol

Subagent'ы работают в **изолированном контексте** — у них нет доступа к main-convo `_session`. Builder сериализует нужные поля в prompt subagent'у строкой. Имена полей в prompt'е соответствуют builder-side `_session.X` для читаемости, но это просто input prompt — subagent не «получает _session», он работает только с тем, что в prompt'е.

Sentinel-параметры (когда нужно передать enum-параметр subagent'у при отсутствии structured input) — **первой строкой prompt'а**, формат `<UPPER_SNAKE>: <value>`. На сегодня единственный прецедент — `DRILL_DOWN_SCREEN: <screen-id>` для `ascii-mockup`. Стандартизация общего синтаксиса для второго+ кейса — issue #343 (отложено до появления N=2 прецедента).

## Границы между meta-агентами

`code-reviewer` и `architect` — два разных meta-агента (вне `/builder` pipeline), не дубль. Разделение:

| Агент | Зона ответственности | Уровень | Output |
|---|---|---|---|
| `code-reviewer` | Корректность кода и контрактов файлов, безопасность, DS-compliance, регрессии из CHANGELOG, scope изменений, именование, стиль, артефакты | Конкретные файлы и функции | APPROVE / REQUEST_CHANGES |
| `architect` | Системная эволюция, прецеденты в кодбазе, привязка к `docs/ARCHITECTURE_LESSONS.md` (N кейсов / semantic vs visual / single-source-of-truth), оценка идей до реализации, follow-up к прошлым вердиктам | Структура и эволюция архитектуры | BLOCK / WARN / OK (review) или PROCEED / RESHAPE / DROP (pre-emptive) |

Когда подключать каждого:

- **Точечный bug-fix, typo, минорная правка одного файла** → только `code-reviewer`.
- **PR расширяет schema / меняет контракт sub-agent'а / трогает protected paths / closing-out эпика** → оба последовательно (`code-reviewer` для кода + `architect` для архитектурной consistency). Допустимо запускать параллельно.
- **Идея до написания кода** («стоит ли вводить новый namespace X») → только `architect` в pre-emptive mode.
- **Follow-up к прошлому вердикту** → `architect` в follow-up mode с `## Prior verdict:` блоком.

Если `code-reviewer` находит явно архитектурную проблему — он упоминает её коротко с пометкой «(architectural)» и рекомендует прогон через `architect`. Если `architect` находит явно code-level проблему — он упоминает её коротко с пометкой «(code-level)» и рекомендует `code-reviewer`. Не дублировать чужую территорию.

## Color allocation для агентов

Цвета в frontmatter (`color:`) — UX-сигнал в логах Claude Code. Палитра ограничена (~8 стандартных цветов + gray); агентов в системе больше. Соглашение:

- **Внутри одного pipeline (`/builder`):** цвета уникальны. Pipeline-агенты не должны collid'ить друг с другом — иначе путаница в логах одной сессии.
- **Между pipeline и meta-агентами (`code-reviewer`, `debugger`, `architect`):** collisions допустимы. Pipeline-агент и meta-агент редко выводятся в одной сессии (meta-агенты — out-of-band review-инструменты), визуальный шум минимален.
- **Известные cross-domain collisions** (документированы, не баг): `text-layout: red` ↔ `code-reviewer: red`; `component-picker: orange` ↔ `debugger: orange`.
- **Без явного `color:` field** (CLI выбирает default): `ascii-mockup`, `architect`. Это не collision — палитра whitelist'а `tools/verify-agents-frontmatter.sh` ограничена 8 цветами, и при N=11 агентов не помещается; вместо forced-collision внутри pipeline выбран честный default.

Если в будущем понадобится развести cross-domain collision — либо расширяется whitelist (требует подтверждения, что Claude Code spec поддерживает значение), либо добавляется новый цвет через явное PR-обсуждение.

**Legacy (`src/agents/`)** — исторические документы пайплайна (`research`, `text-layout`, `json-layout`, `figma-implementer`, `builder`, `library`, `prop-collector`, `component`). Не trustworthy как runtime-источник правды — пути и контракты могут расходиться с `.claude/agents/`. Сохранены как контекст для архитектурных решений; не править инлайн при изменении флоу — править `.claude/agents/<name>.md`.

## Поток данных

```
config.json (токены, fileKeys)
    ↓
Figma REST API
    ↓
registry/libraries.json (manifest) + rules/components/*.rule.json (источник правды)
    → genIndex() →
registry/index.json (derived cache, 5-tuple [lib, key, type, tier, approved])
    ↓
rules.md + config/ + tokens/swap-slots/
    ↓
Claude API → layout.json
    ↓
Figma MCP → Figma-файл
```
