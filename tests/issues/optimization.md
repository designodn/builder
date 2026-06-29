# Issues — Optimization

Перегретые токены, лишние вызовы, дубли контекста, недостаточное кэширование. Префикс `O-NNN`.

## Открытые

### [ ] O-008 · `figma.notify` в use_figma не возвращает данные в MCP-канал

Любой диагностический скрипт, использующий `figma.notify(...)` для возврата результата внутрь use_figma, теряет данные — `notify` рисует toast в Figma UI, MCP-обёртка её не парсит. Симптом в /test --full 2026-05-24: запуск `tests/scripts/full-accuracy.figma.js` через `figma.notify('ACC ' + JSON.stringify(out))` вернулся «Code executed with no return value», числа аудита потерялись. Пересборка скрипта через `throw new Error('HEAL_RESULT:' + ...)` сработала (на read-only пассе откатывать нечего).

**Где:** `.claude/commands/builder.md` Шаг 7 + `tests/scripts/full-accuracy.figma.js` + любой диагностический use_figma.
**Как лечить:** добавить в `docs/BUILDER_GOTCHAS.md` (или новый раздел в builder.md) заметку: «Каналы возврата данных из `use_figma`: только `throw new Error('HEAL_RESULT:' + JSON.stringify(out))` на read-only пассе. `figma.notify` — UI-only, в MCP-канал не возвращается. На write-пассе throw не использовать (см. A-061), возвращать данные отдельным read-only use_figma'ом после». Это снимет с агента-стажёра целый класс silent-failures.
**Замечено:** /test --full 2026-05-24 (запуск full-accuracy через notify → data lost; повторный запуск через throw HEAL_RESULT → числа получены).

### [ ] O-006 · Покрытие правилами провалилось с 4.8% до 2.6%

Реестр вырос с 104 до 153 компонентов после `/syncKeys`, а правила остались на 5 файлах (`button`, `header`, `meshok`, `uniCard`, `uniCell`). Цель — ≥ 80%. Без покрытия Builder галлюцинирует пропы для незнакомых компонентов.

**Где:** `rules/components/`
**Как лечить:** написать правила хотя бы для топ-10 наиболее используемых компонентов: `tagsView`, `chip 1.0`, `inputText 1.0`, `navbar 1.0`, `badge 1.2`, `contentsView`, `avaPicture`, `tab 1.0`, `bottomSheet`, `toast 1.0`.
**Замечено:** /test 2026-05-08T18:24Z

---

### [x] O-007 · `alwaysLoadedTokensEst` вырос на +30% (6884 → 8918) — ЗАКРЫТ 2026-05-08

`.claude/commands/builder.md` шаг 6: вместо «прочитай index.json» теперь «грепай только нужные имена». `index.json` исключён из `staticContext` в `/test`. Замер упал 8918 → 5094 (-43%). Цель ≤ 5000 почти достигнута. Возможные дальнейшие шаги (шардирование, prompt caching) откладываются до момента, когда rules coverage будет ≥ 50%.

**Замечено:** /test 2026-05-08T18:24Z

---

### [ ] O-001 · `componentSetsWithDefaultVariantKey` = 0

После перехода на новый формат `index.json` ни у одного `component_set` нет `defaultVariantKey`. Это значит каждый импорт сета в Implementer = два MCP-вызова (`importComponentSetByKeyAsync` + `set.children.find`) вместо одного.

**Когда закроется:** первый `/syncKeys` через MCP заполнит ключ дефолтного варианта для всех 79 сетов.

---

### [ ] O-002 · `alwaysLoadedTokensEst` ~6900 при таргете ≤ 5000

Статика, попадающая в каждый `/builder`: `CLAUDE.md` + `rules.md` + `rules/skeleton.md` + `registry/index.json` + `.claude/commands/builder.md` ≈ 27.5KB ≈ 6.9k токенов.

**Кандидаты на распил:**
- `CLAUDE.md` — там есть онбординг-инструкции (Шаги 0/1/2), которые не нужны в каждом `/builder`-вызове. Вынести в отдельный файл, который грузится только при первом сообщении.
- `.claude/commands/builder.md` — 135 строк, можно ужать (повторы в шагах 6–7).

---

### [ ] O-003 · `rules/components/*.md` загружаются как whole-файл, даже когда нужна одна секция

В шаге 6 `/builder`: «открой `rules/components/<name>.md` для каждого компонента в плане». На один экран обычно 4-6 компонентов = 4-6 файлов целиком в контекст. В каждом 30–70 строк, далеко не всё нужно.

**Кандидат:** Skill читает только релевантные секции по якорным заголовкам (например, только пропы `navbar` и `tabs` из meshok.md, не весь файл).

---

### [ ] O-004 · Отсутствие prompt caching для статики

Anthropic API поддерживает `cache_control: { type: "ephemeral" }`. По `docs/TOKEN_OPTIMIZATION.md` это helo `agent:build`-агента, но в Claude Code-флоу (`/builder` через MCP, без npm-скрипта) кэширование сейчас не настроено никак.

**Лечение:** трудно — Claude Code сам управляет кэшем. Можно подсказать через структуру: статичные системные инструкции отдельно от динамичного контекста.

---

### [ ] O-005 · `keysInRulesNotInRegistry` даёт false positive на variant keys

Метрика сверяет 40-символьные хексы из `rules/components/*.md` с множеством ключей в `registry/index.json`. Но в index.json лежат только ключи `component_set` и (когда заполнятся) `defaultVariantKey`. Прямые ключи variant'ов (`bdebc04b…` для `meshok ↑`, ключи кнопок размера 36/secondary в `uniCard.md` и т.д.) — корректные импортируемые ключи, которых в реестре в принципе нет.

Эффект: на первом прогоне `/test` показала `keysInRulesNotInRegistry: 9`, хотя ни одна из этих 9 строк не сломана.

**Где замечено:** `/test` 2026-05-07T15:26Z, baseline-прогон.
**Лечение:** либо собирать допустимые variant keys из `components.json` (когда `componentProps.variantKeys` будет заполнен), либо исключить ключи из колонок таблиц вариантов из проверки. Минимальный путь: в plugin-коде `/syncKeys` для каждого `component_set` помимо `defaultVariantKey` собирать `variantKeys: { "shape=circle, size=24": "<key>", … }` и складывать в `components.json`. Тогда метрика сможет валидно сверять.

---

## Закрытые

_(пусто)_
