# figma-slides

Скилл для [Claude Code](https://claude.com/claude-code): собирает презентацию в Figma по готовому сценарию. Claude пишет локальный плагин Figma с текстами слайдов, пользователь запускает его в приложении Figma, а Claude смотрит результат и правит плагин. Скилл работает на бесплатном тарифе Figma и не тратит лимиты API.

На нём собрали 128 слайдов для пяти учебных модулей.

*English summary below.*

## Почему через плагин

У Figma два способа дать агенту доступ к файлу, и на бесплатном тарифе оба почти не работают:

- REST API читает файл, но не создаёт и не меняет объекты на холсте, какой бы токен ни был. Чтение тоже ограничено: на местах View и Collab — до 20 запросов в месяц.
- Официальный MCP-сервер Figma умеет писать на холст, но для записи нужно место Full. На местах View и Collab у него тот же лимит — до 20 вызовов в месяц на любом тарифе.

Плагин работает внутри Figma, поэтому лимиты API на него не распространяются. При платном тарифе с местом Full проще начать с MCP-сервера Figma, а этот скилл оставить запасным вариантом.

## От сценария до слайдов — пять шагов

1. Пользователь даёт сценарий: какие слайды и с каким текстом. Подойдёт и старая презентация — Claude составит по ней сценарий и согласует его.
2. Claude копирует шаблон плагина (`manifest.json` и `code.js`), вписывает тексты слайдов и проверяет плагин тестом без Figma.
3. Пользователь один раз подключает плагин в Figma, дальше запускает его одной командой.
4. Плагин собирает слайды в секцию на текущей странице и сообщает, сколько их и есть ли предупреждения.
5. Claude смотрит слайды — в браузере через расширение Claude in Chrome или картинками через API, одним запросом на колоду — и правит плагин. При повторном запуске пересобирается только его секция.

Когда мы собирали пять колод, на каждую уходило от одного до трёх запусков.

## Установка

Скилл ставится клонированием репозитория в папку скиллов Claude Code — для всех проектов или для одного:

```bash
git clone https://github.com/igor-batrakov/figma-slides-skill ~/.claude/skills/figma-slides
git clone https://github.com/igor-batrakov/figma-slides-skill <проект>/.claude/skills/figma-slides
```

Новая сессия Claude Code находит скилл сама.

Для работы нужны приложение Figma для компьютера (свой плагин запускается только в нём) и файл Figma типа Design с правом редактирования. Остальное по желанию:

- Node.js — для теста плагина без Figma;
- расширение Claude in Chrome — чтобы Claude смотрел слайды в браузере, не тратя лимиты API;
- токен Figma с правами на чтение в переменной `FIGMA_TOKEN` — для проверки картинками через API.

## Запуск

Достаточно попросить Claude Code, например:

> Собери в Figma презентацию по этому сценарию: [сценарий или файл]. Стиль — белые слайды, шрифт Inter.

Claude скопирует шаблон в проект, заполнит слайды и подскажет, что нажать в Figma:

1. Меню Figma → Plugins → Development → **Import plugin from manifest** → `manifest.json`. Это делается один раз.
2. Plugins → Development → **Slides builder**.
3. Сообщение плагина внизу экрана и ссылку на файл — отправить Claude.

Шаблон можно посмотреть и без Claude: если импортировать `template/manifest.json` в пустой файл и запустить, соберётся демо-колода из 14 слайдов — по одному на каждый макет.

## 14 макетов

Обложка, крупная фраза, титул раздела, плашка с примером, 2–6 карточек, таблица, две плашки рядом, шаги со стрелками, определение с выноской, блок кода, квиз с отдельным слайдом ответа, история с выводом, «команда → результат» и копия готового слайда из файла с заменой текста.

Поля каждого макета и сколько в него влезает текста — в [описании макетов](references/layouts.md). Цвета, шрифты и размер слайда задаются в одном месте — `THEME` в начале `template/code.js`.

## Ошибки, которые плагин находит сам

Figma разрывает посередине слово, которое шире своего блока: «Публика/ция». Плагин ловит такие слова и называет слово и слайд. Так же он предупреждает о тексте за краем слайда, а если нет шрифта или исходного слайда для копии, останавливается с понятной ошибкой.

Дефис внутри слова («about-me.md») и пробел перед числом плагин сам делает неразрывными, поэтому эти места не переносятся.

## Что в репозитории

| Путь | Что это |
|---|---|
| `SKILL.md` | инструкция для Claude: порядок работы, проверка, известные ошибки |
| `template/` | плагин Figma: тема, 14 макетов, сборка, демо-колода |
| `references/layouts.md` | поля макетов и сколько текста влезает |
| `tests/smoke-test.js` | проверка плагина без Figma: `node tests/smoke-test.js` |
| `scripts/figma_render.py` | картинки слайдов секции через REST API, один запрос на колоду |

Claude читает `SKILL.md`, остальные файлы нужны плагину и проверкам.

## Ограничения

- Плагин запускается только в приложении Figma для компьютера, в браузерной версии — нет.
- Пересборка секции стирает ручные правки в ней, поэтому слайды сначала доводят плагином, а руками правят в конце.
- Тест без Figma оценивает ширину букв приблизительно, тонкие переносы видны только в самой Figma.
- Лимиты API и MCP Figma указаны на октябрь 2026 года и могут меняться. Актуальные цифры — в [документации Figma о лимитах](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/).

Проект не связан с компаниями Figma и Anthropic.

---

## English summary

A [Claude Code](https://claude.com/claude-code) skill that builds slide decks in Figma from a script. Claude writes a small local Figma plugin from the template in `template/`, the user runs it in the Figma desktop app, and Claude reviews the slides — in the browser via the Claude in Chrome extension, or with one batched REST API render per deck — and updates the plugin.

Why a plugin: the Figma REST API cannot create or edit canvas nodes, and on View and Collab seats both the REST API and the official Figma MCP server allow up to 20 calls per month. A plugin runs inside Figma and uses no API quota. On a paid plan with a Full seat, the official Figma MCP server is the simpler first choice.

Install: `git clone https://github.com/igor-batrakov/figma-slides-skill ~/.claude/skills/figma-slides`. The skill instructions, layout reference and code comments are in Russian.

## Лицензия

[MIT](LICENSE)
