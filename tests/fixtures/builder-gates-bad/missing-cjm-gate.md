# /builder (bad fixture for smoke-builder-gates.sh)

Содержит 3 из 4 BUILDER_GATE-якорей. Намеренно отсутствует якорь GATE_CJM.
Smoke-тест ожидает exit 1.

## Шаг 5 — CJM

После CJM спроси дизайнера апрува. (Якорь GATE_CJM отсутствует.)

## Шаг 6 — План генерации (gate)

<!-- BUILDER_GATE: GATE_LAYOUT — fixture. -->
Жди явный апрув — apruv-word из allow-list.

## Шаг 7 — Figma

### Чек-лист построения

<!-- BUILDER_GATE: GATE_CHECKLIST — fixture. -->
Жди явный апрув перед первым `use_figma`. Это gate, не сверка.

### Figma Implementer

<!-- BUILDER_GATE: ANTI_SKIP — fixture. -->
`use_figma` соответствует G-I3 и никогда не вызывается, пока все V-гейты не PASS.
