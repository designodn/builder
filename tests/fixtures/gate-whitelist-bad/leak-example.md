# Fixture for smoke-gate-whitelist (known-bad)

Этот файл — известная-плохая fixture для meta-test'а
`tests/smoke-gate-whitelist.sh`. Здесь упомянут gate-ID `G-X-fake`,
которого нет в enum schema. `verify-gate-whitelist.sh` обязан
завершиться с exit 1 при сканировании этого каталога.

Запись в _session.gates_passed[]: `{ id: "G-X-fake", status: "PASS" }`.

Также упоминаем валидные коды для уверенности, что smoke ловит именно
fake: `G-V1`, `G-I3`. Они должны проходить, а `G-X-fake` — нет.
