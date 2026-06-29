# Issues to escalate to Design System designers

Запросы на правки в саму Figma-ДС (не Builder/правила/реестр).
Каждая запись — что просим, почему, и какое A-NNN/R-NNN это закрывает.

## Открытые

### [ ] DS-001 · meshok ↑ navbar slot — поставить navbar 1.0 как preferred default

Сейчас слот `navbar#1491:0` в `meshok ↑` имеет дефолт = generic placeholder `12:6`. У placeholder нет middle/left/right пропов, поэтому Builder вынужден явно свапать слот при каждом создании meshok ↑, иначе setNavbarTitle и любая работа с middle падает с "no middle swap prop". Это причина A-051 (6-я итерация бага с пустым navbar title).

**Запрос:** в Figma-файле system → meshok ↑ component → property `navbar#1491:0` → выставить preferred default = `navbar 1.0` (key `b652cf46a2f6417a26a080bb44d288820a94bcef`).

**Что закроет:**
- A-051 у источника (без помощи Builder helper'а)
- Уменьшит placeholderSignal в каждом /test --full (сейчас 129 на 5 экранов, ~50 из них — этот слот)

**Замечено:** /test 2026-05-11
