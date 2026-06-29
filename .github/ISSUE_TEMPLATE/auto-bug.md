---
name: Auto bug (technical failure)
about: Авто-запись от builder'а при срабатывании watchpoint (служебный шаблон)
title: "[auto-bug] "
labels: ["session-telemetry"]
---

<!--
Этот шаблон используется builder'ом при срабатывании watchpoint
(auto:bug:import-failed / auto:bug:registry-stale / auto:bug:missing-rule / auto:bug:builder-error).
Создаётся автоматически через mcp__github__issue_write с дедупом по session_id + watchpoint_type.
Дизайнер может добавить детали в комментах.
-->

## Что случилось

- **Тип:** <!-- auto:bug:import-failed | auto:bug:registry-stale | auto:bug:missing-rule | auto:bug:builder-error -->
- **Компонент:** <!-- Button/Primary -->
- **Session:** <!-- session_id из telemetry-issue -->
- **Дизайнер:** <!-- github-login -->
- **Время:** <!-- ISO -->

## Trace

```
<!-- error.message, stack или короткий контекст -->
```

## Контекст

- HEAD: <!-- git sha -->
- В реестре: <!-- yes/no, дата последнего /syncKeys -->
- Правило: <!-- путь к .rule.json или «нет» -->

## Что дизайнер думает (опционально)

<!-- Комментарии от дизайнера, если хочет дописать -->
