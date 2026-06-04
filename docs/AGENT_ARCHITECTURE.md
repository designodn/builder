# Agent Architecture

## Полный пайплайн `/builder`

Источник правды для последовательности и переходов между шагами — `.claude/commands/builder.md` секция «Гейты». Здесь — концептуальная карта.

```
Дизайнер: промпт + референсы
   │
   ▼  [G-V1: Figma MCP подключён]
Шаг 3 — Research Agent              src/agents/research/RESEARCH_AGENT.md
   │ researchOutput (≥3 уточняющих ответа)
   ▼  [G-V2: research собран]
Шаг 4 — Эксперты (опционально)      sub-agents .claude/agents/{analytics,product,experience}.md
   │ analytics / product / experience выводы
   ▼
Шаг 5 — CJM
   │ дизайнер: «апрув CJM»
   ▼  [G-V3: CJM апрувнут]
Шаг 6 — План
   │  A: rules/skeleton.md
   │  B: registry/index.json (grep по нужным компонентам)
   │  D-E: rules/components/<slug>.rule.json (по одному, выборочно)
   │  E.1: уточнения по 2-3 ключевым компонентам
   │  H: покрытие состояний (дизайнер выбирает)
   ▼  [G-V4: states_covered определён]
Шаг 6 I — финальная раскладка
   │ дизайнер: «апрув»
   ▼  [G-V5: final layout апрувнут]
Шаг 7 — чек-лист построения
   │ дизайнер: «апрув / ок / поехали»
   ▼  [G-V6: чек-лист апрувнут]
═══════════════════════════════════════════════════════════════
   ниже — internal scratchpad'ы Builder'а, дизайнер не видит
   ═══════════════════════════════════════════════════════════════
G-I1 internal — Text Layout         src/agents/text-layout/TEXT_LAYOUT_AGENT.md
   │ для каждого фрейма: нумерованная иерархия по слотам скелета
   │ ходит по rules/components/<slug>.rule.json — slots, booleans, variants
   │ сохраняет в _session.text_layout[]
   ▼  [G-I1: иерархия построена для всех фреймов]
G-I2 internal — JSON Layout         src/agents/json-layout/JSON_LAYOUT_AGENT.md
   │ резолвит slot prop names через slotKey/boolKey (см. BUILDER_GOTCHAS.md A-058)
   │ 0 throw'ов на ambiguous — иначе FAIL-3, halt
   │ сохраняет в _session.json_layout[]
   ▼  [G-I2: ключи резолвлены, ambiguity нет]
G-I3 — Figma Implementer            src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md
   │ use_figma(code: ...) на основе json_layout
   │ обработка errors[] → scope-deg report при non-empty
   ▼  [G-I3: errors:[]]
Figma-файл готов, дизайнер видит ссылку
```

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

**Агенты (src/agents/)**
- `research/` — сбор задачи и референсов
- `text-layout/` — текстовая структура экрана
- `json-layout/` — JSON-дерево с переменными
- `builder/` — оркестратор пайплайна + Figma MCP

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
