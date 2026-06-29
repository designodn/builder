# Session telemetry — схема и протокол

> Документ описывает фундамент канала «дизайнер → Настя»: как builder фиксирует каждую сессию `/builder` в виде GitHub Issue с авто-метриками, и как Настя на это реагирует. Связан с планом из `/root/.claude/plans/fancy-hopping-twilight.md` и расширяется в `docs/TRIAGE_SETUP.md` (триаж) и `docs/RESHALA.md` (агент-решала) на более поздних фазах.

## Зачем

Без телеметрии Настя видит только две вещи: что дизайнеры приходили (по факту коммитов) и что они жаловались (по фидбэку). Это даёт картину «что плохо», но не «что хорошо», «сколько занимает», «где затыки». Цель — собирать на каждую сессию JSON-карточку с длительностью, этапами, retry-счётчиками, точностью построения и пульсом дизайнера, чтобы позже считать тренды, выявлять регрессии и строить (когда захочется) лидерборд.

Параллельно — тот же канал служит **bug-репортером**: если в сессии сработал watchpoint (Figma вернула ошибку, реестр устарел, нет правила), builder создаёт **отдельный** issue с авто-меткой `auto:bug:*` и линкует его на сессионный issue. Дизайнер ничего не делает, Настя получает разбор в утреннем digest.

## Архитектура

Один поток `/builder` → две (потенциально три) issues:

1. **Session telemetry issue** (всегда) — body содержит JSON со всеми полями схемы (см. ниже). Label: `session-telemetry` + `pulse:<mood>`.
2. **Auto-bug issue** (только если сработал watchpoint) — отдельный issue с label `auto:bug:<type>`. Линкуется через ссылку `Session: #NNN` в body и обратная ссылка из telemetry-issue.
3. **Agent-feedback issue** (опционально, на будущее) — отдельный issue с label `agent:<role>`, если дизайнер захотел оставить фидбэк на конкретного эксперта.

Все три создаются через `mcp__github__issue_write` от имени дизайнера (Read role это разрешает). Закрывать / лейблить может только Настя (или /fbAnalyzer от её имени).

## Схема telemetry JSON

JSON хранится в body session-telemetry issue. Парсится `/fbAnalyzer` (Phase 4) и aggregate workflow'ом (Phase 7) → `tests/sessions.jsonl`.

```json
{
  "session_id": "uuid-v4",
  "ts_start": "ISO-8601",
  "ts_end": "ISO-8601",
  "duration_total_sec": 0,
  "duration_figma_build_sec": 0,
  "designer_login": "github-login",
  "component": "Button/Primary",
  "stages": {
    "research": false,
    "analytics": false,
    "product": false,
    "experience": false,
    "cjm": true,
    "figma_build": true
  },
  "cjm_approved": true,
  "cjm_iterations": 1,
  "i_approval_received": true,
  "checklist_approved": true,
  "figma_iterations": 2,
  "import_success": true,
  "components_imported": 7,
  "watchpoints_fired": ["bug:import-failed"],
  "retries": { "import": 1, "cjm_redo": 0 },
  "placeholder_pct": 0.08,
  "accuracy_pct": 0.92,
  "states_covered": ["default", "loading"],
  "user_feedback_baseline_source": "search",
  "personal_thanks_emitted": true,
  "pulse": {
    "mood": "mixed",
    "negative_note": "Слот subhead не свапнулся, остался дефолтный текст",
    "positive_note": "Быстро собралось, CJM сразу попал в задачу"
  },
  "agent_feedback": []
}
```

### Поля

| Поле | Тип | Что значит |
|---|---|---|
| `session_id` | uuid-v4 | Генерируется в начале `/builder`. Сквозной идентификатор для дедупа watchpoint-issues и cross-link |
| `ts_start` / `ts_end` | ISO-8601 | Начало и конец сессии (от первого сообщения до закрытия pulse) |
| `duration_total_sec` | int | `ts_end - ts_start` |
| `duration_figma_build_sec` | int | Время этапа G (Figma Implementer) — от первого `use_figma` до последнего |
| `designer_login` | string | `mcp__github__get_me().login`, кэшируется на сессию |
| `component` | string | Главный компонент сессии: `Library/Component` |
| `stages.*` | bool | Какие экспертные этапы реально запускались |
| `cjm_approved` | bool | Дизайнер дал апрув на CJM перед рисованием |
| `cjm_iterations` | int | Сколько раз пересобирали CJM перед апрувом |
| `i_approval_received` | bool | Дизайнер апрувнул итоговую раскладку фреймов в Шаге 6 I (`/builder`). `false` при `stages.figma_build = true` означает «прыгнули через раскладку» — `/fbAnalyzer` помечает сессию как пропущенный gate (см. A-056) |
| `checklist_approved` | bool | Дизайнер апрувнул чек-лист содержимого фреймов в Шаге 7 (`/builder`). `false` при `stages.figma_build = true` означает «прыгнули через содержимое» — пара к `i_approval_received`, оба обязательны перед первым `use_figma` |
| `figma_iterations` | int | Сколько раз пересобирали макет после ревью дизайнера |
| `import_success` | bool | Финально ли импорт прошёл без `IMPORT_FAILED` |
| `components_imported` | int | Уникальных `componentKey`, успешно импортированных в сессии |
| `watchpoints_fired` | `("bug:import-failed" \| "bug:registry-stale" \| "bug:missing-rule" \| "bug:builder-error" \| "bug:gate-skipped")[]` | Какие watchpoint-теги сработали. Допустимые значения — **строго** этот enum (домен фиксируется builder'ом в Шаге 7 `Watchpoints — авто-создание issues`). Дрейф недопустим, `/fbAnalyzer` отбрасывает посторонние токены при агрегации |
| `retries.*` | int | Счётчики retry'ев по типу |
| `placeholder_pct` | float 0..1 \| null | Доля INSTANCE_SWAP-слотов, оставшихся с дефолтным контентом. Считается builder'ом в Phase G через `get_design_context`. `null` если этап не запускался |
| `accuracy_pct` | float 0..1 \| null | Доля правильно проставленных пропов (variants/booleans/text) по сравнению с `.rule.json`. Та же логика, что в `/test --full` |
| `states_covered` | `("default" \| "empty" \| "loading" \| "error" \| "focus")[]` | Какие состояния builder реально нарисовал на макете. Допустимые значения — **строго** этот enum; любой другой токен — дрейф формулировок, `/fbAnalyzer` отбрасывает при агрегации. Решение фиксируется в Шаге 6 H `/builder` после явного вопроса дизайнеру. Минимум `["default"]`. `"focus"` (опционально, #261) — кадр интерактивного состояния focusable-input компонента; конкретные combos живут в `<slug>.rule.json doc.edgeCases` (single source of truth, не дублировать). Rendering caveat — `docs/ARCHITECTURE_LESSONS.md` Pending axes (#270). Используется `/fbAnalyzer` для аналитики «какие сценарии популярнее» и регрессии «дизайнеры всё чаще пропускают error» |
| `user_feedback_baseline_source` | `"search"` \| `"list"` \| null | Какой путь сработал в Шаге 0.X `/builder` при сборе personal-thanks baseline. `null` — kill-switch / unknown login / оба запроса упали. Используется для мониторинга прав `search_issues` у дизайнеров с Read-role |
| `personal_thanks_emitted` | bool | `true` если Под-шаг 8.X вывел default-ветку реплики (со счётчиком). `false` — если короткая pre-check ветка (null baseline или negative pulse). Шаблоны и правила — `docs/PERSONAL_THANKS.md` |
| `pulse.mood` | enum \| null | `positive` / `negative` / `mixed` / `neutral` / `null` (skipped) |
| `pulse.negative_note` / `positive_note` | string \| null | Свободный текст из двух pulse-вопросов |
| `agent_feedback` | object[] | Заполняется только если дизайнер дал фидбэк на эксперта. Структура: `{ role, mood, note }` |
| `gates_passed` | `{id, status, reason, ts}[]` | Массив объектов: `id` ∈ `G-V1..G-V6` / `G-I1..G-I3`, `status` ∈ `"PASS"` / `"FAIL-1"` / `"FAIL-2"` / `"FAIL-3"`, `reason` — короткая причина, `ts` — ISO-8601 timestamp проверки **в UTC с обязательным `Z`-суффиксом** (`2026-05-20T11:34:12Z`). Без `Z` ts'ы из разных часовых зон разойдутся и `aggregate-sessions.py` не сможет считать продолжительности этапов. Audit-trail: на каком гейте сессия споткнулась + продолжительности этапов между ts. См. `.claude/commands/builder.md` секция «Гейты». **Consumer** (`aggregate-sessions.py`) пока не парсит это поле — добавлено forward-compatible под item 4 backlog'а ревью PR #170 |
| `text_layout` | object[] | G-I1 артефакт. Массив `{ frame, hierarchy[] }` — нумерованная иерархия по слотам скелета для каждого фрейма. Internal scratchpad, дизайнеру не показывается. Используется G-I2 как вход. Пусто если G-I1 не дошёл до PASS |
| `json_layout` | object[] | G-I2 артефакт. Массив `{ frame, imports[], slots{} }` с резолвленными slot prop keys через `slotKey/boolKey` (см. `docs/BUILDER_GOTCHAS.md` A-058). Internal scratchpad, дизайнеру не показывается. Цель — ловить A-058-class регрессии до `use_figma`, не на нём |

## Pulse — два мягких вопроса

В конце `/builder`, после подтверждения «макет готов», builder задаёт два вопроса по одному:

```
Мы закончили ✨ Хочешь рассказать, что было не так или не понравилось?
Передам хозяйке.
```

Дизайнер отвечает или молчит. Дальше:

```
Будет здорово, если расскажешь, что понравилось. Это важно для моего роста 🧡
```

Builder парсит свободный текст:
- Первый ответ → `pulse.negative_note`.
- Второй ответ → `pulse.positive_note`.
- Tone-классификатор (простой rule-based на ключевых словах) выставляет `pulse.mood`: `negative` если только первый ответ непустой, `positive` если только второй, `mixed` если оба, `neutral` если оба пустые, `null` (skipped) если дизайнер просто закрыл сессию.
- На session-telemetry issue ставится дополнительный label `pulse:<mood>` для быстрой фильтрации.

Если в `negative_note` есть конкретный технический сигнал (упоминание слота, текста, импорта, размера) — builder мягко предлагает оформить через `/fb`, но не настаивает.

## Watchpoints — гибрид

| Что произошло | Поведение builder'а |
|---|---|
| `bug:import-failed` (Figma 404, IMPORT_FAILED) | Сам создаёт `auto:bug:import-failed` issue, говорит «зафиксировала, детали можешь дописать в комментах» |
| `bug:registry-stale` (key not found после `/update`) | Сам создаёт `auto:bug:registry-stale` |
| `bug:missing-rule` (нет `.rule.json`) | Сам создаёт `auto:bug:missing-rule` |
| `bug:builder-error` (`use_figma` бросил exception, включая retry-success) | Сам создаёт `auto:bug:builder-error` (см. PR #149 / issues #133, #134) |
| `bug:gate-skipped` (self-check перед `stages.figma_build = true` показал, что хотя бы один из `i_approval_received` / `checklist_approved` не `true`) | Сам создаёт `auto:bug:gate-skipped` issue (A-056). `/fbAnalyzer` по политике для `auto:bug:*` поднимет до P0/P1 и пингнёт Telegram |
| `bug:rule-incorrect` | **Остаётся через `/fb`** — субъективная оценка дизайнера |
| `feedback:component-request`, `feedback:ux` | **Остаётся через `/fb`** |

### Дедуп

В одной сессии при повторе той же ошибки builder **не плодит** новые issues, а добавляет коммент в существующий. Ключ дедупа: `session_id + watchpoint_type`. Builder ищет в `mcp__github__list_issues` open issues с label `auto:bug:<type>` и упоминанием `session_id` в body — если найдено, инкрементит счётчик в body и комментит «повторилось N раз».

Между сессиями дедуп **не** работает: одна и та же ошибка у разных дизайнеров — это сигнал для `/fbAnalyzer` (Phase 4), который сгруппирует и поднимет приоритет.

## Лейблы

Канонический список — `.github/labels.yml`. Phase 1 вводит следующие:

- **Карточка сессии:** `session-telemetry`
- **Пульс:** `pulse:positive`, `pulse:negative`, `pulse:mixed`, `pulse:neutral`, `pulse:skipped`
- **Авто-баги:** `auto:bug:import-failed`, `auto:bug:registry-stale`, `auto:bug:missing-rule`, `auto:bug:builder-error`, `auto:bug:gate-skipped`

Перед тем как builder начнёт писать issues (Phase 2), Настя должна **один раз** создать эти лейблы в репо (Settings → Labels или `gh label create`). Без этого `issue_write` с label вернёт 422. Будущая Phase 4 может автоматизировать через workflow на `labels.yml`.

## Доступы — сводка

| Действие | Дизайнер (Read) | Настя |
|---|---|---|
| Создать session-telemetry issue (через builder/MCP) | ✅ | ✅ |
| Создать auto-bug issue (через builder/MCP) | ✅ | ✅ |
| Прокомментировать существующий issue | ✅ | ✅ |
| Поставить эмодзи-реакцию | ✅ | ✅ |
| Закрыть / относить к другому priority | ❌ | ✅ |
| Дописать `tests/sessions.jsonl` | ❌ (Read-роль не пропустит push) | ✅ |

Identity-check (`login == "starkhoney"`) на стороне Claude не нужен для самого факта создания telemetry — issue создаётся от дизайнера на его правах. Identity-check включается только при попытке write-операций на репо (Edit/Write/push), которыми занимается Настя.

## Как Настя реагирует

Дизайнерская активность приходит как поток issues с `session-telemetry`. Каждое из них — отдельная карточка, можно сабскрайбиться, можно фильтровать через `is:open label:auto:bug:*` и т.д.

Полноценная разборка — отдельный скилл `/fbAnalyzer` (Phase 4): он группирует, дедупит между сессиями, ставит priority и пишет digest в pinned `#triage-digest`. До Phase 4 Настя смотрит сырые issues руками — это всё ещё лучше, чем ничего.

## Связанные документы

- План: `/root/.claude/plans/fancy-hopping-twilight.md`
- Безопасный режим / роли: `docs/SAFE_MODE.md`
- Триаж (Phase 4): `docs/TRIAGE_SETUP.md` (создаётся в Phase 4)
- Агент-решала (Phase 5): `docs/RESHALA.md` (создаётся в Phase 5)
