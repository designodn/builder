# Бэклог на следующую сессию

Приоритизированный список задач. Обновляется в конце каждой сессии.
Детали — в `tests/issues/*.md` и `docs/COMPONENT_RULES_ISSUES.md`.

_Последнее обновление: 2026-05-11 вечер — test 20 + parseProps сессия (toast 1.0, buttonsViewBottom 1.0, chipsView outer usages, tabsView 1.1 + scrollView). placeholderHits=0 впервые._

> **Активный спринт (11.05–25.05).** Неделя 1: стабилизация Figma-генерации (helpers в Implementer, программный wrapper-swap, покрытие правилами топ-50, регресс-сьют). Неделя 2: запуск сайта-плейграунда ДС — галерея компонентов + просмотрщик собранных прототипов; источники React-кода: Storybook пользователя (`/mapStorybook`) и `get_design_context` для непокрытых (`/genFromFigma`). Acceptance — см. спринт.

_Предыдущее обновление: 2026-05-09 (после прогона test 8 + замечаний дизайнера)_

---

## 🔴 Блокеры — все правила, которых не хватает

После замечаний дизайнера к test 8: **все R-* по недостатку доки** подняты в блокеры. Без них Builder продолжает делать одни и те же ошибки.

### Свежие (test 8 → правки)

| ID | Что |
|---|---|
| **R-021** | `navbar.middle` по умолчанию = `placeholder`. Нужен явный свап `'✎ · middle ·#1031:6': contentsView.id` ПЕРЕД попыткой findOne(title). Документировать в `navbar.md` |
| **R-022** | uniCell — `layoutSizingHorizontal='FILL'` обязателен + обёртка в cellList-контейнер с `cell-view/{←horizontal→,↑vertical↓,→gap←}/default`. Документировать в `uniCell.md` |
| **R-023** | `vibe ❖ view 1.0` — для всех successState/emptyState (не собирать вручную из illustration+content). Документировать в `vibe.md` и `skeleton.md` |
| **R-024** | Заголовки секций — **только** через `header 1.1` с `size=27/21/17/15` по уровню. Серия `* ◇ content` — только inline-текст. Документировать в `header.md` и `skeleton.md` |
| **R-025** | Стандартный фон страницы — `surface/secondary` (`da9946fb...`), не primary. Primary — для островков-блоков поверх. Документировать в `skeleton.md` и `tokens.md` |
| **R-026** | `inputText.placeholder`-текст не настраивается через `setProperties` (это часть мастера в Figma). Только override TEXT-ноды через `findAll`. Документировать в `inputText.md` |
| **R-027** | `uniCard 1.0 ❖ view` — обязательный свап `size#6313:33` на конкретный `320/220/160 ◇ uniCard` при создании. Документировать в `uniCard.md` |

### Свежие (программные)

| ID | Что |
|---|---|
| **A-030** | Wrapper-компоненты (chipsView/uniCard/uniCell-list/selectionCell-list/buttonsView) требуют обязательного swap `quantity`/`size` на конкретный preferredValue при создании |

### Старые R-* (подняты в блокеры по запросу)

| ID | Что |
|---|---|
| **R-001** | Покрытие правилами 24.8% при цели 80% — продолжать сбор |
| **R-002** | INSTANCE_SWAP-слоты без явного `variantProps` в правилах (для разных variants одного COMPONENT_SET) |
| **R-003** | Нет таблицы соответствия «компонент → секция правил» (вынести из `builder.md` в `_index.json`) |
| **R-004** | Эмодзи и спецсимволы в именах токенов — нужна явная политика «всегда `name#id`» |
| **R-006** | `rules.md` не отражает tuple-формат `index.json` |
| **R-009** | `rules/templates.md` без обратного индекса «компонент → шаблон» |
| **R-010** | `rules/skeleton.md` не описывает desktop/web |
| **R-016** | Опечатка `platofrm` в Figma — фикс на стороне дизайнера |

---

## 🟡 Средний — UX / архитектура

| ID | Что |
|---|---|
| A-003 | Builder без правил для компонента — undefined behavior (fallback) |
| A-004 | Implementer без обработки plugin-ошибок |
| A-005 | Нет flow «начать заново» в `/builder` |
| A-006 / R-007 | Builder молча выбирает вариант navbar |
| A-007 | `/builder` не проверяет `config.json` |
| A-010 | `/syncKeys` без batch-flow на >10 needs_review |
| A-011 | Figma node-link не открывает узел на другой странице |
| R-005 | `/syncKeys` не пересобирает `numbers-paddings/variables.json` |
| R-008 | Регресс между правилами и `components.json` |

---

## 🟢 Низкий — оптимизация

| ID | Что |
|---|---|
| O-001 | `componentSetsWithDefaultVariantKey=0` в реестре |
| O-002 | `alwaysLoadedTokensEst` ~5094 при цели ≤5000 |
| O-003 | Шардирование `rules/*.md` по секциям |
| O-004 | Prompt caching для статики |
| O-005 | `keysInRulesNotInRegistry` false-positive на variant keys |
| A-017 | Батчинг страниц в Component Agent |
| A-022 | Сбор фидбека от collaborator-дизайнеров |

---

## ✅ Закрыто 2026-05-11 (вечерняя сессия)

- **R-041** — `systemComponent` boolean всегда `true`; чтобы получить «пустой» вид — свап slot на `handle ❖ view` (не отключать boolean). Применено в `meshok.md` и `_index.json`.
- **A-053** — post-swap discovery через `mainComponent.parent.name`, не `mainComponent.name`. Гoтча 3 в `builder.md`.
- **A-054** — regex для inner-button discovery должен охватывать версионные имена (`button 1` / `button 1.1`); label-prop — TEXT-типа, не BOOLEAN. Гoтча 4 в `builder.md`.
- **A-055** — `meshok ↓` всегда ABSOLUTE через хелпер `addMeshokDown(frame, opts)`. Применено в `meshok.md`.
- **parseProps toast 1.0** — полная запись в `_index.json` (default/positive/attention/negative + inner vertical/horizontal layout + booleans + buttons slot).
- **parseProps buttonsViewBottom 1.0** — записано в `_index.json` ранее.
- **parseProps chipsView outer 5 вариантов** — usages подтверждены Настей и записаны (choicePrimary/choiceCustom/suggestPrimary/suggestCustom/userPrimary).
- **parseProps tabsView 1.1 + tabsView ◇ scrollView** — полная запись с двухуровневой структурой (style + quantity N=2..10) + helper `addTabsView` в `tabsView.md`.

### test 20 (3-экранный флоу отписки, adversarial)

- ✅ **placeholderHits=0** впервые в истории (vs 6 в test 19, 33 в test 8)
- ✅ R-041 (systemComponent=true + handle swap)
- ✅ A-052 (inputText left=false, без sparkle)
- ⚠️ skeletonViolations 0→3 (A-055, закрыто хелпером)
- ⚠️ paddings tokenCov 0.25→0.21 (хвост на свеже-собранных кастомных фреймах)

## Закрыто ранее (15+)

A-019, A-020, A-021, A-023, A-024, A-025, A-026, A-027, A-028, A-029, R-011, R-012, R-013, R-014, R-015, R-017, R-018, R-019, R-020

---

## 🎯 На следующую сессию — приоритет

1. **R-040 / parseProps featureBanner 2.0** — последний крупный нераспарсенный компонент верхнего уровня.
2. **toast `negative ◇ toast` usage** — Настя не уточнила отличие от `attention`; уточнить и обновить _index.json.
3. **Спринт неделя 1, этап 1.1** — реинтегрировать helpers (`addMeshokDown`, `addTabsView`, `addChipsView`) в Implementer как primary path; убрать ручные `createInstance`.
4. **Спринт неделя 1, этап 1.3** — programmatic wrapper-swap по `requiredSwap` в `_index.json` (убивает 476 unswappedSlots системно).
5. **Прогон test 21** — большой флоу (e-commerce 5+ экранов) с использованием новых helpers (meshokDown / tabsView / chipsView) + проверка регресса placeholderHits=0.

---

## 📊 История прогонов

| Прогон | Размер | Время | Coverage | placeholder | skeletonViol | tokenCov |
|---|---|---|---|---|---|---|
| test 5 (Профиль) | small=1 | 5.6s | 1.0 | 1 | 0 | — |
| test 6 (Регистрация) | small=2 | 5.85s | 1.0 | 7 | 0 | — |
| test 7 (Чат+Профиль) | small=2 complex | 8.06s | 1.0 | 21 | 0 | 0.51/0.66/0.61 |
| test 8 (e-commerce) | **medium=8 complex** | **11.24s** | **1.0** | 33 | **0** | **1.0/1.0/1.0** ✓ |
| test 19 (mixed) | mixed | — | — | 6 | 0 | — |
| test 20 (отписка) | **small=3 adversarial** | — | — | **0 ✨** | 3 → 0 (A-055) | 0.21/1.0/1.0 |

**Тренд 2026-05-11 вечер:** placeholderHits=0 впервые. Главная боль теперь — paddings tokenCoverage (0.21) на кастомных фреймах. R-021..R-027 закрыты в правилах; A-053/A-054/A-055 закрыты в `builder.md` Гoтчи 3-4 + хелпере `addMeshokDown`.
