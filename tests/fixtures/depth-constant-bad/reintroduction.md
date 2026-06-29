# Fixture for smoke-depth-constant (known-bad)

Этот файл — известная-плохая fixture для meta-test'а
`tests/smoke-depth-constant.sh`. Имитирует ситуацию, когда кто-то
случайно вписал `RULE_TREE_MAX_DEPTH = 10` обратно в код или прозу
после миграции в `rules/builder-constants.json`.

В реальной жизни такая строка нарушает single-source-of-truth контракт.
`tools/verify-depth-constant.sh` должен вернуть exit 1.

В коде это могло бы выглядеть как:

```js
const RULE_TREE_MAX_DEPTH = 10;
```

Или в прозе: «depth ≤ RULE_TREE_MAX_DEPTH = 10».
