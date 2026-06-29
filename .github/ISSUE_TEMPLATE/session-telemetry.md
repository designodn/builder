---
name: Session telemetry
about: Авто-запись от builder'а в конце сессии (служебный шаблон, обычно создаётся через MCP)
title: "[session] "
labels: ["session-telemetry"]
---

<!--
Этот шаблон используется builder'ом в конце /builder через mcp__github__issue_write.
Ручное заполнение — только fallback, если автомат не сработал.
Все поля в JSON-блоке ниже соответствуют схеме из docs/SESSION_TELEMETRY.md.
-->

## Sessiоn

```json
{
  "session_id": "",
  "ts_start": "",
  "ts_end": "",
  "duration_total_sec": 0,
  "duration_figma_build_sec": 0,
  "designer_login": "",
  "component": "",
  "stages": {
    "research": false,
    "analytics": false,
    "product": false,
    "experience": false,
    "cjm": false,
    "figma_build": false
  },
  "cjm_approved": false,
  "cjm_iterations": 0,
  "figma_iterations": 0,
  "import_success": false,
  "components_imported": 0,
  "watchpoints_fired": [],
  "retries": { "import": 0, "cjm_redo": 0 },
  "placeholder_pct": null,
  "accuracy_pct": null,
  "pulse": {
    "mood": null,
    "negative_note": null,
    "positive_note": null
  },
  "agent_feedback": []
}
```

## Заметки

<!-- Свободные комментарии Насти при разборе. Дизайнер сюда не пишет. -->
