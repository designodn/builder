# Agent Roles

Пять агентов образуют линейный пайплайн. Каждый получает апрувнутый вывод предыдущего.

## 1. Research Agent
**Файл:** `src/agents/research/RESEARCH_AGENT.md`

Принимает задачу дизайнера и необязательные референсы (скриншоты + комментарии).
Задаёт 4 уточняющих вопроса (метрики, аудитория, бэкенд-ограничения, похожие экраны).
Анализирует референсы и извлекает принципы.
Возвращает структурированный `researchOutput` — вход для Text Layout Agent.

Апрув: `«апрув ресёрч»`

## 2. Text Layout Agent
**Файл:** `src/agents/text-layout/TEXT_LAYOUT_AGENT.md`

Принимает `researchOutput` и превращает его в иерархический текстовый список экрана.
Нумерация отражает вложенность: `1`, `1.1`, `1.1.1`.
Каждый элемент: номер + короткое название + описание.

Апрув: `«апрув лейаут»`

## 3. JSON Layout Agent
**Файл:** `src/agents/json-layout/JSON_LAYOUT_AGENT.md`

Принимает утверждённый текстовый лейаут и превращает его в JSON-дерево.
Все отступы и размеры — только через переменные из `registry/libraries/numbers-paddings/variables.json`.
Никаких хардкодных px-значений.

Апрув: `«апрув JSON»`

## 4. Builder Agent (оркестратор)
**Файл:** `src/agents/builder/BUILDER_AGENT.md`
**Код:** `agents/builder/src/index.ts`

Читает `registry/` и `rules.md`. Реализует JSON-лейаут в layout.json через Claude API.
Применяет фильтры из `config/planner-rules.json` и ограничения из `config/project-rules.json`.
Использует prop-слоты из `tokens/swap-slots/` для правильной расстановки пропов.

Апрув: `APPROVE` в терминале

## 5. Figma Implementer
**Файл:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md`

Получает апрувнутый CJM и создаёт фреймы в Figma через `use_figma`.
Перед генерацией обязан прочитать `rules.md` и составить план каждого экрана (скелет: meshok ↑ → контент → meshok ↓).
