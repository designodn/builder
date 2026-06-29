# Builder Agent

> Этот файл оставлен как заглушка. Актуальная инструкция — в `.claude/commands/builder.md` (вызывается через `/builder`).
>
> Старый оркестратор и онбординг через zip удалены, чтобы не дублировать инструкции и не раздувать контекст.

## Пайплайн (актуальный)

`/builder` ведёт через:

1. **Подключение к Figma** (`/connectFigmaMCP` — лениво, только если `whoami` упал)
2. **Брифинг** — Research Agent (`src/agents/research/RESEARCH_AGENT.md`)
3. **Расширения** — `analytics`, `product`, `experience` (опционально)
4. **CJM** (апрув обязателен)
5. **План генерации** — `rules/skeleton.md` + `registry/index.json`
6. **Figma** — Text Layout → JSON Layout → Figma Implementer

| Агент | Файл |
|---|---|
| Research Agent | `src/agents/research/RESEARCH_AGENT.md` |
| Text Layout Agent | `src/agents/text-layout/TEXT_LAYOUT_AGENT.md` |
| JSON Layout Agent | `src/agents/json-layout/JSON_LAYOUT_AGENT.md` |
| Figma Implementer | `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` |
