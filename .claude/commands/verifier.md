# /verifier — агент-верификатор

Не самостоятельный скилл, а **обязательная процедура** для длинных задач (`/test --full`, `/parseSweep`, `/syncKeys`, массовая генерация правил). Снижает галлюцинации, заставляя агента сверять каждое утверждение с файлом, а не с памятью.

## Когда вызывается

Хост-скилл вызывает верификатор в трёх точках:

1. **Стартовый снимок** — перед началом работы.
2. **Checkpoint** — каждые ~10 операций (компонентов, файлов, итераций).
3. **Финальный отчёт** — все цифры в отчёте берутся из верификатора, не из памяти.

Между этими точками хост-скилл работает как обычно.

## Принципы

1. **Не доверяй памяти.** Если в твоём ответе появляется число, имя файла или статус — оно должно быть прочитано из файла **в этом же ходу**.
2. **Один источник истины на факт.** Один файл = один тип данных:
   - `tests/heal-log.jsonl` — статистика heal/parseProps (verdicts)
   - `tests/metrics.jsonl` — метрики качества
   - `tests/health-baseline.json` — baseline T-0
   - `registry/index.json` — derived cache `{name → [lib, key, type, tier, approved]}`
   - `rules/components/<slug>.rule.json` — source of truth для деталей компонента (variants, slots, booleans, doc, approved, tier, deprecated)
   - `tests/scripts/inspected-props.json` — пропы и preferred values (Figma raw)
3. **После каждого Edit/Write — Read.** Прочитай целевой файл, найди вставленную строку. Не нашёл — патч не применился, не отчитывайся об успехе.

## Процедуры

### V-START — Стартовый снимок

Прочитай ground-truth файлы и выпиши числа явно в текст хоста:

```bash
echo "## Стартовый снимок $(date -Iseconds)"
echo "metrics.jsonl: $(wc -l < tests/metrics.jsonl) строк"
echo "heal-log.jsonl: $(wc -l < tests/heal-log.jsonl 2>/dev/null || echo 0) строк"
echo "components: $(jq '.components | length' registry/index.json)"
echo "approved: $(jq '[.components[] | select(.[4] == true)] | length' registry/index.json)"
```

Запиши результат в начало хост-отчёта. Дальше эти числа — baseline для всех дельт.

### V-CHECKPOINT — Сверка каждые 10 операций

После каждой 10-й операции (компонент в /parseSweep, экран в /test --full):

```bash
# счётчики из файлов, не из памяти
fixed=$(grep -c '"verdict":"fixed"' tests/heal-log.jsonl 2>/dev/null || echo 0)
stuck=$(grep -c '"verdict":"stuck"' tests/heal-log.jsonl 2>/dev/null || echo 0)
needs=$(grep -c '"verdict":"needs_human"' tests/heal-log.jsonl 2>/dev/null || echo 0)
echo "checkpoint: fixed=$fixed stuck=$stuck needs_human=$needs"
```

**Если** хост-скилл «помнит» цифры, расходящиеся с реальными более чем на 2 — **стоп**, вывести таблицу расхождений Насте.

### V-AFTER-EDIT — Верификация одного патча

После каждого `Edit`/`Write`:

```bash
# должно вернуть ≥ 1
grep -c "<ожидаемая строка>" <путь к файлу>
```

Если 0 — патч не записался. Не отчитывайся об успехе, перезапусти Edit или пометь как `stuck`.

### V-FINAL — Финальный отчёт

Все цифры в итоговом отчёте — `wc -l`, `grep -c`, `jq` по соответствующим файлам, выполненные **прямо перед** выводом отчёта. Не использовать счётчики, накопленные в памяти.

Шаблон:

```
## Финал · $(date -Iseconds)

Сверка с файлами:
- heal-log: $(wc -l < tests/heal-log.jsonl) записей (было: <V-START число>)
- fixed: $(grep -c '"verdict":"fixed"' tests/heal-log.jsonl)
- approved: $(jq '[.components[] | select(.[4] == true)] | length' registry/index.json)
- metrics: последняя строка $(tail -1 tests/metrics.jsonl | jq -r '.ts')
```

## Анти-паттерны (нельзя так)

- ❌ «Я исправил 47 компонентов» — без `grep -c` прямо сейчас.
- ❌ «Патч применён» — без Read целевого файла.
- ❌ «Preferred value есть в реестре» — без Read `inspected-props.json` в этом ходу.
- ❌ «metrics.jsonl улучшился» — без чтения последних двух строк.
- ❌ Накопительные счётчики «итого за сессию» в памяти агента — только из файла.

## Watchdog

Если за 3 V-CHECKPOINT подряд хост-скилл показывает расхождение с файлами > 20% — он остановлен, в `tests/verifier-alerts.jsonl` пишется запись:

```json
{"ts":"...","host":"/parseSweep","claimed":{"fixed":50},"actual":{"fixed":32},"action":"halt"}
```
