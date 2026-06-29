#!/bin/bash
# verify-placeholder-sync: guardrail против дрейфа placeholder-набора между
# R-049 (канон) и Inv 4 (зеркало). См. #319.
#
# Два enforcement-пути проверяют «usage непуст при approved:true» одним и тем же
# набором плейсхолдеров. Они ОБЯЗАНЫ совпадать байт-в-байт:
#   - tools/verify-approved-gate.sh       → PLACEHOLDER_VALUES = {...}   (Python, КАНОН)
#   - tests/scripts/parseProps-utils.js   → USAGE_PLACEHOLDERS = new Set([...]) (Inv 4, зеркало)
#
# До этого guard'а синхронность держалась только на комментарии «синхронь там».
# Если кто-то поменяет набор в одном файле — CI оставался зелёным, дрейф ловился
# только глазами ревьювера. Теперь — машинно.
#
# Подход: всё чтение и сравнение — в одном Node-процессе (UTF-8 детерминированно,
# без влияния locale). Критично для Unicode-тире: em-dash, en-dash и hyphen
# визуально путаются. Сравнение идёт по нормализованным (NFC) кодпойнтам,
# диагностика печатает \uXXXX-форму.
#
# Fail-closed: если литерал переименован/переформатирован и regex не сматчился —
# exit 2 (а НЕ молчаливый pass на «пустых» наборах).
#
# Usage: bash tools/verify-placeholder-sync.sh [approved-gate.sh] [parseProps-utils.js]
# Exit: 0 — наборы совпадают. 1 — дрейф. 2 — файл не найден / литерал не извлечён.

set -euo pipefail
cd "$(dirname "$0")/.."

GATE="${1:-tools/verify-approved-gate.sh}"
UTILS="${2:-tests/scripts/parseProps-utils.js}"

if [ ! -f "$GATE" ];  then echo "verify-placeholder-sync: $GATE не найден"  >&2; exit 2; fi
if [ ! -f "$UTILS" ]; then echo "verify-placeholder-sync: $UTILS не найден" >&2; exit 2; fi

node - "$GATE" "$UTILS" <<'NODEEOF'
const fs = require('fs');
const [gatePath, utilsPath] = process.argv.slice(2);

// Канонизация: NFC -> массив строк, не-ASCII символы экранируются в \uXXXX,
// затем сортировка. Так em-dash и en-dash дают РАЗНЫЕ строки и видны в diff.
function canon(arr) {
  return arr
    .map(s => s.normalize('NFC'))
    .map(s => '"' + Array.from(s).map(ch => {
      const cp = ch.codePointAt(0);
      return cp < 0x80 ? ch : '\\u' + cp.toString(16).padStart(4, '0');
    }).join('') + '"')
    .sort();
}

// Раскрытие escape-последовательностей: со стороны Python-гейта (двойные кавычки)
// значение с кавычкой внутри придёт как a\"b, со стороны JS-utils (одинарные) —
// как a"b. Без unescape это дало бы ложный дрейф на логически идентичных строках.
function unescape(s) {
  return s.replace(/\\(["'\\])/g, '$1');
}

// Достаёт строковые литералы (одинарные/двойные кавычки) из тела набора.
function parseStringLiterals(body) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push(unescape(m[1] !== undefined ? m[1] : m[2]));
  }
  return out;
}

// Левая граница (?<![A-Za-z0-9_]) — чтобы X_PLACEHOLDER_VALUES / суффиксное имя
// не сматчилось вместо настоящего определения.
//
// Ограничение regex-подхода: тело набора захватывается до первой `}` / `]`
// (`[^}]*` / `[^\]]*`). Набор НЕ должен содержать символов `}`, `]` или кавычек
// внутри значений — иначе захват/сравнение сломаются. Текущий набор
// {'', 'TODO', '—', '–', '-'} этому удовлетворяет.

// R-049: PLACEHOLDER_VALUES = { ... }
function extractGate(text) {
  const m = text.match(/(?<![A-Za-z0-9_])PLACEHOLDER_VALUES\s*=\s*\{([^}]*)\}/);
  return m ? parseStringLiterals(m[1]) : null;
}

// Inv 4: USAGE_PLACEHOLDERS = new Set([ ... ])
function extractUtils(text) {
  const m = text.match(/(?<![A-Za-z0-9_])USAGE_PLACEHOLDERS\s*=\s*new Set\(\[([^\]]*)\]\)/);
  return m ? parseStringLiterals(m[1]) : null;
}

const gateSet  = extractGate(fs.readFileSync(gatePath, 'utf8'));
const utilsSet = extractUtils(fs.readFileSync(utilsPath, 'utf8'));

if (gateSet === null) {
  console.error(`verify-placeholder-sync: не нашёл PLACEHOLDER_VALUES = {...} в ${gatePath}`);
  console.error('  Литерал переименован/переформатирован? Guard fail-closed — поправь regex или верни форму.');
  process.exit(2);
}
if (utilsSet === null) {
  console.error(`verify-placeholder-sync: не нашёл USAGE_PLACEHOLDERS = new Set([...]) в ${utilsPath}`);
  console.error('  Литерал переименован/переформатирован? Guard fail-closed — поправь regex или верни форму.');
  process.exit(2);
}

const gateCanon  = canon(gateSet);
const utilsCanon = canon(utilsSet);

if (JSON.stringify(gateCanon) === JSON.stringify(utilsCanon)) {
  console.log(`OK verify-placeholder-sync: R-049 и Inv 4 placeholder-набор синхронен (${gateCanon.length} элементов)`);
  process.exit(0);
}

console.error('verify-placeholder-sync: ДРЕЙФ placeholder-набора между R-049 и Inv 4');
console.error(`  R-049  (${gatePath}):  ${gateCanon.join(', ')}`);
console.error(`  Inv 4  (${utilsPath}): ${utilsCanon.join(', ')}`);
const inGateOnly  = gateCanon.filter(x => !utilsCanon.includes(x));
const inUtilsOnly = utilsCanon.filter(x => !gateCanon.includes(x));
if (inGateOnly.length)  console.error(`  только в R-049: ${inGateOnly.join(', ')}`);
if (inUtilsOnly.length) console.error(`  только в Inv 4: ${inUtilsOnly.join(', ')}`);
console.error('  Синхронизируй наборы. R-049 (verify-approved-gate.sh) — канон.');
process.exit(1);
NODEEOF
