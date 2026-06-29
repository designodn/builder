# Live `/builder` sessions log

Накопительный лог живых сессий после активации semantic-roles (PR #1c, #225 merged). Один файл, ручные записи в конце каждой сессии. Используется как точки данных для шага 8 эпика #215 (objective check) — без отдельного прогона. Предложение из pair-консультации после merge #225.

Формат записи:
```
## <дата> · <флоу>

- pre-state: commit_sha, rules_digest
- Бриф: <цитата от дизайнера>
- semantic-roles контекст: <активные роли из E.0 reasoning>
- builder_picks ключевые: <что выбрал>
- e0_role_filter_applied / skipped_no_roles: <числа>
- Snapshot: <ссылка на tests/baseline/builder-snapshots/<id>.json>
- Что сработало: ...
- Что не сработало: ...
- Действие: ...
```

---

## 2026-05-22 · Pre-state перед первой sanity-check сессией

Контекст активации:
- HEAD: `55ec709` (P2-1c.fix: NIT'ы из ревью).
- Последние 5 коммитов:
  - `55ec709` builder(P2-1c.fix): NIT'ы из ревью
  - `3c8b2c4` builder(P2-1c): активация semantic_roles_enabled + rules-digest + микротесты
  - `c02163a` builder: P2 PR #1b — system/* roles в meshok-down.systemComponent (#224)
  - `42df382` builder: P2 PR #1a — semanticRoles schema-infra (без поведения) (#223)
  - `4c2ed6a` builder: P0-5 — applyRuleDriven layoutRules для anchored-композитов (#221)
- `rules_digest` baseline: `04fc706c9211e02d645df267a603f9f5b0f630f68148f3eef36b2947b12139b6`.
- Активные namespace в `rules/semantic-roles.json`:
  - `system/bottom` (slot-only), `system/anonymous-bottom`, `system/authenticated-main`, `system/authenticated-secondary`, `system/numeric-input`, `system/alphabetic-input` — все на `meshok-down.slots[systemComponent]`.
- `_session.semantic_roles_enabled` default = `true`.

Что проверяем в первой сессии:
- На PIN-экране Builder ставит `keyboardNumeric ❖ view` (не дефолтный `tabbarPrimary`).
- На welcome — `handle ❖ view`.
- `e0_role_filter_applied` > 0.
- `tests/baseline/builder-snapshots/<id>.json` создаётся.

---

## 2026-05-22 · Welcome регистрации · DRY-RUN

- pre-state: `commit_sha = d5d7d38`, `rules_digest = 04fc706c...`
- session_id (симулированный): `dryrun-welcome-2026-05-22-001`
- Бриф: «Стартовый экран регистрации, заголовок «Заходи», подпись «Тут люди, которые тебе понравятся», кнопка «Зарегистрироваться», иллюстрация наверху»
- Активные роли (из контекста): `["system/anonymous-bottom"]` — пользователь анонимный, welcome/signup
- E.0 фильтр на `meshok-down.✏️ systemComponent#1073:2`:
  - 5 preferred → пересечение с `[anonymous-bottom]` → **1 валидный**: `handle ❖ view` (один кандидат с `semanticRoles: ["system/anonymous-bottom"]`).
  - `confidence: "high"` — однозначный semantic match.
- builder_picks ключевые:
  - `meshok-down.systemComponent` → `picked: "handle ❖ view"`, reason: «welcome — анонимная зона; system/anonymous-bottom → handle»
  - `meshok-down.buttonsView` → `picked: "buttonsViewBottom 1.0 ❖ view"` (fallback на isDefault, slot без `role`)
  - `meshok-down.float/toast` → `decision: "hide"` (не нужен на welcome)
- e0_role_filter_applied: 1 (systemComponent)
- e0_role_filter_skipped_no_roles: 1 (buttonsView без `role`)
- text_picks: `header→«Заходи»`, `15-primary-content→«Тут люди…»`, `button.label→«Зарегистрироваться»` (все `source: "brief"`)
- coverage_pct: 100
- divergence (Шаг 6 J): пусто
- Gates: G-I2.1 PASS (appliesTo консистентен), G-I2.2 PASS (mapping exists), G-I2.3 deferred (PR #1c).
- Snapshot: physically не записывается в dry-run; печатается на экран.

### Что сработало
- ✅ E.0 reasoning корректно распознал «welcome регистрации» → `system/anonymous-bottom`.
- ✅ Semantic-roles фильтр сузил 5 preferred до одного (`handle ❖ view`) — точное попадание.
- ✅ `confidence: high` без двусмысленности.
- ✅ G-I2.1 / G-I2.2 PASS — appliesTo консистентность (`system/bottom` slot-only).
- ✅ Slot без `role` (buttonsView) корректно отваливается на старый путь через `e0_role_filter_skipped_no_roles`.

### Что заметила (не баг, наблюдение)
- На welcome только один slot реально использует semantic-roles. Остальные — fallback. Это ожидаемо — bootstrap PR #1b покрыл только `systemComponent`. Расширение namespace'ов запланировано в следующих PR'ах.
- Бриф без `meshok ↑` (welcome без navbar). Реалистично также проверить кейс **с navbar** (регистрация шаг 2 с back).

### Что не сработало
- (ничего — sanity-check прошёл)

### Действие
- Sanity-check ОК для случая «1 valid slot semantic match». Следующая сессия — проверить кейс с **несколькими активными ролями** одновременно (например, PIN-экран в onboarding-flow: `numeric-input` + потенциально `anonymous-bottom`) — увидим как поведёт filter при пересечении нескольких ролей.
- PR #2 (typography-atom) — можно стартовать после ещё 1-2 dry-run/real sessions для разных кейсов.

---

## 2026-05-22 · Ретроспектива P2 — закрытие эпика на одном кейсе

После dry-run Welcome решили разведать кейс под PR #2 typography-atom. Нашли `custom-contentsview.rule.json` — 3 slot'а × 11 typography-preferred (11/13/15/17/21/27/56 размеры). Сначала казалось «идеально для PR #2», предложила namespace `typography/h1, h2, body, caption...`.

**Но Настя поставила правильный вопрос:** «нам точно нужна эта семантика?»

При анализе по собственному критерию ARCHITECTURE.md «semantic, not visual» — `typography/h1` оказался ближе к anti-pattern `small-text` (визуальный размер), чем к valid `form/error` (намерение). Архитектор уточнил тест:

> «Можно ли поменять роль, не меняя элемент? Если да — семантика. Если нет — визуал.»

`typography/h1` тест не проходит (h1 это h1 везде). Альтернативы для typography-выбора уже работают: `usage` поля + LLM-reasoning на E.0 + `builderRule` на variants (P0-2).

**Решение:** P2 эпик закрыт на одном `system/*` кейсе. Dormant, не mistake. Инфраструктура additive, цена нулевая. Если через 6 мес. появится 2-й кейс — расширим. Через 12 мес. без второго кейса — формальное закрытие.

**Урок зафиксирован** в новом `docs/ARCHITECTURE_LESSONS.md`:
1. **Правило N кейсов:** новая ось schema требует ≥2 независимых кейсов в реестре ДО эпика. Discovery — Phase 0.
2. **Тест semantic vs visual:** «можно ли поменять роль, не меняя элемент?»

**Следующая задача:** P1 batch (заполнение WIP-правил через `/parseProps --batch --hypothesize`).

---

