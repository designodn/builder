# Fixture: known-bad designer-reply шаблон для verify-no-gate-leak self-test

Этот файл НЕ runtime-инструкция. Live в `tests/fixtures/gate-leak-bad-commands/`,
не в `.claude/commands/`. Используется `tests/smoke-gate-leak.sh` для проверки,
что `verify-no-gate-leak.sh` реально ловит leak'и.

Если guard сломается (например regex regression) — этот fixture перестанет
вызывать FAIL, и smoke упадёт. Это meta-protection.

---

## Намеренно-плохие шаблоны реплик дизайнеру

Каждый блок ниже содержит хотя бы один forbidden token. Все они находятся
внутри `> ...` quote-блоков, имитирующих designer-reply шаблоны.

> «CJM апрувнут, иду к Шагу 6. G-V3 PASS зафиксирован.»

> _Покрытие состояний определено — G-V4 PASS, сохранил в gates_passed[]._

> "FAIL-2: не вижу апрува, переспрашиваю по протоколу."

> *Запустила Text Layout, _session.text_layout[] заполнен корректно.*
