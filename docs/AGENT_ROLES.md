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

## 2. Text Layout Agent (G-I1)
**Sub-agent:** `.claude/agents/text-layout.md`
**Контракт данных:** `src/agents/text-layout/TEXT_LAYOUT_AGENT.md`

Internal scratchpad-стадия Builder'а. Принимает CJM + `researchOutput` и превращает их в иерархический текстовый список фреймов.
Нумерация отражает вложенность: `1`, `1.1`, `1.1.1`.
Каждый элемент: номер + короткое название + описание.
Сохраняет результат в `_session.text_layout[]`.

Запускается автоматически после G-V (visible) apruv'ов дизайнера (CJM, чек-лист). **Без отдельного apruva** — Builder сам делает санити-чек G-I1 PASS.

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
