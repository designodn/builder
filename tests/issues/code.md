# Issues — Code

Баги, type-ошибки, мёртвый код, синтаксические проблемы. Префикс `C-NNN`.

## Открытые

### [ ] C-001 · `agents/builder/src/index.ts` не компилируется

В JSDoc-комменте у файла строка `registry/libraries/*/components.json` — `*/` закрывает блок-коммент, дальше TS видит код как голый текст. `tsc` рушится с ~30 ошибками TS1109/TS1005. Скрипт `npm run agent:build` запустится только потому, что `ts-node` иногда транспилирует мягче, но build падает.

**Где:** `agents/builder/src/index.ts:4`
**Лечение:** заменить `registry/libraries/*/components.json` на `registry/libraries/<lib>/components.json` или `registry/libraries/[lib]/components.json` в комментарии.

---

### [ ] C-002 · `.claude/commands/changelog.md` ссылается на удалённое

Упоминания `agents/component-catalog/`, `agents/library-catalog/`, npm-скриптов `agent:libraries` / `agent:components`. Они снесены в коммите `bc956bf…` (переход на MCP), журнал не обновлён.

**Лечение:** перечитать `changelog.md`, выкинуть устаревшие пункты, добавить запись про MCP-флоу.

---

### [ ] C-003 · `docs/REGISTRY_PIPELINE.md` описывает несуществующий пайплайн

Документ подробно расписывает `npm run agent:libraries` → `agent:components` → REST API → `registry/`. После перехода на MCP это всё неактуально.

**Лечение:** переписать под `/syncKeys` через MCP, оставить раздел «как было» в архивной заметке если нужно.

---

## Закрытые

_(пусто)_
