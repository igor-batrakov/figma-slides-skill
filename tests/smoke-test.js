// Проверка шаблона плагина без Figma: подменяет API Figma простой моделью и прогоняет code.js.
// Что проверяется: плагин доходит до «Готово», каждый слайд W×H, ни один узел не выходит
// за границы слайда, предупреждение о слове шире блока срабатывает, ошибки шаблона понятны.
// Ширина текста здесь — оценка (0.56 em на символ), поэтому тест ловит грубые ошибки макета,
// а не точные переносы: их проверяют глазами в Figma.
// Запуск: node tests/smoke-test.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CODE = fs.readFileSync(path.join(__dirname, "..", "template", "code.js"), "utf8");

function makeFigma() {
  let ids = 0;
  const all = new Map();
  function node(type) {
    const n = {
      id: "1:" + (++ids), type, name: type, x: 0, y: 0, width: 100, height: 100, children: [], parent: null,
      fills: [], strokes: [],
      appendChild(c) { if (c.parent) c.parent.children = c.parent.children.filter(k => k !== c); c.parent = this; this.children.push(c); },
      insertChild(i, c) { if (c.parent) c.parent.children = c.parent.children.filter(k => k !== c); c.parent = this; this.children.splice(i, 0, c); },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(k => k !== this); this.parent = null; },
      resize(w, h) { this.width = w; this.height = h; },
      resizeWithoutConstraints(w, h) { this.width = w; this.height = h; },
      rescale(k) { this.width *= k; this.height *= k; },
      findAll(fn) { const out = []; const walk = n => { n.children.forEach(c => { if (fn(c)) out.push(c); walk(c); }); }; walk(this); return out; },
      findOne(fn) { return this.findAll(fn)[0] || null; },
      clone() { const c = node(this.type); Object.assign(c, { name: this.name, width: this.width, height: this.height }); return c; },
    };
    all.set(n.id, n);
    return n;
  }
  function textNode() {
    const t = node("TEXT");
    let chars = "", auto = "WIDTH_AND_HEIGHT";
    t.fontSize = 12; t.lineHeight = { unit: "AUTO" }; t.letterSpacing = { value: 0, unit: "PIXELS" };
    t.fontName = { family: "Inter", style: "Regular" };
    const lh = () => (t.lineHeight && t.lineHeight.value) || t.fontSize * 1.2;
    const cw = () => t.fontSize * (/(Bold|Black)/.test(t.fontName.style) ? 0.6 : 0.56) + ((t.letterSpacing && t.letterSpacing.value) || 0);
    function layout() {
      const lines = chars.split("\n");
      if (auto === "WIDTH_AND_HEIGHT") {
        t.width = Math.max(...lines.map(l => l.length)) * cw();
        t.height = lines.length * lh();
      } else if (auto === "HEIGHT") {
        const perLine = Math.max(1, Math.floor(t.width / cw()));
        let count = 0;
        for (const line of lines) {
          let cur = 0; count++;
          for (const word of line.split(" ")) {
            const len = word.length + (cur ? 1 : 0);
            if (cur + len > perLine && cur > 0) { count++; cur = word.length; } else cur += len;
          }
        }
        t.height = count * lh();
      }
    }
    Object.defineProperty(t, "characters", { get: () => chars, set: v => { chars = v; layout(); } });
    Object.defineProperty(t, "textAutoResize", { get: () => auto, set: v => { auto = v; layout(); } });
    t.resize = (w, h) => { t.width = w; t.height = h; layout(); };
    t.getRangeAllFontNames = () => [t.fontName];
    return t;
  }
  const page = node("PAGE");
  let closed = null;
  const figma = {
    currentPage: page,
    createFrame: () => node("FRAME"),
    createRectangle: () => node("RECTANGLE"),
    createSection: () => node("SECTION"),
    createText: textNode,
    loadFontAsync: async f => { if (f.family === "Нет Такого") throw new Error("no font"); },
    getNodeByIdAsync: async id => all.get(id) || null,
    viewport: { scrollAndZoomIntoView() {} },
    closePlugin: msg => { closed = msg; },
  };
  return { figma, page, result: () => closed };
}

async function run(code) {
  const env = makeFigma();
  vm.runInNewContext(code, { figma: env.figma, console: { warn() {} }, Promise, Math, Object, Set, String, Error });
  for (let i = 0; i < 50 && env.result() === null; i++) await new Promise(r => setTimeout(r, 5));
  return env;
}

// Подмена куска шаблона для теста; если куска нет (пример поменяли), тест падает сразу,
// а не проверяет нетронутый код.
function sub(code, from, to) {
  if (!code.includes(from)) throw new Error("в template/code.js нет строки для теста: " + from);
  return code.replace(from, to);
}

let failed = 0;
function check(ok, label) { console.log((ok ? "ok   " : "FAIL ") + label); if (!ok) failed++; }

(async () => {
  // 1. Пример из шаблона собирается целиком, без предупреждений и вылезаний за слайд.
  const env = await run(CODE);
  const msg = env.result();
  check(msg && msg.startsWith("Готово"), "пример собирается: " + msg);
  const section = env.page.children.find(n => n.type === "SECTION");
  const frames = section ? section.children : [];
  check(frames.length === 14, "в секции 14 слайдов (по одному на макет): " + frames.length);
  check(frames.every(f => f.width === 1440 && f.height === 900), "все слайды 1440×900");
  const out = [];
  frames.forEach(f => f.findAll(n => n.type !== "FRAME").forEach(n => {
    if (n.x < -1 || n.y < -1 || n.x + n.width > f.width + 1 || n.y + n.height > f.height + 1)
      out.push(f.name + " → " + n.type + " " + (n.characters || "").slice(0, 30) + ` (${Math.round(n.x)},${Math.round(n.y)} ${Math.round(n.width)}×${Math.round(n.height)})`);
  }));
  check(out.length === 0, "ничего не выходит за границы слайда" + (out.length ? ":\n     " + out.join("\n     ") : ""));
  check(/Предупреждений нет/.test(msg), "в примере нет предупреждений");

  // 2. Длинное слово в узкой карточке даёт предупреждение (ошибка «Публика/ция»).
  const six = sub(CODE, "const RUN = [0];", `DECKS.push({ section: "Тест", slides: [{ type: "cards", name: "Шесть", title: "Т.", items: [
    { h: "Отправка" }, { h: "Удаление" }, { h: "Изменения" }, { h: "Администрирование" }, { h: "Деньги" }, { h: "Доступы" }] }] });
    const RUN = [1];`);
  const env2 = await run(six);
  check(/Администрирование/.test(env2.result() || ""), "предупреждение о слове шире карточки: " + env2.result());

  // 3. Неразрывный дефис: about-me.md не переносится по дефису.
  const env3 = await run(sub(CODE, `text: "Встреча без повестки — это просто разговор"`, `text: "Файл about-me.md"`));
  const st = env3.page.findAll(n => n.type === "TEXT" && /about/.test(n.characters))[0];
  check(st && st.characters.includes("about‑me.md"), "дефис внутри слова заменён на неразрывный");

  // 4. Понятная ошибка, если шаблона для копии нет.
  const env4 = await run(sub(CODE, `{ type: "section", name: "Раздел"`, `{ type: "clone", name: "Копия", id: "99:99" }, { type: "section", name: "Раздел"`));
  check(/нет шаблона 99:99/.test(env4.result() || ""), "понятная ошибка про отсутствующий шаблон: " + env4.result());

  // 5. Понятная ошибка, если шрифта нет.
  const env5 = await run(sub(CODE, `font: "Inter",`, `font: "Нет Такого",`));
  check(/нет шрифта Нет Такого/.test(env5.result() || ""), "понятная ошибка про шрифт: " + env5.result());

  // 6. Повторный запуск заменяет секцию, а не дублирует её.
  const env6 = makeFigma();
  for (let k = 0; k < 2; k++) {
    vm.runInNewContext(CODE, { figma: env6.figma, console: { warn() {} }, Promise, Math, Object, Set, String, Error });
    await new Promise(r => setTimeout(r, 50));
  }
  check(env6.page.children.filter(n => n.type === "SECTION").length === 1, "повторный запуск не плодит секции");

  // 7. Перегруженный слайд даёт предупреждение «за краем» (проверка, что она вообще срабатывает).
  const rows = Array.from({ length: 25 }, (_, i) => `["Строка ${i}", "текст", "текст"]`).join(",");
  const env7 = await run(sub(CODE, "const RUN = [0];", `DECKS.push({ section: "Перегруз", slides: [{ type: "table", name: "Длинная", title: "Т.", cols: [300, 474, 474], rows: [${rows}] }] });
    const RUN = [1];`));
  check(/за краем слайда/.test(env7.result() || ""), "предупреждение о вылезающем тексте: " + env7.result());

  console.log(failed ? `\n${failed} проверок не прошло` : "\nВсе проверки прошли");
  process.exit(failed ? 1 : 0);
})();
