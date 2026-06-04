# Changelog

Все значимые изменения проекта `figma-lib-catalog` фиксируются здесь.  
Формат: [Keep a Changelog](https://keepachangelog.com/). Версии по [SemVer](https://semver.org/).

---

## [Unreleased]

### /builder

- feat: B.1 эпика #350 — sub-agent `slot-reasoner` (`.claude/agents/slot-reasoner.md`) для Шага 6 E.0. Вынос ~108 LOC inline-секции reasoning-per-slot/variant + recursive ruleRef walk + confidence assignment из main convo в self-contained агента. Agent принимает `cjm_handoff` + `expertOutputs` + `component_picks` + `plan_from_D` + `rule_bundle` + `semantic_roles_enabled`, возвращает `builder_picks[]` (hybrid prose + JSON-tail). Shape `builder_picks[]` (slug, slotProp ИЛИ variantProp, path, decision: swap|hide|gap|variant, picked, reason, confidence: high|medium|low-fallback|none, matched_roles?, ts) НЕ изменился — downstream-шаги E.0.5 / E.1 / E.2 / G-I1.5 потребляют тот же контракт. Recursive walk строго по `rule_bundle.rulesBySlug` (от bundler'а Шага 7), без file I/O в агенте — single source-of-truth для closure. Anti-cycle Set по slug на пути, depth cap из `bundle.meta.depth`. `divergences[]` от агента (role_no_match) → typed entries в `_session.rule_contributions[]`. Stateless: Builder сбрасывает `_session.builder_picks = []` перед каждым вызовом (walk-back из Шага 7 H). Builder.md Шаг 6 E.0 сократился с ~108 строк reasoning-проз до ~50 строк dispatch'а + контракт. AGENT_ARCHITECTURE.md и AGENT_ROLES.md обновлены (диаграмма Шага 6 + listing + новая секция 1.6). Color: не присвоен (как `ascii-mockup` / `architect`) — палитра 8 цветов исчерпана при N=11+ агентов, цветовые collisions не критичны для internal-агентов. Закрывает B.1 из roadmap'а #350.

- feat: project-scoped Stop-hook `tools/stop-hook-builder-gates.sh` — enforce'инг completion флоу `/builder`. Дополняет spec-level G-P-skeleton (#348) hard-enforcement'ом на уровне Claude Code хука. Триггер: пользователь явно вызвал `/builder` в сессии. Сигнал completion: либо `use_figma` tool call состоялся (G-V6 → G-I3 пройден, build в Figma завершён), либо `session-telemetry` issue создан (Шаг 8 финализирован). Без сигнала — exit 2 с человеческим сообщением Builder'у вернуться к флоу или явно объяснить дизайнеру причину прерывания. Recursion-guard через `stop_hook_active`. Подключен в `.claude/settings.json` как Stop-event hook. Покрыт smoke-тестом `tests/smoke-stop-hook-builder-gates.sh` с 6 кейсами (non-builder pass, builder+use_figma pass, builder+session-telemetry pass, builder без completion block, recursion guard, missing transcript path). Закрывает Фазу A.1 из roadmap'а #350 на минимальной поверхности — без требования pre-end snapshot файла (Фаза C.1 deferred): хук читает transcript напрямую.

- feat: эпик #338 закрыт — серия из четырёх PR (PR-0 gate-whitelist #345, PR-1 RULE_TREE_MAX_DEPTH single source #346, PR-2 cut `_session.ruleTrees[]` #347, PR-3 G-P-skeleton gate). Финальный шаг вводит новое семейство **G-P** (plan-time, internal) для валидации плана между Шагом 6 (резолв компонентов) и Шагом 7 (сборка в Figma). G-P-skeleton проверяет `rules/skeleton.json#composition` (requiredChildren, placement R-1/R-2/R-3, forbiddenAtFrameRoot) для каждого фрейма из `_session.cjm_handoff` + `_session.builder_picks[]`. До серии Шаг 6 F был пустым sub-step'ом «проверить план: meshok ↓, buttonsView, navbar, toast» без enforce'инга — дизайнерами фиксировался как часто пропускаемый (#338). Теперь Builder обязан сделать explicit self-check; FAIL → halt + человеческое сообщение про конкретное нарушение. Список инвариантов в builder.md не дублируется — single source это `rules/skeleton.json` (защита от doc-drift hallucination vector по уроку LESSONS). Schema enum `gates_passed[].id` уже содержит `G-P-skeleton` (зарезервирован в PR-0); `verify-gate-whitelist` после merge зарепортит 15↔15. Закрывает #338.

- refactor: `docs/AGENT_CONTRACTS.md` удалён, уникальное (гибридный output protocol + sentinel-передача) переехало в `docs/AGENT_ARCHITECTURE.md` отдельными секциями. Это закрывает single-source-of-truth урок из LESSONS — точные shape'ы handoff'ов жили в трёх местах одновременно (AGENT_CONTRACTS + .claude/agents/*.md + .claude/commands/builder.md), теперь source of truth — `.claude/agents/<name>.md` (frontmatter + body), AGENT_ARCHITECTURE — карта. README.md и CLAUDE.md cross-references зачищены.

- feat: `architect` получил новую ответственность — **Staleness Watch во всех режимах**. Перед основным алгоритмом любого режима архитектор сканирует watched architectural docs (`docs/AGENT_ARCHITECTURE.md`, `docs/AGENT_ROLES.md`, `docs/AGENT_PORTABILITY.md`, `docs/ARCHITECTURE_LESSONS.md`) на broken refs / missing listings / renamed paths / color collision drift / gate name drift. Находки классифицируются по action level: **AUTO-FIX** (узкий cross-reference класс — broken paths, missing/orphan listings, removed-file refs — только Настя через identity-check, cap 5 per invocation, всегда показывает diff), **PROPOSE-FIX** (textual diff в output для решения Насти), **DEFER** (substantive rewrites — human decision). Edit-scope architect'а расширен до watched-list (cross-reference fixes вне LESSONS; в LESSONS остаётся append-only). Safeguards: NEVER edit вне watched-list, NEVER restructure, NEVER silent edits, NEVER commit/push. AUTO-FIX триггерится автоматически при scan'е, без дополнительного sentinel'а. Закрывает класс «архитектурные docs отстают от реального состояния через 3-6 месяцев и LESSONS-урок про single-source-of-truth приходится выводить заново».

- fix: финальный follow-up по PR #342 (двойное code-review + architect review): (1) disclaimer'ы про ортогональность двух semantic-roles dictionaries — `cjm_handoff.elements[].role` (leaf-level input intent, runtime enum в cjm.md) и `rules/semantic-roles.json` (slot-axis атрибут реестра, namespace `system/*`) — добавлены в `.claude/agents/cjm.md` и `.claude/agents/component-picker.md` с ссылкой на `docs/ARCHITECTURE_LESSONS.md` («Тест semantic vs visual»). Архитектурное решение — НЕ унифицировать оси в общий `cjm/*` namespace (architect verdict: разные pipeline-stage'и, разные actor-consumer'ы, bootstrap-критерий «N кейсов в реестре» не выполняется для cjm-словаря). (2) Degraded-ветка для `expertOutputs.<role>.raw_text` fallback явно прописана в `cjm.md` Шаг 1 алгоритма — если эксперт вернул только `{raw_text}` (после retry на невалидный JSON), cjm-агент эвристически читает prose и помечает в `uncovered[]` как `degraded-input: <role>`. Закрывает hidden contract «работает потому что LLM умный». (3) Границы между meta-агентами (`code-reviewer` vs `architect`) формализованы в `docs/AGENT_ARCHITECTURE.md` новой секцией с таблицей зон ответственности и сценариями подключения; симметричная нота добавлена в `code-reviewer.md`. (4) Color allocation policy задекларирована в `docs/AGENT_ARCHITECTURE.md`: collisions между pipeline-агентами (внутри `/builder`) запрещены, между pipeline и meta-агентами (`code-reviewer`/`debugger`/`architect`) допустимы по соглашению (палитра ограничена ~8 стандартных цветов, агентов больше). Известные cross-domain collisions задокументированы. (5) Legacy ссылка в `docs/AGENT_ROLES.md` (Text Layout «Контракт данных: src/agents/text-layout/TEXT_LAYOUT_AGENT.md») заменена на актуальную `.claude/agents/text-layout.md`; "Сохраняет результат в `_session.text_layout[]`" переписано на "Builder кладёт результат" + добавлено правило про кэш и не-повторный вызов post-G-V6. (6) NIT в `cjm.md` Шаг 1: упоминание `_session.expertOutputs` → `expertOutputs` (subagent читает из prompt, не из main-convo state). WARN-3 (стандартизация format'а литеральных sentinel'ов в prompt'ах) — отложен в follow-up issue. Refs #340, #342.

- feat: `architect` расширен до трёх режимов работы + опциональный self-update в LESSONS. Режим определяется sentinel'ом в первой строке prompt'а: `## Prior verdict:` → **follow-up** (точечный ответ поверх прошлого вердикта без повтора полного ревью), `## Idea:` / `## Proposal:` → **pre-emptive** (оценка идеи ДО реализации через LESSONS-тесты, вердикт PROCEED/RESHAPE/DROP), иначе → **review** (default, как было — BLOCK/WARN/OK). Приоритет при конфликте: follow-up > pre-emptive. Self-update триггерится дополнительным sentinel'ом `## Write to LESSONS:` + `## Append at: <раздел>` в prompt'е; перед записью обязательный identity-check через `mcp__github__get_me`, не-Настя получает текст урока в output для ручного append'а. Запись append-only (никогда не модифицирует прошлые записи, не создаёт новых разделов, не правит другие файлы; `Edit` ограничен путём `docs/ARCHITECTURE_LESSONS.md`). После append'а — diff в output, без silent write, без commit/push (Настя оформляет отдельным PR). Tools расширены: добавлены `Edit` (для append к LESSONS) и `mcp__github__get_me` (identity-check). AGENT_ARCHITECTURE.md обновлён под три режима.

- feat: новый sub-agent `architect` (`.claude/agents/architect.md`) — read-only архитектурный ревьюер для PR'ов, меняющих контракты и schema. Фокус: новые поля `_session`/`rule.json`/`cjm_handoff`/`component_picks`, новые namespace в `rules/semantic-roles.json`, новые gates, новые axis в `rules/components/ARCHITECTURE.md`, изменения protected paths (`rules/**`, `registry/**`, `.claude/commands/**`, `.claude/agents/**`, `CLAUDE.md`, scope-доки). Pre-read `docs/ARCHITECTURE_LESSONS.md` обязателен — без него правила «N кейсов» и «semantic vs visual» забываются. Возвращает BLOCK/WARN/OK с явной привязкой каждой находки к LESSONS-правилу или предложением вывести новое правило. Дополняет `code-reviewer` (тот про корректность кода, этот про системную эволюцию). Read-only — изменений в репозитории не вносит, доступен всем уровням; запись в LESSONS как мутация остаётся за Настей. Вызывается через Agent tool вручную или из `/autoMerge` на PR с label'ом `needs-architect`. AGENT_ARCHITECTURE.md обновлён.

- feat: front-half эпика #340 — Builder Шаги 4-7 переключены с inline-симуляции на реальные `Agent`-вызовы к зарегистрированным sub-agent'ам (`analytics`/`product`/`experience` в Шаге 4, `cjm` в Шаге 5, `component-picker` в 6.0, `text-layout` + `ascii-mockup` в чек-листе Шага 7). Это устраняет класс багов #332-#339 (gate G-V6 PASS на пустом state, потому что Builder «изображал» pipeline в main convo, не вызывая агентов). Контракты: новые поля `_session.{expertOutputs, cjm_handoff, component_picks}` объявлены в init declaration + reset rules при walk-back из Шага 7. Гибридный формат «prose + ```json``` хвост» для экспертов и CJM — Builder парсит **последний** fenced-блок с языком `json` (защита от quoted-JSON в prose от experience через WebFetch). 16-ролевой словарь `elements[].role` в cjm-handoff (включая `text-block` для параграфов). `ambiguities[]` от picker'а мапятся в E.1-формат `{slug, slotProp, path, candidates, question}`. `text-layout` фильтрует фреймы через `screen.states[] ∩ states_covered` (G-V4 фильтр Шага 6 H). `ascii-mockup` drill-down — через literal sentinel `DRILL_DOWN_SCREEN: <id>` первой строкой prompt'а (Agent tool принимает только `prompt: string`). Picker строит picks только для default-состояния — per-state — на `text-layout`. После Шага 7 чек-лист гарантирует `_session.text_layout[]` в кэше; в post-preflight G-I1 не вызывается повторно (LLM-нондетерминизм между двумя прогонами → дизайнер апрувил одно, в Figma полетит другое). Picker и cjm: при невалидном JSON — retry-промпт «верни только JSON», второй неудачный раз — halt + `/fb bug:builder-error`. Color collisions устранены: `text-layout: yellow→red`, `component-picker: cyan→orange`, `ascii-mockup: pink→gray`. Picker A-058 contract зафиксирован: prop keys не выписываются литералами, резолв через pattern+unique-match assert, ambiguous → `ambiguities[]`. Refs #340, follow-up к #341.

- fix: машинный якорь против пропуска вопроса про вложенные в `/parseProps` (рецидив #317, PR #328). Новое top-level поле `nestedAsked` (ISO timestamp) фиксирует факт диалога Шага 4.6 «парсить глубже / атом» — отдельно от `nestedProps.policy` (тот required-дефолт `askDesigner`, не свидетельство вопроса). `completeness.js checkNestedAsked` сверяет «есть слоты-кандидаты vs есть `nestedAsked`» — **temporally-scoped gate**: для новых правил (последний git-коммит после merge #328) → `pass:false` без `nestedAsked` (hard-gate); для legacy-правил → `⏳ grace period`, `pass:true` (self-heals при следующем `/parseProps`). Пишется только явной командой `--mark-nested-asked` сразу после `AskUserQuestion` (обе ветки ответа); `--close-nested` штамп НЕ ставит (создаёт стабы и в batch без диалога — ложный сигнал, поймано ревью). Заодно: `smoke-mutation-pipeline.js` Step 7 переписан под Inv15-as-hard-error (#326 повысил Inv15, meta-тест отстал → чинит красный CI на main).

- feat: PR-1 + PR-2 эпика #205 Step 2 (финал) — **Inv 14 (rule completeness) promoted из warn-only в hard error**. PR-2: закрыты все coverage-gap'ы — добавлены недостающие `variants`/`booleans` с контекстным `builderRule` в 6 правилах: `buttoncell` (paddings, style), `buttoncircle` (size, state, style), `featurebanner` (platform, style), `selectioncell` (paddings, `↩︎ switchSide`), `switch` (boolean `interactArea#12628:66`), `unicell` (`⚑ interactivity`). Все опции/дефолты byte-synced с `inspected-props.json`. PR-1: `validateInvariants` теперь `errors.push` вместо `process.stderr.write` для Inv 14 — любой Figma-видимый prop, отсутствующий в правиле, валит `test:rules`. **Промоция гейтилась по условию, не календарю:** baseline обнулён реальной починкой 12 gap'ов (не подавлением), поэтому 7-дневное окно наблюдения из плана PR-C1 закрыто по существу на 3-й день. Прежняя baseline-машинерия (`.inv14-baseline.txt` + diff в `validateAll` + CLI `inv14-baseline-update` + accumulator `_inv14Collected`) **удалена целиком**: после промоции в hard error она лишь дублировала то же сообщение вторым `exit(2)` (double-report, выявлено code-review). Канонический enforcement — per-file hard error. `test:all` зелёный, 208/208 valid. Урок про «промоция по условию vs календарю» зафиксирован в `docs/ARCHITECTURE_LESSONS.md`. Refs #205, #215 (P0 «rule completeness»).

- feat: PR-C2 эпика #205 Step 2 (часть 2/2) — `findSwappedChild` snapshot-diff fix. Закрывает PR-B test (e) BFS-limitation: multi-instance same-slug different-path теперь disambiguated. Когда rule имеет два slot'а с одинаковым preferred (например, форма с двумя `inputText` — `sLeft` и `sRight`), helper больше не misroute'ит оба override'а на первый BFS-match. Подход: snapshot `inst.children.map(c => c.id)` ДО `setProperties(INSTANCE_SWAP)` — Figma при swap'е создаёт ноду с НОВЫМ id, старая destroy'ится. `findSwappedChild(inst, comp, childIdsBefore)` теперь предпочитает first INSTANCE matching mainComponent **которого не было в snapshot** (= свежесозданный). Fallback на старое поведение (первый BFS-матч) preserved для случаев когда Figma reuse'нет id (теоретическое) или `childIdsBefore` пуст/не передан — backward-compat. Изменения byte-synced через `verify-helper-sync.sh` между `.claude/commands/builder.md` (helper body + findSwappedChild) и `tests/scripts/applyRuleDriven-tests.js` (literal copy). **Stub upgrade** в `tests/scripts/figma-stub.js`: `setProperties` теперь симулирует реальную Figma INSTANCE_SWAP — создаёт новый mock child instance с уникальным id (`__swap__<slotProp>__<counter>`) и копирует `componentPropertyDefinitions` от swapped-in компонента (как в production). Без этого snapshot-diff в helper'е не было бы testable — old/new children имели бы одинаковые id. Tests (b)/(c)/(e) обновлены: `registerComponent` теперь принимает `componentPropertyDefinitions` чтобы swap-children наследовали props. Test (e) hard-asserts flipped с `strictEqual` (документировал BFS-limitation) на `notStrictEqual` (now ДОЛЖНЫ быть разные child instances). Test (b) ассертит `instId !== 'root_meshok'` (а не конкретный pre-created child id) — после fix helper находит stub-generated child, не pre-existing.

- feat: PR-D эпика #205 Step 3 — forbidden-ops lint (`tools/verify-forbidden-ops.sh`). Guard ловит «helper-bypass» паттерны в runtime-инструкциях: прямые мутации инстансов в обход `applyRuleDriven` helper'а. Контракт зафиксирован builder.md:357-372 (helper obligation) + 879-892 (Forbidden API table). 4 паттерна с regex-only detection: (1) `inst.setProperties(...)` напрямую вне helper, (2) `.findChild/findOne/findAll` на инстансе вне helper, (3) `.mainComponent.key` registry-key reflection, (4) `.swapComponent(` direct call. Distinct от `verify-no-bad-apis.sh`: тот guard ловит **wrong Figma API choice** (importComponentSetByKeyAsync, литералы), этот — **helper bypass** на PR-B контракте. Sibling, не overlap. **Corpus pivot vs original plan:** план архитектора был «grep over tests/sessions/*.jsonl», но (a) этот файл пуст, (b) use_figma код не captured в session-telemetry schema. Pivot: scan `.claude/commands/` (где живут patterns/recipes). Это catches doc-rot до того как pattern уйдёт в реальные сессии. Three exclusion layers: (i) sentinel-bounded helper body в builder.md + applyRuleDriven-tests.js, (ii) `<!-- verify-forbidden-ops:skip-start/end -->` для special-purpose sections (passport flow в Шаге 7.6 — не rule-driven), (iii) backtick-inline markdown (prose mentions `instance.setProperties()` как описание поведения), (iv) NEG_REGEX ±5 lines (counter-example doc context). **Baseline cleanup:** 14 initial violations свелись к 0 через (1) passport-flow skip-section в builder.md:2556-2691, (2) backtick-inline detection (syncKeys.md prose), (3) skip-section вокруг cards-carousel recipe builder.md:1137 с FIXME-комментом о deferred rewrite (helper-call +6 LOC vs current 1, cost не оправдан пока bundle не доходит до этого callsite). Meta-test `tests/smoke-forbidden-ops.sh` + 4 fixtures `tests/fixtures/forbidden-ops-bad/*.md` гарантирует что regex'ы реально ловят паттерны. Wired в `.github/workflows/smoke-tests.yml` (paths + 2 step'а) + `verify-smoke-tests-wiring.sh` EXPECTED. `verify-trigger-completeness.sh` auto-passes (20 verify-*.sh в trigger-list'ах). Refs #205 Step 3.

- feat: PR-C1 эпика #205 Step 2 (часть 1/2) — completeness invariants в `tests/scripts/parseProps-utils.js`. Добавлены 2 новых invariant'а + один promoted из warn-only в hard error: (1) **Inv 3 promoted** — `nestedProps.ruleRef` target должен существовать на диске (раньше warn-only, теперь hard error symmetric с `tools/verify-ruleref-integrity.sh`); (2) **Inv 13** — composite-preferred requires `nestedProps.ruleRef` (approval-independent, narrows Inv 9 для случая когда target rule имеет controllable surface — slots/booleans/textProps/textNode); (3) **Inv 14 (WARN-ONLY)** — rule completeness vs `tests/scripts/inspected-props.json`: для каждого `componentPropertyDefinition` в inspected.defs (VARIANT/INSTANCE_SWAP/BOOLEAN/TEXT) проверяет что key appears в соответствующей секции rule (variants/slots/booleans/textProps). Skip silently если inspected lacks entry. Архитектор зафиксировал warn-only initial window: 2 недели observation, потом promote to hard error если spurious-rate низкий. Baseline на момент landing: **32 inv14 warnings across ~10 rules** — surfaces real drift между Figma и rule.json (navbar пропустил left/right slots, search скелетон без 14+ пропов, variants `paddings`/`size`/`style` в 6+ компонентах). Эти warnings — задача отдельного триажа, не блокирует. `loadInspectedProps()` lazy cache parallel к `_brokenNameCache`. Success message: `14 invariants pass` (вместо `12`). Все 176 правил schema-valid + invariant-valid (32 warnings внутри валидных). PR-C2 (часть 2/2) — `findSwappedChild` snapshot-diff fix + test (e) flip — отдельным PR'ом, helper body change в hot path требует более осторожного review.

- feat: PR-B эпика #205 Step 1 — atomic builder.md rewrite + sentinel-sync. `applyRuleDriven` signature изменилась с `(inst, ruleTree)` на `(inst, ruleSlug, ctx)`, где `ctx = { bundle, overrides, path, visited }`. Helper читает rule напрямую из `ctx.bundle.rulesBySlug[ruleSlug]` (output `tools/build-rule-bundle.js` из PR-A #278). Overrides — flat array проекции из `_session.builder_picks[]` + `_session.text_picks[]`, лукап через `findOverride()` с element-wise array equality на path. Cycle guard per-branch (Set cloned на каждом recurse). `_session.rule_bundle: null` добавлен additively — параллельно legacy `ruleTrees[]`. Sentinel-bounded helper body в `.claude/commands/builder.md` и в `tests/scripts/applyRuleDriven-tests.js` синхронизируются через `tools/verify-helper-sync.sh` (bootstrap-tolerant). Расширены тесты: 5 host-side reasoning (1-5) + 5 plugin-side runtime через stub-Figma (b-f). Test (e) (multi-instance same-slug different-path с двумя порядками children) задокументировал `findSwappedChild` BFS-limitation — known issue для Step 2 эпика, не PR-B regression. Test (f) подтверждает alwaysOn precedence defense-in-depth. Helper `arrayEquals` + `findOverride` живут под sentinel'ом, остальные helpers (`safeSetProps`/`normalizePencil`/`findSwappedChild`/`setTextNodeContent`) — стабильны, копируются без sentinel'ов. Шаг 7 example переписан под bundler-invocation pattern (Bash → stdout capture → `JSON.parse(<doubly-encoded>)` inline — load-bearing, **не упрощать до raw `${JSON.stringify}`** под угрозой template-literal hazard). 3 soft-landmines из плана архитектора защищены: (1) header «контракт зафиксирован #205» в новых `.js` файлах, (2) bullet «при правке между HELPER_BODY:START/END — прогнать verify-helper-sync» в комментах helper'а, (3) jq-canonical / unicode-pencil preservation в bundler. `_session.ruleTrees[]` остаётся параллельно — удалить как отдельный PR минимум через 2 недели наблюдения real-session telemetry. Step 5 эпика (autogen contextOn/Off) выкинут — bullshit-by-aspiration (см. финальный architect review). Reorder Steps 2/3: forbidden-ops lint первым после Step 1 (immediate enforcement что bundler used), completeness invariant вторым.

- chore: эпик #215 P2 (semantic-roles) закрыт на одном кейсе `meshok-down.systemComponent`. PR'ы #1a/#1b/#1c merged: schema + namespace `system/*` (6 ролей) + activation + gates (G-I2.1/.2/.3) + `tools/rules-digest.sh` + микротесты. Активирован `_session.semantic_roles_enabled` default = true, проверено dry-run-сессией на welcome регистрации (filter сузил 5 preferred до 1 `handle ❖ view` через `system/anonymous-bottom`). PR #2 typography-atom **не открывался**: при поиске кейса в `custom-contentsview.rule.json` (3 slot'а × 11 typography-preferred) усомнились в семантической природе — `typography/h1` это размер шрифта, не контекстная роль. По собственному критерию ARCHITECTURE.md «semantic, not visual» typography ближе к anti-pattern `small-text`, чем к valid `form/error`. Решение архитектурного pair-ревью — закрыть эпик честно как **dormant feature**, а не натягивать второй кейс ради симметрии. Инфраструктура additive, цена нулевая, оставлена в реестре для возможного будущего реального кейса. Если за 12 мес. второго кейса не появится — формальное закрытие как dormant. Зафиксировано в `docs/ARCHITECTURE_LESSONS.md` (новый файл) с двумя правилами: (1) «правило N кейсов» — новая ось schema требует ≥2 независимых кейсов в реестре ДО эпика, discovery — обязательный Phase 0; (2) уточнённый тест «semantic vs visual» — «можно ли поменять роль, не меняя элемент?». Pre-read для будущих schema-эпиков.

- chore: убрать из `rules/skeleton.md` дубли компонентных правил R-021 (navbar middle swap), R-027 (uniCard size swap), A-030 (wrapper swap). Канонические описания живут в `rules/components/navbar.rule.json` (R-021), `rules/components/unicard-view.rule.json` (R-027), `docs/BUILDER_GOTCHAS.md` (A-030 как частный случай A-059). Триггер — #186: в R-021 был пример с компонентом не из `preferred` (`17 · primary ◇ content` вместо `no subtitle · content`) и ручной `setDeep` в обход `applyRuleDriven`; Builder скопировал этот паттерн и на 9 фреймах подряд получил placeholder в navbar middle. После правки `skeleton.md` содержит только структурные правила скелета фрейма (meshok ↑/↓, page mode, baseline). Идентификаторы R-021/R-027/A-030 остаются как ссылки в комментариях `builder.md`. См. PR #197. Заметки `docs/COMPONENT_RULES_ISSUES.md` (R-030, R-029) тоже освежены — убраны висящие ссылки на удалённые секции.

- fix: R-025 проза описывала цвета токенов наоборот реальности (issue #183, PR #195). Дизайнер прочла «flat → `surface/secondary` → сероватый/тёплый», ожидала белый, заметила drift между ментальной моделью и spec'ом. Расследование выявило: биндинги (`flat→secondary`, `with-islands→primary`) корректны и не менялись; проза в `rules/skeleton.md:5,70-79` и табличка в `.claude/commands/builder.md:651-652` описывали цвета каждого токена в обратную сторону. Реальные цвета (подтверждены автором ДС): `surface/secondary` = **белый/чистый** (фон в flat + заливка островов в with-islands), `surface/primary` = **серый/тёплый** (фоновый слой только в with-islands, под белыми островами). Это **отменяет** «финальное» описание из ранней записи `fix: token mapping для page style modes` в этом же [Unreleased] — она зафиксировала наоборотные цвета. Также из комментария к issue #183 добавлен **auto-flat**: если на каждом экране ≤1 смысловой блок контента (типичная регистрация / линейный онбординг — телефон → код → имя → фото), Builder ставит `flat` без вопроса и сообщает дизайнеру одной строкой. Контракт «обязан спросить, без default'а» переписан под «по умолчанию спрашивает, исключение для 1-block flows» в `rules/skeleton.md:5,79`, `rules/skeleton.json#pageStyleModes._doc`, `rules/schema/skeleton.schema.json` (description у `designerChoice`; enum `["required"]` не тронут — семантика «designer обязан ответить когда вопрос задан» сохраняется). Эвристика «≤1 блок» сопровождена двумя списками контр-примеров (что не блок: длинный однотипный список ячеек, header+список, input+caption, illustration+text; что блок: разные по природе списки рядом, счётчики+лента в профиле, настройки с секциями). Что НЕ в этом PR: (а) Variant B/C из issue #183 (свопнуть дефолты flat↔with-islands ИЛИ добавить третий режим — требует сверки с авторами палитры); (б) code sample `rules/skeleton.md:83-85` с `{r:1,g:1,b:1}` для `surfacePrimary` остаётся как есть, инертен из-за `setBoundVariableForPaint`, помечен как косметический долг.

- fix: правки по code-review PR #180:
  - `setTextNodeContent` — добавлен Symbol-guard для `figma.mixed` шрифтов. Когда TEXT-нода имеет inline-форматирование несколькими шрифтами, `n.fontName` это Symbol (`figma.mixed`). Раньше код в else-ветке делал `n.fontName = targetFont` и терял mixed-разметку silent'но. Теперь `typeof n.fontName === 'symbol'` → early return. Для одношрифтовых navbar middle / simple cells не воспроизводится, но защита от future кейсов.
  - В таблице «`textProps` vs `textNode`» добавлена строка «Можно ли вместе? — **Нет**, mutually exclusive». Раньше различение было, но coexistence не запрещён — Builder мог задать оба «на всякий случай». Implementation-defined порядок (последняя запись wins) теперь явно помечен как не-контракт.

- fix: 2 проблемы в `applyRuleDriven` helper (выявлены live-тестом после мерджа PR #179):
  1. `findSwappedChild` падал с `TypeError: no such property 'children' on RECTANGLE node` — у листовых нод (RECTANGLE/TEXT/VECTOR) нет getter `children`. Fix: guard `'children' in n` перед доступом. Тот же fix применён ко второму BFS-обходу в новом `setTextNodeContent`.
  2. A-040/A-043/A-045 (navbar title не отображается) были закрыты переоценённо: A-058-helper умел только set'ить text-componentProperty через `setProperties`, но `no subtitle · content` (default content navbar middle) **не exposeит** text-componentProperty (только `tags#21963:3`, `badge#21963:0`, `style`). Текст — intrinsic TEXT-нода. Добавлен helper `setTextNodeContent(inst, text, font)` — BFS до первой TEXT-ноды + `loadFontAsync` + `.characters` set. `applyRuleDriven` поддерживает `textNode` leaf-поле в ruleTree рядом с `textProps`. В `builder.md` добавлена таблица «`textProps` vs `textNode`» для различения двух кейсов. Финал-тест в Figma (`twL50t4GFELOKpEwFWSvwW` frame `813:6920`): meshok ↑ → navbar 1.0 → no subtitle · content → текст «Профиль» в Inter Semi Bold, никаких placeholder'ов на 3 уровнях. A-058 закрытие в `tests/issues/agents.md` обновлено с честным scope.

- feat: **A-058 закрыт** — реализован `applyRuleDriven(inst, ruleTree)` helper для рекурсивного Rule-driven swap'а. Состоит из двух частей: (а) хост-сторона — Builder собирает `ruleTree` объект из top-level rule.json + рекурсивно резолвит `nestedProps.ruleRef` через `rules/components/<ruleRef>.rule.json` и инлайнит дерево в use_figma код как литерал (без I/O в plugin sandbox); (б) plugin-сторона (~80 строк JS в `.claude/commands/builder.md`) — рекурсивно ходит по slots, применяет swap на `preferred[isDefault=true]`, set'ит pairedBoolean по `alwaysOn`/`defaultOn`, ставит variants.default/contextValue, textProps.sampleTexts[0]/contextText. `findSwappedChild` BFS до первого `mainComponent.id` match. Закрывает одновременно R-021 (navbar middle), R-036 (toast), R-037 (buttonsView), A-040 / A-043 / A-045 (navbar title через nested textProps). Контракт «никаких placeholder'ов на любом уровне» теперь выполним. В `tests/issues/agents.md` A-058 переведён в `[x]` с резолюцией.

- feat: новый CI guard `tools/verify-skeleton-prose-sync.sh` — drift detector между тремя источниками правды по pageStyleModes (`rules/skeleton.json` = source of truth → `rules/skeleton.md` prose → `.claude/commands/builder.md` recipes). Извлекает через jq все varRef-токены из `pageStyleModes` (фильтр: содержат `/`, не `_doc`-поля) и проверяет что каждый есть в обоих prose-файлах хотя бы в одной форме (full-form `const/custom/cp-16` или short-form `cp-16`). Ловит rename переменной без обновления prose, удаление токена из источника правды, добавление нового token упомянутого только в JSON. Прицеплен к smoke-tests workflow.

- test: новый smoke-test `tests/smoke-no-bad-apis.sh` + 4 fixture-файла в `tests/fixtures/bad-apis-bad/` (по одному запрещённому паттерну на файл: importComponentSetByKeyAsync, frame.resize(N,N), cornerRadius=N, findOne(...name...)). Запускает `verify-no-bad-apis.sh` на fixture-каталоге, ожидает exit 1 + ловлю всех N паттернов. Защищает от regex regression. Скрипт `tools/verify-no-bad-apis.sh` расширен — принимает optional CLI arg для override SCAN_PATHS (для самотестов).

- refactor: `rules/schema/skeleton.schema.json` — `pageStyleModeName` enum вынесен в shared `$defs` (`["flat", "with-islands"]`). Переиспользуется в `pageStyleModes.modes[*]` через `$ref`. Добавление нового page-style-mode (например, `page-vibe`) теперь требует правки `enum` в одном месте + `required` arrays — снижение количества мест синхронизации с 5 до 2 (closing arch-review Nit-7).

- fix: правки по code-review PR #177:
  - `tools/verify-no-bad-apis.sh` — findOne regex расширен с `findOne\s*\([^)]*name\s*[=!]==` (узкий, ловил только синтетику) до `findOne\s*\([^)]*name` (любой findOne, в скобках которого упомянуто слово `name`). Покрывает `figma.root.findOne(n => n.name === 'foo')`, `.findOne(byName)`, `.findOne(n => n.name.startsWith(...))` и т.д. Контекст-проверка ±5 строк с negative-маркерами сохраняется, поэтому Forbidden API таблица (где findOne упоминается как ❌-пример) не триггерит false-positive.
  - `.claude/commands/builder.md` секция «Рекурсивность» — добавлен второй абзац с явным описанием фактического поведения до закрытия A-058: «рекурсия на верхнем уровне только, nested placeholders на 2-3+ уровнях ожидаемы и допустимы, не пытаться воспроизводить applyRuleDriven руками». Снимает риск что Builder начнёт паниковать в логах или тратить токены на ручную имитацию helper'а.
  - `rules/schema/skeleton.schema.json` мелкие правки: (а) `varRef.oneOf` → `anyOf` (типы string|number взаимоисключающи, anyOf идиоматичнее, AJV дешевле); (б) `subsequentIslandSpec.description` объясняет почему `itemSpacing` есть здесь и нет на самом `firstIslandSpec` (gap живёт в `innerContentWrapper`, асимметрия структурно намеренная); (в) `$id` приведён к локальной форме `skeleton.schema.json` (как у component-rule.schema.json и session-telemetry.schema.json) — совпадает с относительной ссылкой `$schema` в `rules/skeleton.json`, IDE с json-schema-watcher'ом теперь резолвит однозначно.
  - Blocker из ревью (smoke-tests.yml конфликт после #174) уже закрыт коммитом `41c1913` ДО публикации ревью — ревьюер просто не успел учесть.
- chore: `rules/skeleton.md` синхронизирован с v4 skeleton.json — обновлены ASCII-схема (теперь показывает оба mode'а), R-0 (positioning meshok ↑/↓), R-1/R-2/R-3 (cross-ref на новый meshokPositioning блок и absolute positioning meshok ↓), R-025 (фон страницы зависит от page style mode, а не всегда surface/secondary), R-024 (placement заголовков секций внутри контейнера, к которому относятся — внутри острова в with-islands, в группе/content_body в flat). R-023, R-028 не тронуты — они foundational и не затронуты новой структурой. Все verify-*.sh пройдены. (R-021, R-027, A-030 удалены отдельным коммитом, см. запись про PR #197 выше.)

- feat: «Forbidden API patterns» таблица в Rule-driven контракте + новый CI verify-script `tools/verify-no-bad-apis.sh`. Таблица перечисляет конкретные wrong-API паттерны (`importComponentSetByKeyAsync` вместо `importComponentByKeyAsync`, `frame.resize(375, 812)` вместо `setBoundVariable`, `findOne` по имени вместо `getNodeByIdAsync`, registry-key вместо `.id` в `setProperties`) с правильными заменами и причиной. Скрипт grep'ит runtime-инструкции (`.claude/commands/**.md`, `rules/**.md` — кроме `.raw.json`) на запрещённые паттерны, с контекст-проверкой ±5 строк (если рядом ❌/Forbidden/Запрещено/«не используй» — допускается как контр-пример). Подключён в `.github/workflows/smoke-tests.yml` (оба trigger-list'а). Verify-trigger-completeness прошёл (10/10).

- feat: «Контекст брифа > isDefault» подсекция в Rule-driven контракте. Разделены два режима: (a) структурный тест без брифа → isDefault/sampleTexts (wireframe-результат); (b) полный билдер с CJM/брифом → контекстные значения (реальный текст «Профиль», правильный preferred под кейс — например, navbar @ Lenta вместо navbar 1.0 для Ленты, нужный variant size карточек по плотности экрана, нужные boolean'ы по флоу). isDefault — fallback только когда контекст молчит. В финальном макете не должно быть placeholder'ов И не должно быть sampleTexts типа «Title»/«Заголовок» из дефолтов rule.json.

- feat: «Rule-driven instantiation» контракт в `.claude/commands/builder.md` — формализован обязательный поток: Builder выявляет список компонентов из CJM → resolve slug через `registry/index.json` (единственный router) → читает только нужные `rules/components/<slug>.rule.json` (lazy, on-demand) → применяет slot'ы по `preferred[isDefault=true]`, variants по `default`/`builderRule`, booleans по `defaultOn`/`alwaysOn`, textProps по `sampleTexts[0]`/askDesigner. **Контракт РЕКУРСИВНЫЙ** — после каждого swap на новый preferred-инстанс Builder обязан открыть его rule.json (через `nestedProps.ruleRef`) и применить шаги повторно, до самого нижнего уровня (например, для meshok ↑: navbar slot → navbar 1.0 → middle slot → content component → text node). В итоге placeholder'ы НЕ остаются ни на одном уровне вложенности. Иллюстративный 3-уровневый пример для meshok ↑ → navbar 1.0 → middle text. Распространяется на ВСЕ компоненты. **Known limitation:** на момент мерджа контракт зафиксирован в доке, но рекурсивный helper в use_figma коде не написан — Builder делает только верхнеуровневые swap'ы, nested slots (navbar.middle и др.) остаются placeholder'ами. Tracked в `tests/issues/agents.md#A-058`.

- fix: token mapping для page style modes (финал после трёх итераций, валидирован на живом мокапе в Figma):
  - **flat** `pageFill = surface/secondary` — дефолтный «серый/тёплый» фон страницы
  - **with-islands** `pageFill = surface/primary` — белый/чистый базовый
  - **with-islands islands fill** = `surface/secondary` — приподнятый слой над белой страницей
  - Семантика: `surface/secondary` используется **дважды** (как fill flat-страницы либо островов в with-islands), `surface/primary` — только как page bg в with-islands.
  - Промежуточные коммиты по пути: `7664f9e` (swap → primary везде, потом «primary = base, secondary = elevated») и `d504dcf` (correction → flat вернулся на secondary). Эта строка отражает **финальное** состояние; промежуточные описания не актуальны.
  - Изменено в: `rules/skeleton.json#pageStyleModes`, `rules/skeleton.md` (R-025 + ASCII-схема Mode A/B), `.claude/commands/builder.md` (intent table, Mode A/B headers, island recipes).

- feat: `rules/skeleton.json` v4 + schema — добавлены два структурных блока: `meshokPositioning` (правила позиционирования меш о́ков: ↓ всегда absolute pinned bottom/left/right, ↑ по умолчанию in-flow первым ребёнком соответствующего контейнера, scroll-demo override на absolute pinned top) и `pageStyleModes` (два режима страницы — `flat` и `with-islands` — с полным content_body padding/gap spec'ом и island spec для with-islands: разделены firstIsland и subsequentIslands с разной геометрией углов и paddings). Variable references в новых блоках — по NAME (string), Builder резолвит name → figma-key на runtime через `registry/libraries/numbers-paddings/variables.json` (keys не зашиты в JSON — переменные часто обновляются). Литеральные нули — числовой `0`. Schema поддерживает обе формы через `oneOf [string, number]`. Schema version bumped 3 → 4 (backward-compat: новые блоки optional). Все verify-*.sh пройдены.

- feat: layout recipes в `builder.md` — page style modes (flat / with-islands) + двух-режимный content_body recipe + island recipe разделён на firstIsland (с встроенным meshok ↑, topRadii=0) и subsequentIslands (стандартные). Builder обязан спросить дизайнера mode БЕЗ default'а. Cells-list / cards-carousel / form recipe'ы остались как есть — они работают одинаково в обоих режимах, отличается только обёртка island. В каждом recipe явно прописана **FILL-цепочка для ширины** (от screen-width DS-переменной через page-frame), **HUG content для высоты** и **gap-переменная** по типу контента. Добавлена «карта gap'ов» (between-islands / between-cards / between-simple-cells / between-image-cells / between-bottom-buttons-cells) для выбора правильной переменной под кейс. `between-sections` и cell-view/default удалены из карты как устаревшие/внутренние (cell-view/default остаётся внутренним свойством cellList обёртки, не пользовательским выбором). Cards-carousel сделана через `primaryAxisSizingMode='FIXED'` + `layoutSizingHorizontal='FILL'` (контейнер = screen-width, контент скроллится горизонтально). Builder при сборке типовых блоков **применяет recipe целиком**, не «придумывает» структуру каждый раз — снижение галлюцинаций структуры и consistency между сессиями. R-022 (cells-list paddings + FILL для ячеек) мигрирует из `rules/skeleton.md` в builder.md как полный recipe; в skeleton.md секция удалена (ASCII-схема экрана продолжает упоминать «cellList-обёртку» как направление). Container-инфра (отдельная schema, layout tree артефакт, post-build gate) — зафиксирована как future work, plan в `/root/.claude/plans/federated-meandering-hopcroft.md` Appendix.

### /test
- refactor: рерайт `/test --full` без input-broker'а + фикс регресса `tests/scripts/static-metrics.js` + замкнутый pipeline `_session.auto_mode` для исключения synthetic-сессий из A-056 leaderboard (#238, альтернатива закрытому #226). Старый static-metrics грепал удалённые в Phase 4 `rules/components/*.md` → `rulesCoveragePct=0%` каждый прогон; переписан на `*.rule.json` + полная семантика guidance из CLAUDE.md (`whenToUse` OR `edgeCases` OR `slots[].preferred[].usage`). `/test --full` теперь явно принимает дрейф с `builder.md` (абзац «Принимаемый дрейф» с прямой ссылкой на #226 как anti-pattern маркер): adversarial-прогон не выигрывает от формальной сверки гейтов, объективные находки идут через визуальный ревью (Шаг 7.5), программный аудит `full-accuracy.figma.js` (Шаг 7.6) и аудит `_session.rule_contributions[]`/`builder_picks[]` (Шаг 7.7 — без registry, читает то что Builder пишет независимо). Quick режим почищен от `AskUserQuestion`-блока «что заметила» — feedback через `/fb`. Pipeline `auto_mode`: test.md Шаг 0.5 ставит `_session.auto_mode = true` → builder.md Шаг 8 эмитит в telemetry-issue JSON-блок → schema объявляет boolean → `tools/aggregate-sessions.py` helper `_exclude_auto_mode` фильтрует в `compute_leaderboard`, `compute_drift_summary`, `compute_rule_contributions_summary` (34 unit-теста). 4 пасса ревью пройдены (2 архитектурных + 3 code-review), из 17 находок 13 FIXED / 4 REFUTED. `--component` микротест не тронут — на нём держится `/parseProps`.

### Registry
- refactor: убрать `generatedAt` из `registry/index.json` — derived cache не несёт build-time даты. Заодно зачищен sed-fix из #156 (`verify-index-drift.sh`), который был временным лекарством симптома. Дата регенерации читается из git: `git log -1 --format=%cI registry/index.json`. Закрывает корневую причину CI-drift, симптом которой #156 закрывал костылём (#158)

### /builder
- fix: A-058 + A-059 готчи — slot prop names резолвить из rule-объекта через `slotKey`/`boolKey` helper'ы (с type-фильтром и throw на ambiguous), pairedBoolean флипать вместе со swap (#156)
- fix: leak audit — единый запрет-лист внутренних артефактов в репликах дизайнеру (пути к файлам, R-NNN/A-NNN, имена rule-полей, GitHub-labels, plugin-error-дампы, `_session.*`); фильтр scope-options по уровню доступа (#152, #153, #155)
- feat: `rules/skeleton.json` — машинный источник правды для baseline размеров мобильного фрейма; `rules/skeleton.md` R-028 цитирует JSON (#154)
- feat: `docs/BUILDER_GOTCHAS.md` — выделенный документ для готч импорта/setProperties (A-046, 053, 054, 057, 058, 059) + sandbox contract про inline-substitution JSON в plugin-коде; `builder.md` остаётся с 15-строчным индексом

### Инфраструктура
- fix(ci): `verify-index-drift.sh` игнорирует `generatedAt` timestamp при сравнении — раньше любой PR на следующий день после регенерации `registry/index.json` падал ложным drift'ом из-за смены даты, не из-за контента (всплыло на смок-смерти #156)

### Агенты
- feat: три internal-стадии `/builder` оформлены как полноценные Claude Code sub-agents в `.claude/agents/` — `text-layout` (G-I1, yellow), `json-layout` (G-I2, cyan), `figma-implementer` (G-I3, pink). Дополнительно добавлен sub-agent `debugger` (orange) из примеров спеки https://code.claude.com/docs/en/sub-agents. Frontmatter всех agents выровнен по таблице «Supported frontmatter fields»: `name` / `description` / `tools` / `model` / `effort` / `color` / `skills`. `figma-implementer` получил `skills: [figma-use]` — автоматический pre-load обязательного гайда (issue #325) теперь гарантирован спецификацией, не зависит от ручного напоминания внутри сессии. `text-layout` / `json-layout` ограничены read-only tools (Read/Glob/Grep) — страховка от случайной записи в Figma из internal-стадии. Source-of-truth контракты остались в `src/agents/<role>/<ROLE>_AGENT.md`, sub-agent файлы — тонкие обёртки без дублирования правил. Параллельно `docs/AGENT_ROLES.md` переписан: разделены диалоговые роли в main conversation (Research, Builder-оркестратор) и internal-стадии. Stale упоминания «апрув лейаут» / «апрув JSON» между internal-стадиями убраны — G-V (visible) apruv'ы остались только для CJM / final layout / чек-листа. PR #341.
- feat(agents): `code-reviewer` и `debugger` переведены на `model: opus` + `effort: high` — для DS-ревью и root cause analysis нужна максимально капабильная модель. `text-layout` / `json-layout` / `figma-implementer` получили `effort: high` при `model: inherit` (модель internal-стадий должна совпадать с main session, а уровень внимания — выкручен). Это меняет стоимость каждого review/debug/build-сессии — учитываем при бюджетировании.
- feat: extensions `/builder` Шаг 4 и CJM Шаг 5 оформлены как Claude Code sub-agents: `analytics` (green) / `product` (purple) / `experience` (blue, с WebSearch/WebFetch) / `cjm` (yellow, повтор c text-layout по семантике «иерархия плана»). `analytics`/`product`/`experience` — толстые (полная инструкция в body, source-of-truth там же); `cjm` — фасад со ссылкой на секцию «Шаг 5 — CJM» в `.claude/commands/builder.md`. `model: inherit` + `effort: high`. CJM-агент **строит** маршрут — апрув («апрув CJM», G-V3) остаётся в main conversation у Builder'а, sub-agent апрува не запрашивает. `experience` получил `tools: WebSearch, WebFetch, Read, Glob, Grep` + domain-allowlist для WebFetch в body (Medium, Nielsen Norman, UX Collective, Smashing, Figma blog, Mobbin, Baymard, блоги продуктовых команд) — защита от шумных источников.
- breaking: удалены `.claude/commands/extensions/{analytics,product,experience}.md` (и пустой каталог). Эти три скилла теперь живут **только** как sub-agents в `.claude/agents/`. Builder Шаг 3 эскалация и Шаг 4 переписаны под `Agent` tool с `subagent_type: analytics`/`product`/`experience` вместо «открой `.claude/commands/extensions/<name>.md`». Внешне для дизайнера — без изменений: реплика про экспертов та же.

---

## [Unreleased — 2026-05-18]

### Агенты
- feat(/builder): designer feedback batch — agent escalation, scope gate, state frames, builder-error watchpoint (#149)

### Компоненты
- fix: /test и /verifier — миграция на новый registry/rule формат (#148)
- refactor: rules → source of truth, registry/index.json as derived cache (#143)

### Изменено
- parseProps: Batch 7 — 8 approvals (iconglyph, badge, tabbars, tabsview, push) (#150)

### Исправлено
- fix(/builder): чек-лист Шага 7 → явный gate с содержимым экранов по слотам скелета (#151)


## [Unreleased — 2026-05-17]

### Агенты
- docs: AGENT_PORTABILITY.md + переписать README под текущее состояние

### Компоненты
- fix(registry): header 1.1 — set-key → variant-key (#142, #132)

### Добавлено
- feat(#126): gap-family sync-check between custom-contentsview and docs (#130)
- feat(#125): Inv11 — sibling-trio consistency check (#129)

### Изменено
- docs: чистка тупых багов для дизайнера + /feedback → /fb (#139)
- parseProps: Batch 6 — contentsView×14 + badgeView×4 + tagsView×3 (21 approvals) (#135)
- parseProps: Batch 5 — content × 33 + custom-contentsview + gap family docs (34 approvals) (#124)
- autoFixTech: новый скилл + scope-док + интеграция autoMerge (PR-B для #103) (#123)
- fbAnalyzer: классификация на typo / technical / architect (PR-A для #103) (#122)
- builder: жёсткое покрытие состояний + словесный чек-лист построения (#121)
- parseProps: Batch 4 — tags + chipChoice + media (5 approvals) (#118)
- tests: разделить _record() на minimal и full пресеты (#117)
- tests: упростить _record() фабрику через {**defaults, **kwargs} (#116)
- fbAnalyzer: drift metric для baseline_source в digest (#115)
- ci: regression-guard на удаление шагов из smoke-tests workflow (#114)
- personal-thanks: unittest для aggregate-sessions + other bucket (#112)
- personal-thanks: вынести шаблоны в docs, добавить телеметрию покрытия (#111)
- builder: персональный счётчик фидбэков в финале Шага 8 (#110)
- parseProps: Batch 3 — toast family + indicator + avatarsView (#108)

### Исправлено
- fix(#127): clarify style=primaryOnColor/custom runtime rule in custom-contentsview (#128)


## [Unreleased — 2026-05-16]

### Агенты
- feat(reshala): Phase 5 — auto-fix agent + scheduled auto-merge

### Добавлено
- feat(metrics): group F — reshala/autoMerge → tests/metrics.jsonl (#73)
- feat(telegram): group D — truncate + aggregated P0/P1 + smoke-test (#77, #78, #79)
- feat(aggregate): group E — REST pagination + in-run collision metric (#81, #82)
- feat(aggregate): Phase 7 — workflow для агрегации session-telemetry
- feat(telegram): Phase 6 — мгновенные нотификации в Telegram
- feat(telemetry): designer feedback + auto-bugs + triage (phases 1-4)

### Изменено
- docs+verify: канонический список Настя-only скиллов + drift-checker (#96)
- ci: actionlint для GitHub workflows (#86)
- security: identity-check для мутирующего /changelog (#95)
- refactor(reshala): group C — RESHALA_SCOPE.md + structured block + triage:digest (#70, #72, #74, #75)
- docs(CLAUDE.md): group B — add /fbAnalyzer, /reshala, /autoMerge to Настя-only (#69)
- docs: group G — extract routines setup to docs/ROUTINES.md (#84)
- docs: group A — auto-bug.md template + labels.yml header (#67, #68)
- docs: decouple cron/schedule from docs — единственный источник правды в Routines UI

### Исправлено
- fix(workflows): sync-labels checkout permission + aggregate-sessions conditional add


## [Unreleased — 2026-05-15]

### Компоненты
- Phase 4: delete legacy .md rules, update docs to .rule.json format
- parseProps: Builder-priority approvals — uniCard family, header, atoms batch (#56)

### Добавлено
- feat: designer access workflow + Котик-Ботик rebrand + identity-check via GitHub username (#58)

### Изменено
- parseProps: approve 13 atoms (Batch 1+2) + backfill missing variants

### Исправлено
- fix(builder): strengthen Step 6→7 transition to prevent skipped Figma step (#63)


## [Unreleased — 2026-05-14]

### Изменено
- parseProps A6+A7 review round 2: fleet-wide canonical broken names + Inv10
- parseProps A6+A7 review fixes: name consistency + schema conditional + ARCHITECTURE useDefault docs
- parseProps A6 + A7: nestedInstances schema + name resolution
- parseProps review follow-up: update omit rule + clarify policy default
- parseProps Phase A: isDefault cleanup + alwaysOn whenOn/whenOff + nestedProps.ruleRef backfill + Inv9
- parseProps: approve custom ◇ price (Batch 1, 6/15)
- parseProps: approve counterInline 1.0 (Batch 1, 5/15) — clarify text-style edgeCase: only DS styles
- parseProps: approve chipSuggestPrimary (Batch 1, 4/15)
- parseProps: approve chipSuggestCustom (Batch 1, 3/15)
- parseProps: approve buttonScroll 1.0 (Batch 1, 2/15) — direction default=right ->
- parseProps: approve alphabetic-keyboard (Batch 1, 1/15)
- parseProps: add backfill-rulerefs.js script
- parseProps: technical normalization for preferred entries
- parseProps: батчи 6+7+8 — 46 правил, 100% покрытие реестра (#53)
- parseProps review fixes: checkbox.interactArea alwaysOn + header edgeCases
- parseProps Batch 8: 27 оставшихся компонентов (atoms/views/composite)
- parseProps Batch 7: controls (2) + buttons (3) + tabs (2) + headers (3) + keyboards (2)
- parseProps Batch 6: price family (4) + indicators (2) + counterInline


## [Unreleased — 2026-05-13]

### Архитектура — parseProps

- fix(parseProps): закрыт «preferred validation gap» — `apply-figma.js` больше не пишет `validated:false` без `name`; `hypothesize.js` спрашивает usage для любых non-broken preferred без usage (раньше требовал `validated:true` — entries застревали навсегда) (#45)
- feat(parseProps-hypothesize): новые kind'ы — `preferredDefault` (выбор isDefault для слота с ≥2 validated) и `preferredRuleRef` (выбор nestedProps.ruleRef) (#45)
- feat(parseProps-preflight): `notInRegistry` теперь recoverable (`needsRegistry`), не abort'ит pipeline (#45)
- feat(parseProps-utils): новая CLI `add-registry-entry <name> <lib> <key> <type>` — патчит `registry/index.json` + `libraries/<lib>/components.json` (#45)
- feat(parseProps-apply-figma): добавляет unpaired INSTANCE_SWAP slots из inspected-props; auto nestedProps.ruleRef при совпадении slug с существующим `.rule.json` (#45)
- feat(schema): `nestedProps` допускает `null` — явный маркер «нет nested props, не спрашивать снова» (отличается от omitted = «ещё не спрашивали») (#45)

### Компоненты

- feat(parseProps): `meshok-up.rule.json` — 4 slots (navbar, tabs, search, float) + 4 booleans, все preferred с validated+usage+isDefault+ruleRef (#45)
- feat(parseProps): forward-refs `navbar-lenta`, `base-tabsview`, `oblakosecondary-tabsview`, `floattonavbar-buttonsview` (#45)
- `validate --all`: 17/17 valid, 0 inv3 warnings (#45)

---

## [Unreleased — 2026-05-12]

### Архитектура — parseProps миграция
- feat(parseProps): Phase 0 — `rules/schema/component-rule.schema.json` + Phase 0 пилот `meshok-down.rule.json` (#37)
- refactor(parseProps): Phase 1 — переименование `heal-*.js` → `parseProps-*.js` (#38)
- feat(parseProps): Phase 2 — миграция 12 компонентов на формат `<slug>.rule.json` + `<slug>.raw.json` через `_migrate-to-rule-json.js`; добавлены недостающие записи `toast 1.0` и `buttonsViewBottom 1.0 ❖ view` в `registry/index.json`; `validate --all` 13/13 (#39)

### Скиллы
- feat(/about): полный рерайт под лида — описание Builder'а, цели спринта с человеческими формулировками, метрики из реестра и `tests/metrics.jsonl` (#35)
- feat(/about): динамика по последним 10 прогонам `/test --full` — медианы первой и второй половин окна для сглаживания шума, расшифровка каждой метрики (#35)
- feat(/about): инвентарь всех скиллов и агентов с описаниями для новых участников (#33, #35)
- feat(/about): метрики проекта — библиотеки, компоненты, sync-дата, число скиллов/агентов/правил (#34)
- docs(README): структура проекта приведена к фактическому состоянию — `agents/` вместо `src/agents/`, добавлены `/parseProps` и `/verifier` (#33)

### Агенты
- feat(builder): fixes toast 1.0 / buttonsViewBottom / chipsView / tabsView + R-041 (systemComponent always-on swap)
- feat(/parseProps): переименован из `/heal`; batch диагностики и автопочинки с microtest, autoPairs, patch (#27–#31)
- feat(/verifier): новый скилл — антигаллюцинационная сверка утверждений с файлами в трёх точках (старт / checkpoint / финал) (#26)

### Документация
- docs(SPRINT): план спринта 11.05–25.05 — стабильная Figma-генерация (неделя 1) + React-плейграунд ДС (неделя 2) (#26)

---

## [Unreleased — 2026-05-11]

### Компоненты
- test: finalize /test --component (rename from --micro) + heal-parse-result helper (#31)

### Изменено
- heal v2: /test --micro + pair-aware + mutability + switch 1.0 first approved (#30)
- heal: classify + patch + first 4 pilots end-to-end (real Figma MCP) (#29)
- heal: add microtest codegen + wire into heal.md (#28)
- heal: skill spec + _index.json schema + local preflight (#27)
- sprint 11.05–25.05: stable generation → DS playground + heal + verifier (#26)

### Исправлено
- fix(issues): remove duplicate sentence in A-042 (nit from code review)
- fix(metrics): rewrite test 16 row to post-#25 schema; update A-042/A-043


## [Unreleased — 2026-05-09]

### Компоненты
- docs: uniCard rewrite + anti-hallucination gate (#23)

### Изменено
- Refine auth flow: explicit levels, refusal-first, anti-evasion (#22)
- Audit fixes (security, error handling, token slim) + 2 full test runs (#21)
- Resolve R-021..R-027 + validate via test 9 (medium e-commerce) (#20)
- Log 7 new doc-gap bugs from designer review + escalate all R-* to blockers (#19)
- Builder run #8 (test 8): medium e-commerce — 8 screens (#18)
- Resolve all blockers + high-priority issues (7 closed in one pass) (#17)
- Builder run #7 (test 7): Chat+Profile exposes A-027 deep-nested gap (#16)


## [Unreleased — 2026-05-08]

### Агенты
- fix(syncKeys): A-001 safe-mode для либ без секций Actual — реестр больше не сносится при отсутствии Actual
- fix(component-agent): `◇` отсекается только если первый символ имени; больше не теряются `counter ◇ indicator`, `primary ◇ tag` и др.
- fix(component-agent): INSTANCE-узлы больше не парсятся как компоненты — глифы и `placeholder` не регистрируются ложно по каждой странице
- fix(syncKeys): A-015 — расширен фильтр standalone-клонов вариантов (`=` вместо `=` AND `,`)

### Компоненты
- chore: sync component registry from Figma — 153 компонента (was 99): 79 added, 63 keys replaced, 30 removed
  - base-components: 103 (was 70), buttons-tabs-chips: 22 (was 15), sheets-modules-wrappers: 6, cards-cells-views: 5, inputs-search: 3, system: 14 (was 2)
- chore: index.json + meta.json (`keysHash`) перегенерированы для всех 6 либ

### Добавлено
- feat(journal): daily git-log bot — `.github/workflows/journal.yml`, хранит сегодня + вчера, режет позавчера
- feat(journal): split commits by author (team vs Claude) на main

### Изменено
- docs(CLAUDE): MCP-only путь зафиксирован явно — Plugin API доступен только через `use_figma`, REST не используется
- docs(CLAUDE): убран `variants.json` — для сетов используется `setProperties()` после импорта дефолтного варианта
- docs(README): убраны устаревшие `npm run agent:*` и `figmaToken` из примера config; структура проекта приведена в соответствие с MCP-only

### Исправлено
- tests/issues/agents.md: A-001/A-002/A-008/A-009/A-012/A-013/A-014/A-015/A-016 закрыты, добавлен A-017 (perf-батчинг страниц)


## [Unreleased — 2026-05-07]

### Агенты
- feat(syncKeys): split into orchestrator + Library/Component agents
- refactor(syncKeys): switch from REST to MCP, drop legacy catalog agents
- perf(builder): cut token cost across the whole pipeline

### Компоненты
- perf(registry): compact index.json + defaultVariantKey for sets
- feat(registry): record assetType so importer picks correct API

### Добавлено
- feat: add Figma Implementer spec, frame skeleton gate in builder

### Изменено
- test: /syncKeys attempt 2026-05-07 — confirmed blockers
- test: first /test run, add O-005 + extend R-005
- test: add /test skill with metrics, issue journals, baseline snapshot
- docs(syncKeys): switch skill to reconcile-flow with Actual sections

### Исправлено
- fix(syncKeys): variantKeys в отдельный файл, lean plugin, =-фильтр
- fix(syncKeys): refactor under MCP constraints


## [Unreleased — 2026-05-06]

### Добавлено
- **README.md** — документация проекта: быстрый старт, схема пайплайна, структура папок, описание скиллов и прав доступа
- **Скилл `/connectFigmaMCP`** — проверяет подключение к Figma перед генерацией макета; если нет — ведёт дизайнера по шагам до успеха (Remote MCP или API-токен)
- **Скилл `/syncKeys`** — запускает `agent:libraries` + `agent:components`, коммитит обновлённый реестр
- **Автообновление CHANGELOG** через GitHub Actions cron; без Claude API — чистый Python-парсинг git log

### Изменено
- **`rules.md`** — добавлен раздел «Библиотеки»: таблица с fileKey, названием и перечнем компонентов для каждой из 6 библиотек ДС
- **`CLAUDE.md`** — добавлен обязательный шаг `/connectFigmaMCP` перед каждой генерацией макета
- **`agent:libraries`** — инкрементальные обновления по `lastModified`; тихий режим по умолчанию (`--verbose` для деталей)
- **`agent:components`** — инкрементальные обновления: пропускает библиотеки без изменений; флаги `--verbose` и `--force`

---

## [1.0.0] — 2026-05-06

Первый стабильный релиз. Проект умеет:

### Что умеет проект

**Реестр дизайн-системы**
- Каталог 6 библиотек Figma: `buttons-tabs-chips`, `cards-cells-views`, `inputs-search`, `base-components`, `system`, `sheets-modules-wrappers`
- Для каждой библиотеки — список компонентов с `componentKey`, вариантами, пропами и платформами
- Библиотека переменных `numbers-paddings` — отступы, размеры экранов, радиусы для Android / iOS / Mob / Web

**Правила дизайн-системы (`rules.md`)**
- `meshok ↑` — шапка экрана: navbar, поиск, табы, float; все своп-слоты смаплены на реальные компоненты ДС
- `meshok ↓` — низ экрана: таббар, хэндл, клавиатура, кнопки; правила: всегда присутствует, кнопки только через buttonsView
- `button 1.1` — 7 стилей, 4 размера, правила иерархии (один primary на экране)
- `header 1.1` — 4 уровня заголовков, пропы subtitle / counter / tag
- `uniCell 1.0` — универсальная ячейка: левый / средний / правый / нижний слоты, все компоненты смаплены
- `uniCard` — 5 размеров (320 / 220 / 160 / custom / accent): imageContent, text, bottom, buttons
- Шаблоны пропов: `bottom-slot`, `buttons-slot`, `onScroll-boolean`, `card-image-content`, `card-text-content`

**Пайплайн агентов (5 шагов)**
1. **Research Agent** — задаёт 4 вопроса (метрики, аудитория, бэкенд, консистентность), анализирует референсы, извлекает принципы
2. **Text Layout Agent** — формирует текстовый нумерованный лейаут экранов
3. **JSON Layout Agent** — превращает лейаут в JSON-дерево: контейнеры, ячейки, карточки, отступы только из переменных Tokens
4. **Builder Agent** — оркестратор; читает реестр + rules.md, проверяет MCP, ведёт дизайнера по шагам
5. **Figma Implementer** — создаёт фреймы в Figma через MCP с реальными инстансами компонентов ДС

**Инфраструктура**
- Идентификация пользователя в `CLAUDE.md`: полный доступ для Насти, режим Builder-only для остальных
- Скилл `/changelog` — обновляет этот файл после каждого релиза
- Онбординг через zip + Claude Code: дизайнер открывает папку и сразу работает

### Агенты

- Research Agent (`src/agents/research/RESEARCH_AGENT.md`) ✅
- Text Layout Agent (`src/agents/text-layout/TEXT_LAYOUT_AGENT.md`) ✅
- JSON Layout Agent (`src/agents/json-layout/JSON_LAYOUT_AGENT.md`) ✅
- Builder Agent / оркестратор (`src/agents/builder/BUILDER_AGENT.md`) ✅
- Figma Implementer (`src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md`) 🔜 в разработке

---

## [0.3.0] — 2026-05-06

### Добавлено
- **JSON Layout Agent** (`src/agents/json-layout/JSON_LAYOUT_AGENT.md`) — превращает текстовый лейаут в JSON-дерево для Figma Implementer
- **Библиотека `numbers-paddings`** в реестре (`registry/libraries/numbers-paddings/variables.json`) — переменные отступов, размеров экрана и радиусов
- Правила gap-декремента (cp-16 → cp-12 → cp-8 → cp-4 → cp-0 на каждый уровень вложенности)
- Запрет хардкодных значений отступов в агентах — только через переменные Tokens

### Изменено
- **Builder Agent** стал оркестратором полного пайплайна: Research → Text Layout → JSON Layout → Builder → Figma Implementer
- Таблица агентов в `BUILDER_AGENT.md` обновлена — JSON Layout Agent добавлен со статусом ✅ готов

---

## [0.2.0] — 2026-05-05

### Добавлено
- **Research Agent** (`src/agents/research/RESEARCH_AGENT.md`) — анализирует референсы дизайнера, задаёт 4 обязательных вопроса перед началом (метрики, аудитория, ограничения бэкенда, консистентность)
- **Text Layout Agent** (`src/agents/text-layout/TEXT_LAYOUT_AGENT.md`) — формирует текстовый нумерованный лейаут экранов
- Поле `contextQuestions` в выходном JSON Research Agent

### Компоненты в `rules.md`
- **`meshok ↑`** — полное описание пропов: navbar, onScroll, tabs, search, float; своп-слоты смаплены на реальные компоненты ДС
- **`uniCell 1.0`** — все слоты: left (iconGlyph / avaPicture), middle (content), right, bottom, buttons; все компоненты смаплены с ключами
- **`uniCard`** — 5 размеров (320 / 220 / 160 / custom / 160 accent); пропы height, backgroundColor, imageContent, text, bottom, buttons
- Новые шаблоны пропов: `bottom-slot`, `buttons-slot`, `onScroll-boolean`
- Новые своп-слоты: `card-image-content` (media 1.1), `card-text-content` (15b-13-13 · contentsView)

---

## [0.1.0] — 2026-04-28

### Добавлено
- Первоначальная структура проекта: `registry/`, `src/agents/`, `rules.md`, `CLAUDE.md`
- **Builder Agent** (`src/agents/builder/BUILDER_AGENT.md`) — базовый оркестратор
- Реестр библиотек: `buttons-tabs-chips`, `cards-cells-views`, `inputs-search`, `base-components`, `system`, `sheets-modules-wrappers`
- Правила `button 1.1`, `header 1.1`, `meshok ↓` в `rules.md`
- Переменные отступов и размеров Device Presets (Android / iOS / Mob / Web)
- Идентификация пользователя в `CLAUDE.md` (проверка «Ты Настя?», разграничение прав)
- Шаблон `config.example.json` для хранения токенов

---

## Легенда разделов

| Раздел | Что означает |
|---|---|
| **Добавлено** | Новые агенты, компоненты, правила, файлы |
| **Изменено** | Обновления существующего поведения |
| **Исправлено** | Баги и некорректные данные в реестре |
| **Удалено** | Выведенное из использования |
| **Агенты** | Изменения в pipeline и ролях агентов |
| **Компоненты** | Новые или обновлённые записи в `rules.md` и `registry/` |
