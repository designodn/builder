# Agent Contracts

Контракты входа и выхода каждого агента. Формат данных фиксирован.

> ⚠ **Оркестрация изменилась.** Раньше Text Layout / JSON Layout / Builder / Figma Implementer были отдельными агентами с apruv-точкой между каждым. В нынешнем `/builder` Text Layout (G-I1), JSON Layout (G-I2), Figma Implementer (G-I3) — **internal scratchpad-этапы** внутри `/builder`-сессии, дизайнер apruvит только итоги (CJM, final layout, чек-лист построения). Контракты I/O ниже — всё ещё корректное описание данных каждого этапа, но переходы между ними **не** требуют apruv'а дизайнера. См. `.claude/commands/builder.md` секция «Гейты» для актуальной схемы переходов.

---

## Research Agent

**Вход:**
- Промпт дизайнера (свободный текст)
- Необязательно: 1–5 скриншотов с комментариями

**Выход** (`researchOutput`):
```json
{
  "platform": "android | ios | web",
  "task": "string",
  "contextQuestions": {
    "metrics": "string",
    "targetAudience": "string",
    "backendConstraints": "string",
    "consistencyRef": "string"
  },
  "referenceSummaries": [
    { "id": "string", "notesFromDesigner": "string", "takeaways": ["string"], "avoid": ["string"] }
  ],
  "globalGuidelines": {
    "layout": "string",
    "contentTone": "string",
    "visualNotes": "string"
  }
}
```

---

## Text Layout Agent

**Вход:** `researchOutput` (см. выше)

**Выход:** иерархический текстовый список
```
1. meshok
2. навигация
  2.1 appBar
  2.2 tabs
3. промо-баннеры
  3.1 баннер 1
  ...
```

---

## JSON Layout Agent

**Вход:** утверждённый текстовый список от Text Layout Agent

**Выход:** JSON-дерево экрана с meshok, контейнерами, ячейками и карточками.
Все отступы — ссылки на переменные из `registry/libraries/numbers-paddings/variables.json`.

---

## Builder Agent

**Вход:**
- `--prompt` — описание экрана (свободный текст или вывод JSON Layout Agent)
- `registry/index.json` — derived каталог компонентов (генерится из `rules/components/*.rule.json`)
- `rules.md` — семантические правила
- `config/planner-rules.json` — фильтры каталога
- `config/project-rules.json` — ограничения проекта
- `tokens/swap-slots/` — prop-слоты

**Выход:** `layout.json`
```json
{
  "name": "string",
  "frame": { "width": 390, "height": 844, "autolayout": { ... } },
  "layers": [
    { "type": "component", "componentKey": "...", "name": "...", "properties": {} },
    { "type": "frame", "name": "...", "autolayout": { ... }, "layers": [ ... ] }
  ]
}
```

---

## Figma Implementer (планируется)

**Вход:** `layout.json`

**Выход:** созданные фреймы в Figma-файле, ссылка на результат.
