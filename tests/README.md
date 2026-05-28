# Тесты и метрики

Запускается через `/test`:
- **`/test`** (quick) — статические метрики реестра/правил/контекста + опрос Насти про замеченные проблемы.
- **`/test --full`** (adversarial) — автономный прогон `/builder` от лица случайного сениор-дизайнера: бриф, споры по ходу, сборка макета в Figma на новой странице `test N`, визуальный ревью через `get_screenshot`, пакет правок в конце. Цель — собрать бэклог доработок до раскатки.

## Структура

```
tests/
├── README.md                  ← этот файл
├── metrics.jsonl              ← append-only, по строке на запуск
└── issues/
    ├── code.md                ← баги, type-ошибки, мёртвый код
    ├── optimization.md        ← перегретые токены, лишние вызовы, дубли
    └── agents.md              ← поведение агентов (research/text/json/implementer/builder)
```

Проблемы правил компонентов идут в `docs/COMPONENT_RULES_ISSUES.md` (префикс `R-NNN`).

## Метрики

Каждая строка `metrics.jsonl` — JSON-объект:

| Поле | Что значит |
|---|---|
| `ts` | ISO timestamp запуска |
| `mode` | `quick` / `full` |
| `rulesCoveragePct` | % компонентов реестра, у которых есть `rules/components/<slug>.rule.json` (матч по полю `name`) |
| `propsDescribedCoveragePct` | % компонентов с непустым `doc.whenToUse` И хотя бы одним описанным пропом (`variants`/`slots`/`booleans`/`textProps`) |
| `alwaysLoadedTokensEst` | оценка токенов статики, попадающей в каждый `/builder` |
| `buildSampleSeconds` | реальный тайминг пробного `/builder` (если `--full`) |
| `buildSampleTokensIn` | input-токены пробного `/builder` |
| `buildSampleTokensCacheRead` | сколько уехало в cache hit |
| `componentsRendered` | (`--full`) всего INSTANCE-нод во фреймах прогона |
| `componentCoverage` | (`--full`) `componentsRendered / componentsPlanned`, 0–1 |
| `placeholderHits` | (`--full`) TEXT-нод с дефолтным плейсхолдером (`Text`, `label`, `hint`, ...). Включает navbar middle title и любые другие TEXT-копи |
| `skeletonViolations` | (`--full`) нарушений базовых правил: нет `meshok ↓`, не абсолют, raw HEX/px, orphan-инстансы на странице |
| `placeholderSignal` | (`--full`) сигнальная метрика: wrapper-инстансы с `placeholder` mainComponent + INSTANCE_SWAP-пропы прямых детей фрейма с дефолтом `'12:6'`. Не zero-target — optional слоты тоже считаются |
| `tokenCoveragePaddings` | (`--full`) доля паддингов/гэпов привязанных к `numbers-paddings` переменным (0–1) |
| `tokenCoverageFills` | (`--full`) доля fills привязанных к Colors Palette переменным (0–1) |
| `tokenCoverageTexts` | (`--full`) доля TEXT-нод с привязанным textStyleId из Typography (0–1) |
| `notes` | свободный комментарий к запуску |

## Целевые ориентиры

Двигаемся в эту сторону. Текущие значения смотри в последней строке `metrics.jsonl`.

| Метрика | Цель |
|---|---|
| `rulesCoveragePct` | ≥ 80% |
| `propsDescribedCoveragePct` | ≥ 80% |
| `alwaysLoadedTokensEst` | ≤ 5000 |
| `buildSampleTokensIn` (простой экран) | ≤ 8000 |
| `componentCoverage` (`--full`) | ≥ 0.95 |
| `placeholderHits` (`--full`) | = 0 |
| `skeletonViolations` (`--full`) | ≤ 1 |
| `placeholderSignal` (`--full`) | ↓ от прогона к прогону (signal, не zero-target) |
| `tokenCoveragePaddings` (`--full`) | ≥ 0.90 |
| `tokenCoverageFills` (`--full`) | ≥ 0.95 (компоненты ДС наследуют сами; если есть кастомные блоки — фон только через variable) |
| `tokenCoverageTexts` (`--full`) | ≥ 0.95 |


## Как читать журналы issues

Каждая запись в `issues/*.md` имеет идентификатор `<КАТЕГОРИЯ>-NNN`:

- `C-NNN` — code
- `O-NNN` — optimization
- `A-NNN` — agents
- (правила компонентов идут с префиксом `R-NNN` в `docs/COMPONENT_RULES_ISSUES.md`)

### Тоггл статуса

В заголовке каждой записи стоит чекбокс:

- `### [ ] X-NNN · …` — открытая
- `### [x] X-NNN · …` — закрытая

Закрывая проблему: 1) меняй `[ ]` на `[x]`; 2) добавляй внизу описания строку `**Закрыто:** YYYY-MM-DD — что и как починили (commit hash, если есть)`; 3) переноси запись в раздел `## Закрытые` в конце файла.

Чекбокс — однострочный признак для быстрого взгляда (и diff-friendly). Раздел «Закрытые» — для истории, чтобы не терять контекст решений.
