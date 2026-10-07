// Slides builder: собирает слайды из данных DECKS в секции на текущей странице Figma.
// Каждая колода — своя секция. Повторный запуск удаляет секцию с тем же именем и собирает
// её заново (только её), поэтому ручные правки в собранной секции при пересборке пропадают.
// Как устроен скилл и порядок работы — в SKILL.md рядом с этой папкой.

// ======================= ТЕМА: поменяйте под свой стиль =======================
const THEME = {
  W: 1440, H: 900, M: 96,                 // размер слайда и поля
  font: "Inter",                           // основной шрифт (заголовки, текст)
  statementFont: "IBM Plex Sans",          // шрифт крупных фраз и обложки
  monoFont: "JetBrains Mono",              // шрифт блоков кода
  bg: "#ffffff", fg: "#000000", text: "#2a2a2a", muted: "#777777", faint: "#bbbbbb",
  card: "#f7f7f7", cardAlt: "#f4f4f4", line: "#e6e6e6", border: "#e5e5e5",
  ok: "#22a05a", okSoft: "#f0faf4", bad: "#dd4444",
  coverBg: "#161b1e", coverFg: "#e7c092",
};
// Начертания, которые использует движок. Если шрифта нет в Figma, плагин скажет какого.
const WEIGHT = { 400: "Regular", 500: "Medium", 700: "Bold", 900: "Black" };
const FONTS = [
  [THEME.font, "Regular"], [THEME.font, "Medium"], [THEME.font, "Bold"], [THEME.font, "Black"],
  [THEME.statementFont, "Regular"], [THEME.statementFont, "Medium"], [THEME.monoFont, "Regular"],
];

const W = THEME.W, H = THEME.H, M = THEME.M, CW = W - 2 * M;
let FOOTER = "";          // подпись внизу слайда, задаётся у колоды
let CURRENT = "";         // имя собираемого слайда — для предупреждений
const WARNINGS = [];      // «слово не влезает в блок» и прочее, показываются в конце

// ======================= примитивы =======================
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
function solid(hex) { return [{ type: "SOLID", color: rgb(hex) }]; }

// Неразрывный дефис внутри слов (about-me.md, веб-поиск) и неразрывный пробел перед числом,
// иначе Figma переносит «about-/me.md» и оставляет «2» одну на строке.
function typo(s) {
  return s
    .replace(/([A-Za-zА-Яа-яЁё0-9])-(?=[A-Za-zА-Яа-яЁё0-9])/g, "$1‑")
    .replace(/([A-Za-zА-Яа-яЁё]) (\d)/g, "$1 $2");
}

function fontOf(o) {
  const family = o.family || THEME.font;
  return { family, style: o.style || WEIGHT[o.weight || 400] };
}

function text(parent, s, o) {
  const t = figma.createText();
  t.fontName = fontOf(o);
  t.characters = o.family === THEME.monoFont ? s : typo(s);
  t.fontSize = o.size || 20;
  if (o.lh) t.lineHeight = { value: o.lh, unit: "PIXELS" };
  if (o.ls) t.letterSpacing = { value: o.ls, unit: "PIXELS" };
  if (o.upper) t.textCase = "UPPER";
  if (o.align) t.textAlignHorizontal = o.align;
  t.fills = solid(o.color || THEME.fg);
  if (o.w) { t.textAutoResize = "HEIGHT"; t.resize(o.w, t.height); } else t.textAutoResize = "WIDTH_AND_HEIGHT";
  parent.appendChild(t);
  t.x = o.x || 0; t.y = o.y || 0;
  if (o.w) checkWords(t, o);
  return t;
}

// Самое длинное слово шире блока — Figma разорвёт его посередине («Публика/ция»).
// Меряем два самых длинных слова отдельным временным текстом и записываем предупреждение.
function checkWords(t, o) {
  const words = t.characters.split(/[ \n\t]+/).filter(Boolean);
  const longest = [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 2);
  for (const w of longest) {
    const probe = figma.createText();
    probe.fontName = t.fontName; probe.fontSize = t.fontSize;
    probe.letterSpacing = t.letterSpacing; probe.textCase = t.textCase;
    probe.characters = w;
    probe.textAutoResize = "WIDTH_AND_HEIGHT";
    const tooWide = probe.width > o.w + 0.5;
    probe.remove();
    if (tooWide) WARNINGS.push(`«${CURRENT}»: «${w}» шире блока (${o.w}px) — сократите текст или расширьте блок`);
  }
}

function rect(parent, x, y, w, h, o) {
  const r = figma.createRectangle();
  parent.appendChild(r);
  r.x = x; r.y = y; r.resize(w, Math.max(h, 0.01));
  r.fills = o.fill ? solid(o.fill) : [];
  if (o.stroke) { r.strokes = solid(o.stroke); r.strokeWeight = o.sw || 1; r.strokeAlign = "INSIDE"; }
  if (o.radius) r.cornerRadius = o.radius;
  return r;
}

function slide(name, bg) {
  const f = figma.createFrame();
  f.name = name;
  f.resize(W, H);
  f.fills = solid(bg || THEME.bg);
  f.clipsContent = true;
  return f;
}

// Заголовок контентного слайда и подзаголовок. Возвращает нижнюю границу.
function header(f, title, sub) {
  const t = text(f, title, { x: M, y: 72, w: CW, size: 56, weight: 700, lh: 64, ls: -1.4 });
  let bottom = t.y + t.height;
  if (sub) {
    const s = text(f, sub, { x: M, y: bottom + 18, w: 1150, size: 26, lh: 36, color: THEME.muted });
    bottom = s.y + s.height;
  }
  return bottom;
}

function footer(f, label) {
  if (!(label || FOOTER)) return;
  rect(f, M, H - 96, CW, 1, { fill: "#eeeeee" });
  text(f, label || FOOTER, { x: M, y: H - 78, size: 12, ls: 1, upper: true, color: THEME.faint });
}

// Вертикально центрирует группу узлов в полосе [top, bottom].
function centerIn(nodes, top, bottom) {
  const y0 = Math.min(...nodes.map(n => n.y));
  const y1 = Math.max(...nodes.map(n => n.y + n.height));
  const dy = Math.round(top + (bottom - top - (y1 - y0)) / 2 - y0);
  nodes.forEach(n => { n.y += dy; });
}

const BAND_BOTTOM = H - 120; // нижняя граница контента, над подписью

// ======================= макеты =======================
// Поля каждого макета описаны в references/layouts.md.
const LAYOUTS = {
  cover(s) {
    const f = slide(s.name, THEME.coverBg);
    const t = text(f, s.title, { family: THEME.statementFont, weight: 500, x: M, w: 1100, size: 80, lh: 88, ls: -1.6, color: THEME.coverFg });
    t.y = H - M - t.height;
    if (s.top) {
      const top = text(f, s.top, { family: THEME.statementFont, size: 32, lh: 42, color: THEME.coverFg });
      top.x = W - M - top.width; top.y = 60;
    }
    return f;
  },

  statement(s) {
    const f = slide(s.name);
    const main = text(f, s.text, { family: THEME.statementFont, x: 190, w: W - 380, size: 64, lh: 90, ls: -0.64, align: "CENTER", color: "#1c1f21" });
    const nodes = [main];
    if (s.sub) nodes.push(text(f, s.sub, { x: 190, y: main.height + 32, w: W - 380, size: 24, lh: 34, align: "CENTER", color: "#888888" }));
    centerIn(nodes, 0, H);
    return f;
  },

  section(s) {
    const f = slide(s.name);
    const l = text(f, s.label, { x: M, y: 0, size: 13, weight: 700, ls: 1.95, upper: true, color: THEME.faint });
    const t = text(f, s.title, { x: M, y: l.height + 18, w: 1000, size: 80, weight: 900, lh: 84, ls: -2.4 });
    centerIn([l, t], 0, H);
    return f;
  },

  // Подпись, крупный заголовок и плашка с цветной полосой слева (пример запроса, команда).
  way(s) {
    const f = slide(s.name);
    const l = text(f, s.label, { x: M, y: 0, size: 13, weight: 700, ls: 1.95, upper: true, color: THEME.faint });
    const t = text(f, s.title, { x: M, y: l.height + 18, w: CW, size: 72, weight: 900, lh: 76, ls: -2.16 });
    const boxY = t.y + t.height + 40, bw = s.wide ? CW : 760;
    const nodes = [l, t];
    let inner;
    if (s.command) {
      const c = text(f, s.command, { x: M + 40, y: boxY + 30, w: bw - 80, size: 32, weight: 700, lh: 40 });
      inner = text(f, s.box, { x: M + 40, y: c.y + c.height + 14, w: bw - 80, size: 22, lh: 30, color: "#888888" });
      nodes.push(c);
    } else {
      inner = text(f, s.box, { x: M + 40, y: boxY + 30, w: bw - 80, size: s.boxSize || 27, lh: s.boxLh || 36 });
    }
    const bh = inner.y + inner.height + 30 - boxY;
    const bg = rect(f, M, boxY, bw, bh, { fill: THEME.cardAlt });
    const bar = rect(f, M, boxY, 4, bh, { fill: s.accent || THEME.fg });
    f.insertChild(0, bg); f.insertChild(1, bar);
    nodes.push(inner, bg, bar);
    centerIn(nodes, 0, H);
    return f;
  },

  // Карточки в ряд: 2–6 штук. Поля карточки: n (крупный номер), k (подпись), h (заголовок), t (текст).
  cards(s) {
    const f = slide(s.name);
    const top = header(f, s.title, s.sub);
    const n = s.items.length, gap = 24, cw = (CW - gap * (n - 1)) / n, pad = n >= 5 ? 24 : 36, big = n < 5;
    const hSize = big ? 30 : (n >= 6 ? 20 : 24), hLh = big ? 36 : (n >= 6 ? 26 : 30);
    const groups = s.items.map((it, i) => {
      const x = M + i * (cw + gap), parts = [];
      let y = 0;
      if (it.n) { const num = text(f, it.n, { x: x + pad, y, size: 64, weight: 900, lh: 64, ls: -2, color: "#e6e6e6" }); parts.push(num); y += num.height + 14; }
      if (it.k) { const k = text(f, it.k, { x: x + pad, y, w: cw - 2 * pad, size: 13, weight: 700, ls: 1.8, upper: true, color: THEME.faint }); parts.push(k); y += k.height + 12; }
      const h = text(f, it.h, { x: x + pad, y, w: cw - 2 * pad, size: hSize, weight: 700, lh: hLh }); parts.push(h); y += h.height + 14;
      if (it.t) { const b = text(f, it.t, { x: x + pad, y, w: cw - 2 * pad, size: big ? 23 : 19, lh: big ? 33 : 27, color: "#555555" }); parts.push(b); y += b.height; }
      return { x, parts, h: y };
    });
    const ch = Math.max(...groups.map(g => g.h)) + 2 * pad;
    const nodes = [];
    groups.forEach(g => {
      const bg = rect(f, g.x, 0, cw, ch, { fill: THEME.card, stroke: THEME.border });
      f.insertChild(0, bg);
      g.parts.forEach(p => { p.y += pad; });
      nodes.push(bg, ...g.parts);
    });
    if (s.note) nodes.push(text(f, s.note, { x: M, y: ch + 32, w: CW, size: 23, lh: 33, color: "#888888" }));
    centerIn(nodes, top + 40, BAND_BOTTOM);
    footer(f);
    return f;
  },

  // Таблица: cols — ширины столбцов в px (в сумме CW = W - 2*M), headers — необязательно.
  table(s) {
    const f = slide(s.name);
    const top = header(f, s.title, s.sub);
    const cols = s.cols, padY = s.dense ? 14 : 18, size = s.size || 22;
    const sum = cols.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - CW) > 1) WARNINGS.push(`«${CURRENT}»: сумма cols ${sum}px, а ширина контента ${CW}px`);
    const xs = []; let acc = M;
    cols.forEach(w => { xs.push(acc); acc += w; });
    const nodes = [];
    let y = 0;
    if (s.headers) {
      const hs = s.headers.map((h, i) => text(f, h, { x: xs[i], y, w: cols[i] - 24, size: 12, weight: 700, ls: 1.8, upper: true, color: THEME.faint }));
      nodes.push(...hs);
      y += Math.max(...hs.map(t => t.height)) + 12;
    }
    s.rows.forEach((row, ri) => {
      nodes.push(rect(f, M, y, CW, 1, { fill: THEME.line }));
      const cells = row.map((c, i) => text(f, c, {
        x: xs[i], y: y + padY, w: cols[i] - 28, size, lh: size + 10,
        weight: i === 0 ? 700 : 400, color: i === 0 ? THEME.fg : THEME.text,
      }));
      const rh = Math.max(...cells.map(t => t.height)) + 2 * padY;
      if (s.highlight === ri) { const hl = rect(f, M - 16, y + 1, CW + 32, rh - 1, { fill: THEME.okSoft }); f.insertChild(0, hl); nodes.push(hl); }
      nodes.push(...cells);
      y += rh;
    });
    nodes.push(rect(f, M, y, CW, 1, { fill: THEME.line }));
    centerIn(nodes, top + 40, BAND_BOTTOM);
    footer(f);
    return f;
  },

  // Две плашки рядом: left/right = { label, text }; strong — обвести правую.
  compare(s) {
    const f = slide(s.name);
    const top = header(f, s.title, s.sub);
    const gap = 24, cw = (CW - gap) / 2, pad = 32;
    const sides = [s.left, s.right].map((side, i) => {
      const x = M + i * (cw + gap);
      const l = text(f, side.label, { x: x + pad, y: 0, w: cw - 2 * pad, size: 14, weight: 700, ls: 1.8, upper: true, color: i === 1 && s.strong ? "#000000" : "#8a8a8a" });
      const b = text(f, side.text, { x: x + pad, y: l.height + 14, w: cw - 2 * pad, size: 26, lh: 38, color: THEME.text });
      return { x, l, b, h: b.y + b.height };
    });
    const ch = Math.max(...sides.map(sd => sd.h)) + 2 * pad;
    const nodes = [];
    sides.forEach((sd, i) => {
      const bg = rect(f, sd.x, 0, cw, ch, { fill: THEME.cardAlt, radius: 16, stroke: i === 1 && s.strong ? "#0a0a0a" : null });
      f.insertChild(0, bg);
      sd.l.y += pad; sd.b.y += pad;
      nodes.push(bg, sd.l, sd.b);
    });
    if (s.note) nodes.push(text(f, s.note, { x: M, y: ch + 32, w: CW, size: 23, lh: 33, color: "#888888" }));
    centerIn(nodes, top + 40, BAND_BOTTOM);
    footer(f);
    return f;
  },

  // Шаги со стрелками: 3–5 шагов, accent — номер шага (с 0), обведённого зелёным.
  flow(s) {
    const f = slide(s.name);
    const top = header(f, s.title, s.sub);
    const n = s.steps.length, arrow = n >= 5 ? 44 : 56, bw = (CW - arrow * (n - 1)) / n, pad = 22;
    const parts = s.steps.map((st, i) => {
      const x = M + i * (bw + arrow);
      const k = text(f, "Шаг " + (i + 1), { x: x + pad, y: 0, size: 12, weight: 700, ls: 1.8, upper: true, color: THEME.faint });
      const b = text(f, st, { x: x + pad, y: k.height + 12, w: bw - 2 * pad, size: n >= 5 ? 22 : 26, weight: 700, lh: n >= 5 ? 29 : 34 });
      return { x, k, b, h: b.y + b.height };
    });
    const bh = Math.max(...parts.map(p => p.h)) + 2 * pad;
    const nodes = [];
    parts.forEach((p, i) => {
      const bg = rect(f, p.x, 0, bw, bh, { fill: "#ffffff", stroke: i === s.accent ? THEME.ok : THEME.fg, sw: 1.5, radius: 8 });
      f.insertChild(0, bg);
      p.k.y += pad; p.b.y += pad;
      nodes.push(bg, p.k, p.b);
      if (i < n - 1) {
        const a = text(f, "→", { size: 40, lh: 48, color: "#cccccc" });
        a.x = p.x + bw + (arrow - a.width) / 2; a.y = (bh - a.height) / 2;
        nodes.push(a);
      }
    });
    if (s.note) nodes.push(text(f, s.note, { x: M, y: bh + 36, w: CW, size: 24, lh: 34, color: THEME.muted }));
    centerIn(nodes, top + 40, BAND_BOTTOM);
    footer(f);
    return f;
  },

  // Определение: крупный номер (num), заголовок слева, определение (def) и выноска справа.
  definition(s) {
    const f = slide(s.name);
    const left = [];
    if (s.num) left.push(text(f, s.num, { x: M, y: 0, size: 160, weight: 900, lh: 136, ls: -8, color: "#ececec" }));
    left.push(text(f, s.title, { x: M, y: s.num ? 148 : 0, w: 360, size: 45, weight: 700, lh: 50, ls: -0.96 }));
    const rx = M + 412, rw = W - M - rx;
    const d = text(f, s.def, { x: rx + 26, y: 4, w: rw - 40, size: 28, weight: 500, lh: 39 });
    const right = [rect(f, rx, 0, 3, d.height + 8, { fill: THEME.fg }), d];
    if (s.callout) {
      const cy = d.height + 32;
      const l = text(f, s.calloutLabel || "", { x: rx + 24, y: cy + 20, w: rw - 48, size: 11, weight: 700, ls: 2.2, upper: true, color: THEME.faint });
      const c = text(f, s.callout, { x: rx + 24, y: l.y + l.height + 10, w: rw - 48, size: 21, lh: 32, color: "#555555" });
      const ch = c.y + c.height + 20 - cy;
      const bg = rect(f, rx, cy, rw, ch, { fill: THEME.card });
      const cb = rect(f, rx, cy, 3, ch, { fill: "#aaaaaa" });
      f.insertChild(0, bg);
      right.push(bg, cb, l, c);
    }
    centerIn(left, 120, BAND_BOTTOM);
    centerIn(right, 120, BAND_BOTTOM);
    footer(f);
    return f;
  },

  // Блоки кода: blocks = [{ label?, code }], 1 или 2 штуки.
  code(s) {
    const f = slide(s.name);
    const top = header(f, s.title, s.sub);
    const n = s.blocks.length, gap = 24, bw = n === 1 ? 900 : (CW - gap) / 2, size = s.size || 26;
    const x0 = n === 1 ? (W - bw) / 2 : M;
    const nodes = [];
    s.blocks.forEach((b, i) => {
      const x = x0 + i * (bw + gap);
      let y = 0;
      if (b.label) { const l = text(f, b.label, { x, y, size: 13, weight: 700, ls: 1.8, upper: true, color: "#8a8a8a" }); nodes.push(l); y += l.height + 12; }
      const c = text(f, b.code, { family: THEME.monoFont, x: x + 36, y: y + 32, w: bw - 72, size, lh: size * 1.6, color: "#222222" });
      const bg = rect(f, x, y, bw, c.height + 64, { fill: THEME.cardAlt });
      const bar = rect(f, x, y, 3, c.height + 64, { fill: THEME.fg });
      f.insertChild(0, bg); f.insertChild(1, bar);
      nodes.push(bg, bar, c);
    });
    if (s.note) {
      const bottom = Math.max(...nodes.map(nd => nd.y + nd.height));
      nodes.push(text(f, s.note, { x: M, y: bottom + 36, w: CW, size: 24, lh: 34, color: THEME.muted }));
    }
    centerIn(nodes, top + 40, BAND_BOTTOM);
    footer(f);
    return f;
  },

  // Квиз: q, 4 варианта, correct — индекс верного (с 0). answer: true — слайд ответа.
  // Делайте парой (вопрос и ответ с одинаковыми данными): карточки стоят на одном месте.
  quiz(s) {
    const f = slide(s.name);
    const q = text(f, s.q, { x: M, y: 0, w: CW, size: 39, weight: 700, lh: 48, ls: -0.8, align: "CENTER" });
    const letters = ["А", "Б", "В", "Г"], cw = 483, gap = 14, x0 = (W - 2 * cw - gap) / 2;
    const nodes = [q];
    let rowY = q.height + 52;
    for (let r = 0; r < 2; r++) {
      const cells = [0, 1].map(c => {
        const i = r * 2 + c, x = x0 + c * (cw + gap), ok = s.answer && i === s.correct;
        const l = text(f, letters[i], { x: x + 29, y: 0, size: 18, weight: 900, color: ok ? THEME.ok : THEME.faint });
        const t = text(f, s.options[i], { x: x + 71, y: 0, w: cw - 100, size: 19, weight: ok ? 700 : 400, lh: 27 });
        return { x, ok, l, t };
      });
      const ch = Math.max(77, ...cells.map(c => c.t.height + 50));
      cells.forEach(c => {
        const bg = rect(f, c.x, rowY, cw, ch, { fill: c.ok ? THEME.okSoft : "#ffffff", stroke: c.ok ? THEME.ok : "#e0e0e0" });
        f.insertChild(0, bg);
        c.t.y = rowY + (ch - c.t.height) / 2;
        c.l.y = rowY + (ch - c.l.height) / 2;
        nodes.push(bg, c.l, c.t);
      });
      rowY += ch + gap;
    }
    // Подсказку учитываем и на слайде ответа, чтобы вопрос и карточки не сдвигались.
    const hint = text(f, s.hint || "напишите букву в чат", { y: rowY + 22, size: 12.8, ls: 1.95, upper: true, color: THEME.faint });
    hint.x = (W - hint.width) / 2;
    nodes.push(hint);
    centerIn(nodes, 0, H);
    if (s.answer) hint.remove();
    return f;
  },

  // История-пример: подпись, заголовок, что случилось, вывод в зелёной плашке, источник в подписи.
  story(s) {
    const f = slide(s.name);
    const l = text(f, s.label, { x: M, y: 0, size: 14, weight: 700, ls: 1.95, upper: true, color: THEME.faint });
    const t = text(f, s.title, { x: M, y: l.height + 16, w: 1100, size: 56, weight: 900, lh: 62, ls: -1.6 });
    const b = text(f, s.text, { x: M, y: t.y + t.height + 28, w: 1100, size: 26, lh: 38, color: "#444444" });
    const boxY = b.y + b.height + 40;
    const k = text(f, s.lessonLabel || "Вывод", { x: M + 36, y: boxY + 28, size: 13, weight: 700, ls: 1.95, upper: true, color: THEME.ok });
    const c = text(f, s.lesson, { x: M + 36, y: k.y + k.height + 10, w: CW - 72, size: 28, weight: 700, lh: 38 });
    const bh = c.y + c.height + 28 - boxY;
    const bg = rect(f, M, boxY, CW, bh, { fill: THEME.okSoft });
    const bar = rect(f, M, boxY, 4, bh, { fill: THEME.ok });
    f.insertChild(0, bg); f.insertChild(1, bar);
    centerIn([l, t, b, bg, bar, k, c], 40, H - 110);
    footer(f, s.source ? "Источник: " + s.source : undefined);
    return f;
  },

  // Команда → что на входе и что получится, в большой серой карточке.
  example(s) {
    const f = slide(s.name);
    text(f, s.title, { x: M, y: 72, w: CW, size: 62, weight: 700, lh: 64, ls: -1.6 });
    const card = rect(f, M, 168, CW, H - 300, { fill: THEME.card, stroke: THEME.border });
    const cmd = text(f, s.command, { size: 44, weight: 700, lh: 52 });
    const arrow = text(f, "→", { size: 48, lh: 58, color: "#cccccc" });
    const inp = text(f, s.input, { w: 560, size: 24, lh: 30, color: "#999999" });
    const out = text(f, s.output, { w: 560, size: 36, weight: 700, lh: 44 });
    const total = cmd.width + 48 + arrow.width + 48 + 560;
    if (total > CW - 40) WARNINGS.push(`«${CURRENT}»: команда «${s.command}» слишком длинная для карточки`);
    cmd.x = M + (CW - total) / 2;
    arrow.x = cmd.x + cmd.width + 48;
    inp.x = out.x = arrow.x + arrow.width + 48;
    const midY = card.y + card.height / 2, colH = inp.height + 10 + out.height;
    cmd.y = midY - cmd.height / 2;
    arrow.y = midY - arrow.height / 2;
    inp.y = midY - colH / 2; out.y = inp.y + inp.height + 10;
    footer(f, s.footnote);
    return f;
  },

  // Копия готового слайда из этого же файла: id (из ссылки на фрейм, node-id=12-345 → "12:345")
  // или ref (точное имя фрейма). edits: [[начало старого текста, новый текст, { w }?], …].
  // fit: "#ffffff" — вписать слайд другого размера в W×H с этим фоном.
  async clone(s) {
    const src = s.ref
      ? figma.currentPage.findOne(n => n.type === "FRAME" && n.name === s.ref)
      : await figma.getNodeByIdAsync(s.id);
    if (!src) throw new Error("нет шаблона " + (s.ref || s.id) + " для слайда «" + s.name + "»");
    const f = src.clone();
    f.name = s.name;
    for (const [find, repl, opt] of s.edits || []) {
      const hits = f.findAll(n => n.type === "TEXT" && n.characters.replace(/\s+/g, " ").trim().startsWith(find));
      if (!hits.length) throw new Error("в шаблоне «" + (s.ref || s.id) + "» нет текста, начинающегося с «" + find + "»");
      for (const t of hits) {
        await Promise.all(t.getRangeAllFontNames(0, t.characters.length).map(fn => figma.loadFontAsync(fn)));
        const align = t.textAlignHorizontal, x0 = t.x, w0 = t.width;
        if (opt && opt.w) { t.textAutoResize = "HEIGHT"; t.characters = repl; t.resize(opt.w, t.height); }
        else if (t.textAutoResize === "WIDTH_AND_HEIGHT") { t.characters = repl; }
        else { t.textAutoResize = "HEIGHT"; t.characters = repl; }
        // Подписи на схемах держим на месте: по центру, правому или левому краю.
        if (t.textAutoResize === "WIDTH_AND_HEIGHT") {
          if (align === "CENTER") t.x = x0 + (w0 - t.width) / 2;
          else if (align === "RIGHT") t.x = x0 + w0 - t.width;
        }
      }
    }
    if (s.fit && (f.width !== W || f.height !== H)) {
      const box = slide(s.name, s.fit);
      box.appendChild(f);
      f.rescale(Math.min(W / f.width, H / f.height));
      f.x = Math.round((W - f.width) / 2); f.y = Math.round((H - f.height) / 2);
      return box;
    }
    return f;
  },
};

// ======================= сборка =======================
async function loadFonts() {
  for (const [family, style] of FONTS) {
    try { await figma.loadFontAsync({ family, style }); }
    catch (e) { throw new Error("в Figma нет шрифта " + family + " " + style + " — поменяйте его в THEME"); }
  }
}

async function build(deck, index) {
  FOOTER = deck.footer || "";
  const page = figma.currentPage;
  page.children.filter(n => n.type === "SECTION" && n.name === deck.section).forEach(n => n.remove());

  const frames = [];
  for (let i = 0; i < deck.slides.length; i++) {
    const s = Object.assign({}, deck.slides[i]);
    s.name = (deck.prefix ? deck.prefix + " · " : "") + String(i + 1).padStart(2, "0") + " " + s.name;
    CURRENT = s.name;
    const make = LAYOUTS[s.type];
    if (!make) throw new Error("неизвестный макет «" + s.type + "» у слайда «" + s.name + "»");
    const f = await make(s);
    // Слишком много текста: что-то вылезло за край слайда и будет обрезано.
    if (s.type !== "clone") {
      const out = f.findAll(n => n.x < -1 || n.y < -1 || n.x + n.width > f.width + 1 || n.y + n.height > f.height + 1);
      if (out.length) WARNINGS.push(`«${s.name}»: ${out.length} элемент(ов) за краем слайда — сократите текст или разбейте слайд на два`);
    }
    frames.push(f);
  }

  const gap = 160, pad = 200;
  const section = figma.createSection();
  section.name = deck.section;
  page.appendChild(section);
  let x = pad;
  const maxH = Math.max(...frames.map(f => f.height));
  frames.forEach(f => { section.appendChild(f); f.x = x; f.y = pad; x += f.width + gap; });
  section.resizeWithoutConstraints(x - gap + pad, maxH + 2 * pad);

  // Колоды стоят столбиком в порядке DECKS: пересборка одной не меняет порядок.
  const first = page.children.find(n => n.type === "SECTION" && n.name === DECKS[0].section && n !== section);
  if (first && index > 0) {
    section.x = first.x; section.y = first.y + index * (maxH + 2 * pad + 700);
  } else {
    const others = page.children.filter(n => n !== section);
    section.x = others.length ? Math.min(...others.map(n => n.x)) : 0;
    section.y = others.length ? Math.max(...others.map(n => n.y + n.height)) + 1500 : 0;
  }
  return { section, count: frames.length };
}

// ======================= данные: замените на свои =======================
// Пример колоды на вымышленную тему — по слайду на каждый макет. Замените своими данными.
// Поля макетов — в references/layouts.md.
const DECKS = [
  {
    section: "Пример · Короткие встречи",
    prefix: "П",
    footer: "Пример · Демо-колода",
    slides: [
      { type: "cover", name: "Обложка", top: "Демо-колода", title: "Как проводить короткие рабочие встречи" },
      { type: "statement", name: "Фраза", text: "Встреча без повестки — это просто разговор", sub: "Повестку рассылаем за день до встречи" },
      { type: "quiz", name: "Квиз", q: "Сколько вопросов брать на получасовую встречу?", correct: 1, options: [
        "Сколько успеем", "Не больше трёх", "Ни одного, обсудим по ходу", "Все из списка задач"] },
      { type: "quiz", name: "Ответ", answer: true, q: "Сколько вопросов брать на получасовую встречу?", correct: 1, options: [
        "Сколько успеем", "Не больше трёх", "Ни одного, обсудим по ходу", "Все из списка задач"] },
      { type: "cards", name: "Карточки", title: "Что делает встречу полезной.", items: [
        { n: "01", h: "Повестка заранее", t: "Участники знают, что решаем" },
        { n: "02", h: "Один ведущий", t: "Следит за временем и темой" },
        { n: "03", h: "Итог письменно", t: "Решения, ответственные, сроки" },
      ] },
      { type: "table", name: "Таблица", title: "Статус или решение.", headers: ["", "Статус", "Решение"], cols: [300, 474, 474], rows: [
        ["Формат", "Письмо или сообщение в чате", "Встреча"],
        ["Участники", "Вся команда", "Только те, кто принимает решение"],
      ] },
      { type: "flow", name: "Шаги", title: "Как готовить встречу.", accent: 3,
        steps: ["Сформулировать вопрос", "Собрать данные", "Разослать повестку", "Записать итог"],
        note: "Если вопроса нет, встреча не нужна." },
      { type: "compare", name: "Сравнение", title: "Устно или письменно.", strong: true,
        left: { label: "Устно", text: "Договорённости легко забыть или понять по-разному." },
        right: { label: "Письменно", text: "Каждый видит, что решили и кто отвечает." } },
      { type: "definition", name: "Определение", num: "01", title: "Что такое\nповестка.",
        def: "Список вопросов, по которым встреча должна принять решение.",
        calloutLabel: "Думайте о повестке как о", callout: "Маршруте: без него легко свернуть в обсуждение всего подряд." },
      { type: "code", name: "Код", title: "Шаблон итога встречи.", blocks: [{ label: "Markdown", code: "## Итог встречи\n- Решение: …\n- Кто делает: …\n- Срок: …" }] },
      { type: "example", name: "Команда", title: "Команда для агента.", command: "/meeting-summary", input: "заметки со встречи", output: "Список решений и задач" },
      { type: "story", name: "История", label: "Вымышленный пример", title: "Час обсуждали, итога нет.",
        text: "Команда обсудила запуск, но не записала решения. Через неделю каждый помнил своё.",
        lesson: "Записывайте итог прямо на встрече и рассылайте сразу после неё.", source: "вымышленный пример" },
      { type: "way", name: "Плашка", label: "Способ №1", title: "Просто попросить.", box: "сделай итог встречи", accent: "#dd4444" },
      { type: "section", name: "Раздел", label: "Часть 2", title: "Практика." },
    ],
  },
];

// Какие колоды собирать при запуске: индексы в DECKS. Готовые колоды убирайте из списка,
// чтобы не стереть ручные правки в них.
const RUN = [0];

// ======================= запуск =======================
(async () => {
  await loadFonts();
  const done = [];
  let last = null;
  for (const i of RUN) {
    const r = await build(DECKS[i], i);
    done.push(DECKS[i].section + ": " + r.count);
    last = r.section;
  }
  if (last) figma.viewport.scrollAndZoomIntoView([last]);
  const msg = "Готово — " + done.join(", ") + " слайдов";
  if (WARNINGS.length) {
    console.warn(WARNINGS.join("\n"));
    return msg + ". ⚠ Предупреждений: " + WARNINGS.length + ". Первое: " + WARNINGS[0];
  }
  return msg + ". Предупреждений нет";
})()
  .then(msg => figma.closePlugin(msg))
  .catch(e => figma.closePlugin("Ошибка: " + (e && e.message ? e.message : e)));
