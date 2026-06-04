# Agent Roles

Builder-оркестратор и Research — диалоговые роли в main conversation (общаются с дизайнером, ждут apruva). Эксперты Шага 4 (`analytics` / `product` / `experience`) и `cjm` Шага 5 — sub-agents с короткими консультативными прогонами: возвращают структурированный insight / артефакт, apруv остаётся в main conversation. Text Layout / JSON Layout / Figma Implementer — internal stages **внутри** Builder'а (G-I1 / G-I2 / G-I3), запускаются автоматически без apruva дизайнера. Все четыре + G-I sub-agents лежат в `.claude/agents/`. Концептуальная карта переходов и G-V (visible) / G-I (internal) гейтов — в `docs/AGENT_ARCHITECTURE.md`.

## 1. Research Agent
**Файл:** `src/agents/research/RESEARCH_AGENT.md`
**Где живёт:** main conversation (шаг 3 `/builder`)

Принимает задачу дизайнера и необязательные референсы (скриншоты + комментарии).
Задаёт 4 уточняющих вопроса (метрики, аудитория, бэкенд-ограничения, похожие экраны).
Анализирует референсы и извлекает принципы.
Возвращает структурированный `researchOutput` — вход для Text Layout Agent.

Апрув: `«апрув ресёрч»`

## 1.5. Experts (Шаг 4, опционально) и CJM (Шаг 5)

Sub-agents с консультативными прогонами. Дизайнер на Шаге 4 выбирает, кого подключить из экспертов; на Шаге 5 Builder автоматически делегирует построение CJM `cjm`-агенту.

| Sub-agent | Файл | Что делает | Tools |
|---|---|---|---|
| `analytics` | `.claude/agents/analytics.md` (source-of-truth, толстый) | Точки риска, метрики проверки, акценты для CJM | Read, Glob, Grep |
| `product` | `.claude/agents/product.md` (source-of-truth, толстый) | Must-have, ограничения, приоритеты контента, edge cases | Read, Glob, Grep |
| `experience` | `.claude/agents/experience.md` (source-of-truth, толстый; WebFetch на domain-allowlist) | Поиск зарубежных UX-кейсов с метриками | WebSearch, WebFetch, Read, Glob, Grep |
| `cjm` | `.claude/agents/cjm.md` (фасад; source — `.claude/commands/builder.md` секция «Шаг 5 — CJM») | Строит Customer Journey Map из ресёрча + инсайтов экспертов | Read, Glob, Grep |

Апрув: `«апрув CJM»` (только для CJM-агента, остальные апрува не требуют — их вывод сразу идёт в CJM-агент как контекст). Апрув принимает Builder в main conversation, не sub-agent.

## 1.6. Slot Reasoner Agent (Шаг 6 E.0)
**Sub-agent:** `.claude/agents/slot-reasoner.md`

Internal стадия `/builder` Шаг 6 под-шаг E.0. Принимает `cjm_handoff` + `expertOutputs` + `component_picks` + `plan_from_D` + `rule_bundle` + `semantic_roles_enabled`. Для каждого top-level компонента из плана делает reasoning per slot (`swap` / `hide` / `gap`) и per variant (если у него непустой `builderRule` И `options.length > 1`).

Возвращает `builder_picks[]` со shape:
- Slot entry: `{ slug, slotProp, path, decision, picked, reason, confidence, matched_roles?, ts }`.
- Variant entry: `{ slug, variantProp, path, decision: "variant", picked, reason, confidence, ts }`.
- Инвариант: `slotProp` ИЛИ `variantProp`, не оба.

Confidence роутинг: `high` → silent / E.1 high-confidence сверка. `medium` / `low-fallback` → E.2 Category A'. `none` (только для slot `decision: "gap"`) → E.2 Category A.

Recursive ruleRef walk — строго по `rule_bundle.rulesBySlug`, без file I/O в агенте. Anti-cycle Set по slug на пути, depth cap по `bundle.meta.depth`. Cycle / depth-exceeded → `decision: "gap"`.

Stateless: Builder сбрасывает `_session.builder_picks = []` перед каждым вызовом (например, walk-back из Шага 7 H). `divergences[]` от агента → typed entries в `_session.rule_contributions[]`.

Запускается из Шага 6 E.0 один раз на полный план D. **Без отдельного apruva** — internal stage.

## 1.7. Text Collector Agent (Шаг 6 E.0.5)
**Sub-agent:** `.claude/agents/text-collector.md`

Internal стадия `/builder` Шаг 6 под-шаг E.0.5 (после E.0). Принимает `builder_picks` (от slot-reasoner) + `cjm_handoff` + `brief` + `rule_bundle`. Recursive walk по closure плана (top-level + nested через `nestedProps.ruleRef`); для каждого компонента извлекает `textProps[]` / `textNode` из rule.json'а в bundle, определяет реальный текст по priority `brief > cjm`.

Shape `text_picks[]`: `{ slug, path, textProp|null, textNode: bool, text, source: "brief"|"cjm", ts }`. Mutual exclusivity textProp vs textNode.

Если текст не найден ни в brief, ни в cjm — запись НЕ создаётся. G-I2-guard ловит как `divergence_step: "forgotten_text"` если sampleTexts[0] матчит placeholder-pattern.

`designer_override` — отдельный механизм поверх text_picks от Builder'а в main convo (upsert при правке дизайнера в E.1 / drill-down), не от агента.

Stateless: Builder сбрасывает `_session.text_picks = []` перед каждым вызовом. Anti-cycle + depth cap по `bundle.meta.depth`.

Запускается из Шага 6 E.0.5 один раз на полный плана. **Без отдельного apruva** — internal stage.

## 2. Text Layout Agent (G-I1)
**Sub-agent:** `.claude/agents/text-layout.md` (source of truth для контракта; `src/agents/text-layout/TEXT_LAYOUT_AGENT.md` — legacy-документация, не trust как runtime-контракт)

Internal scratchpad-стадия Builder'а. Принимает `cjm_handoff` + `component_picks` + `states_covered` и превращает их в иерархический текстовый список фреймов.
Нумерация отражает вложенность: `1`, `1.1`, `1.1.1`.
Каждый элемент: номер + короткое название + описание.
Возвращает плоский список фреймов; **Builder в main convo кладёт результат в `_session.text_layout[]`** (subagent в изолированном контексте, к `_session` доступа не имеет).

Запускается из Шага 7 чек-листа (для сборки ASCII-мокапов дизайнеру). После G-V6 apruv'а — **не вызывается повторно**, post-preflight G-I1 использует кэш из `_session.text_layout[]` (защита от LLM-нондетерминизма между двумя прогонами).

## 3. JSON Layout Agent (G-I2)
**Sub-agent:** `.claude/agents/json-layout.md`
**Контракт данных:** `src/agents/json-layout/JSON_LAYOUT_AGENT.md`

Internal scratchpad-стадия. Принимает `_session.text_layout[]` и превращает в JSON-дерево.
Все отступы и размеры — только через переменные из `registry/libraries/numbers-paddings/variables.json`.
Никаких хардкодных px-значений.
Резолвит slot prop names через `slotKey(rule, pattern)` / `boolKey(rule, pattern)` (см. `docs/BUILDER_GOTCHAS.md` A-058) — 0 throw'ов на ambiguous, иначе FAIL-3, halt.

Запускается автоматически после G-I1 PASS. **Без отдельного apruva.**

## 4. Builder Agent (оркестратор)
**Файл:** `src/agents/builder/BUILDER_AGENT.md`
**Код:** `agents/builder/src/index.ts`
**Где живёт:** main conversation (скилл `/builder`)
**Sub-agent:** нет (оркестрация — это сам скилл; делегирует internal-стадии sub-agent'ам text-layout / json-layout / figma-implementer)

Читает `registry/` и `rules.md`. Оркестрирует пайплайн от брифа до Figma, удерживает G-V / G-I гейты, делегирует internal-стадии sub-agent'ам text-layout / json-layout / figma-implementer.
Применяет фильтры из `config/planner-rules.json` и ограничения из `config/project-rules.json`.
Использует prop-слоты из `tokens/swap-slots/` для правильной расстановки пропов.

Апрув: `APPROVE` в терминале (для финальных G-V гейтов).

## 5. Figma Implementer (G-I3)
**Sub-agent:** `.claude/agents/figma-implementer.md`
**Контракт данных:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md`

Финальная internal-стадия Builder'а. Получает апрувнутый CJM, план шага 6 и `_session.json_layout[]`, создаёт фреймы в Figma через `use_figma`.
Перед генерацией обязан прочитать `rules.md`, pre-load `/figma-use`, составить план каждого экрана (скелет: meshok ↑ → контент → meshok ↓).
G-I3 PASS = `errors:[]`. Non-empty → scope-deg report, без блокировки билда.
