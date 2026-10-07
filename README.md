# figma-slides — презентации в Figma руками Claude Code

Скилл для [Claude Code](https://claude.com/claude-code), который собирает презентации в Figma по готовому сценарию. Claude пишет небольшой локальный плагин Figma с текстами слайдов, вы запускаете его одной кнопкой, Claude проверяет результат и правит. Работает на бесплатном тарифе Figma и не упирается в лимиты API.

*English summary below.*

## Зачем это нужно

Попросить ИИ-агента «сделай слайды в Figma» сложнее, чем кажется:

- **REST API Figma не умеет создавать и менять объекты на холсте** — ни с каким токеном.
- **Официальный MCP-сервер Figma** умеет писать на холст, но для записи нужно место Full, а на местах View и Collab лимит — до 20 вызовов в месяц на любом тарифе. На бесплатном тарифе это пара попыток.
- **Чтение через REST API ограничено так же:** после пары десятков запросов приходит ошибка 429.

Плагин работает внутри Figma и лимитов API не тратит. На нём собрали 128 слайдов для пяти учебных модулей.

Если у вас платный тариф с местом Full, попробуйте сначала MCP-сервер Figma, а этот скилл держите запасным вариантом.

## Как это работает

1. **Вы даёте сценарий** — какие слайды и с каким текстом. Можно старую презентацию: Claude составит по ней сценарий и согласует его с вами.
2. **Claude пишет плагин** из шаблона: два файла, `manifest.json` и `code.js`, тексты слайдов внутри. Перед вами он проверяет плагин тестом без Figma.
3. **Вы подключаете плагин один раз** и дальше просто нажимаете Run.
4. **Плагин собирает слайды** секцией на текущей странице и пишет итог: сколько слайдов, есть ли предупреждения.
5. **Claude проверяет слайды глазами** — в браузере через Claude in Chrome (без лимитов) или картинками через API одним запросом на колоду — и правит плагин. Повторный запуск пересобирает только свою секцию.

## Установка

Склонируйте репозиторий в папку скиллов Claude Code:

```bash
# для всех проектов
git clone https://github.com/igor-batrakov/figma-slides-skill ~/.claude/skills/figma-slides

# или только для одного проекта
git clone https://github.com/igor-batrakov/figma-slides-skill <проект>/.claude/skills/figma-slides
```

Новая сессия Claude Code подхватит скилл сама.

**Что понадобится:**

- приложение Figma для компьютера — свой плагин из папки запускается только в нём;
- файл Figma типа Design с правом редактирования;
- Node.js — для теста плагина без Figma (не обязательно);
- расширение Claude in Chrome — чтобы Claude смотрел слайды в браузере (не обязательно, но так проверка не тратит лимиты API);
- токен Figma только на чтение в переменной `FIGMA_TOKEN` — только если хотите проверять картинками через API.

## Как пользоваться

Скажите Claude Code что-то вроде:

> Собери в Figma презентацию по этому сценарию: [сценарий или файл]. Стиль — белые слайды, шрифт Inter.

Claude скопирует шаблон в ваш проект, заполнит слайды и скажет, что нажать в Figma:

1. Меню Figma → Plugins → Development → **Import plugin from manifest** → выберите `manifest.json`. Это один раз.
2. Plugins → Development → **Slides builder**.
3. Пришлите Claude сообщение, которое плагин покажет внизу экрана, и ссылку на файл.

Чтобы посмотреть шаблон до работы с Claude, импортируйте `template/manifest.json` в пустой файл и запустите: соберётся демо-колода из 14 слайдов, по одному на каждый макет.

## Макеты

Обложка, крупная фраза, титул раздела, плашка с примером, карточки (2–6), таблица, две плашки рядом, шаги со стрелками, определение с выноской, блок кода, квиз с отдельным слайдом ответа, история с выводом, «команда → результат» и копия готового слайда из файла с заменой текста. Поля каждого макета — в [references/layouts.md](references/layouts.md).

Цвета, шрифты и размер слайда задаются в одном месте — `THEME` в начале `template/code.js`.

## Что плагин проверяет сам

- **Слово шире своего блока.** Figma разрывает такие слова посередине: «Публика/ция». Плагин называет слово и слайд.
- **Текст за краем слайда.** Плагин говорит, на каком слайде.
- **Нет шрифта или исходного слайда для копии.** Понятная ошибка вместо падения.
- **Перенос по дефису.** «about-me.md» и цифра после слова не разрываются: плагин сам ставит неразрывный дефис и неразрывный пробел.

## Структура

| Путь | Что это |
|---|---|
| `SKILL.md` | инструкция для Claude: порядок работы, проверка, грабли |
| `template/` | плагин Figma: тема, 14 макетов, сборка, демо-колода |
| `references/layouts.md` | поля макетов и сколько текста влезает |
| `tests/smoke-test.js` | проверка плагина без Figma: `node tests/smoke-test.js` |
| `scripts/figma_render.py` | картинки слайдов секции через REST API, один запрос на колоду |

## Ограничения

- Плагин запускается только в приложении Figma для компьютера, не в браузере.
- Пересборка секции стирает ручные правки в ней. Сначала доводите слайды плагином, потом правьте руками.
- Тест без Figma оценивает ширину букв приблизительно. Тонкие переносы видны только в Figma.
- Лимиты и возможности API и MCP Figma указаны на октябрь 2026 года и могут меняться — сверяйтесь с [документацией Figma](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/).

Проект не связан с Figma и Anthropic.

---

## English summary

A [Claude Code](https://claude.com/claude-code) skill that builds slide decks in Figma from a script. Claude writes a small local Figma plugin from the template in `template/`, you run it once in the Figma desktop app, and Claude reviews the result (in the browser via Claude in Chrome, or with one batched REST API render per deck) and iterates.

Why a plugin: the Figma REST API cannot create or edit canvas nodes, and on View/Collab seats both the REST API and the official Figma MCP server allow only about 20 calls per month. A plugin runs inside Figma and uses no API quota. If you have a paid plan with a Full seat, try the official Figma MCP server first.

Install: `git clone https://github.com/igor-batrakov/figma-slides-skill ~/.claude/skills/figma-slides`. The skill instructions, layouts and comments are in Russian.

## Лицензия

[MIT](LICENSE)
