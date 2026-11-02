/* Portable SVG charts; coordinates and range conventions match SheetChart. */
(function (root) {
  "use strict";
  const palette = [
    "#4472c4",
    "#ed7d31",
    "#a5a5a5",
    "#ffc000",
    "#5b9bd5",
    "#70ad47",
    "#264478",
    "#9e480e",
    "#636363",
    "#997300",
  ];
  const finite = (n, f = 0) => (Number.isFinite(n) ? n : f);
  function column(n) {
    let s = "";
    for (n++; n; n = Math.floor((n - 1) / 26))
      s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }
  function range(text) {
    const m = /^\$?([A-Z]+)\$?([1-9]\d*)(?::\$?([A-Z]+)\$?([1-9]\d*))?$/i.exec(
      String(text),
    );
    if (!m) return null;
    const c = (s) =>
      [...s.toUpperCase()].reduce((n, x) => n * 26 + x.charCodeAt(0) - 64, 0) -
      1;
    const a = { c: c(m[1]), r: Number(m[2]) - 1 },
      b = { c: c(m[3] || m[1]), r: Number(m[4] || m[2]) - 1 };
    if (Math.max(a.c, b.c) > 16383 || Math.max(a.r, b.r) > 1048575) return null;
    return {
      c0: Math.min(a.c, b.c),
      r0: Math.min(a.r, b.r),
      c1: Math.max(a.c, b.c),
      r1: Math.max(a.r, b.r),
    };
  }
  function numeric(value) {
    if (typeof value === "boolean") return +value;
    if (typeof value === "number") return finite(value);
    if (typeof value !== "string") return 0;
    let t = value.trim(),
      sign = 1;
    if (t.startsWith("(") && t.endsWith(")")) {
      sign = -1;
      t = t.slice(1, -1);
    }
    const percent = t.endsWith("%");
    if (percent) t = t.slice(0, -1);
    t = t.replace(/^[$₩€£¥]/, "").replace(/,/g, "");
    return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(t)
      ? finite((Number(t) * sign) / (percent ? 100 : 1))
      : 0;
  }
  function cellValue(sheet, calculated, address) {
    const v = calculated[address];
    if (v) {
      return {
        type: v.type,
        value: v.value,
        display: String(v.display ?? v.value ?? ""),
      };
    }
    const input = String(sheet.cells?.[address]?.input ?? "");
    if (input.startsWith("=")) return { type: "empty", value: 0, display: "" };
    if (input.startsWith("'"))
      return { type: "string", value: input.slice(1), display: input.slice(1) };
    if (!input) return { type: "empty", value: 0, display: "" };
    if (/^(TRUE|FALSE)$/i.test(input))
      return {
        type: "boolean",
        value: input.toUpperCase() === "TRUE",
        display: input,
      };
    const n = numeric(input);
    const isNumber = n !== 0 || /^[\s$₩€£¥()+\-0.,%eE]+$/.test(input);
    return {
      type: isNumber ? "number" : "string",
      value: isNumber ? n : input,
      display: input,
    };
  }
  function resolveChart(chart, sheet, calculated = {}) {
    const r = range(chart.range);
    if (!r || (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1) > 100000)
      return { categories: [], series: [] };
    const v = (row, col) =>
      cellValue(sheet, calculated, column(col) + (row + 1));
    let header = false,
      label = false;
    for (let c = r.c0; c <= r.c1; c++)
      if (r.r1 > r.r0 && v(r.r0, c).type === "string") header = true;
    for (let row = r.r0 + Number(header); row <= r.r1; row++)
      if (r.c1 > r.c0 && v(row, r.c0).type === "string") label = true;
    const categories = [],
      series = [];
    for (let row = r.r0 + Number(header); row <= r.r1; row++)
      categories.push(
        label ? v(row, r.c0).display : String(categories.length + 1),
      );
    for (let c = r.c0 + Number(label); c <= r.c1; c++) {
      const values = [];
      for (let row = r.r0 + Number(header); row <= r.r1; row++) {
        const value = v(row, c);
        values.push(value.type === "error" ? 0 : numeric(value.value));
      }
      series.push({
        name: header ? v(r.r0, c).display : "계열 " + (series.length + 1),
        values,
      });
    }
    return { categories, series };
  }
  function geometry(chart, { originX = 0, originY = 0, scale = 1 } = {}) {
    scale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return {
      x: finite(originX) + finite(chart.x) * scale,
      y: finite(originY) + finite(chart.y) * scale,
      w: Math.max(1, finite(chart.width, 420)) * scale,
      h: Math.max(1, finite(chart.height, 260)) * scale,
    };
  }
  function domain(series) {
    let magnitude = 0;
    for (const s of series)
      for (const v of s.values)
        magnitude = Math.max(magnitude, Math.abs(finite(v)));
    if (!magnitude) magnitude = 1;
    let lo = 0,
      hi = 0;
    for (const s of series)
      for (const v of s.values) {
        lo = Math.min(lo, finite(v) / magnitude);
        hi = Math.max(hi, finite(v) / magnitude);
      }
    if (lo === hi) hi = 1;
    return { lo, hi, magnitude };
  }
  function renderChart(chart, sheet, calculated = {}, doc = root.document) {
    const w = Math.max(1, finite(chart.width, 420)),
      h = Math.max(1, finite(chart.height, 260));
    const node = (tag, attrs = {}, text) => {
      const n = doc.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const svg = node("svg", {
      viewBox: `0 0 ${w} ${h}`,
      width: "100%",
      height: "100%",
      role: "img",
      "aria-label": chart.title || chart.kind + " " + chart.range,
    });
    const add = (tag, a, t) => {
      const n = node(tag, a, t);
      svg.append(n);
      return n;
    };
    const text = (x, y, t, a = {}) =>
      add(
        "text",
        {
          x,
          y,
          fill: "#555",
          "font-size": 10,
          "font-family": "sans-serif",
          ...a,
        },
        t,
      );
    add("title", {}, chart.title || chart.range);
    add("rect", { width: w, height: h, rx: 4, fill: "white", stroke: "#ccc" });
    if (chart.title)
      text(w / 2, 24, chart.title, {
        "text-anchor": "middle",
        "font-size": 14,
        "font-weight": "bold",
      });
    const { categories, series } = resolveChart(chart, sheet, calculated);
    if (!categories.length || !series.length) {
      text(w / 2, h / 2, "데이터 없음", { "text-anchor": "middle" });
      return svg;
    }
    const top = chart.title ? 40 : 18,
      bottom = h - 42;
    const legends =
      chart.kind === "pie" ? categories : series.map((s) => s.name);
    const legendY = h - 16;
    const slot = (w - 24) / legends.length;
    legends.forEach((name, i) => {
      add("rect", {
        x: 12 + i * slot,
        y: legendY - 9,
        width: 8,
        height: 8,
        fill: palette[i % palette.length],
      });
      const n = text(
        24 + i * slot,
        legendY,
        String(name).slice(0, Math.max(1, Math.floor((slot - 20) / 6))),
      );
      n.append(node("title", {}, name));
    });
    if (chart.kind === "pie") {
      const values = series[0].values.map((v) => Math.max(0, v));
      const max = values.reduce(
          (highest, value) => Math.max(highest, value),
          0,
        ),
        sum = max ? values.reduce((s, v) => s + v / max, 0) : 0;
      const cx = w / 2,
        cy = (top + bottom) / 2,
        r = Math.max(1, Math.min(w - 30, bottom - top) / 2);
      let angle = -Math.PI / 2;
      values.forEach((v, i) => {
        if (!v || !sum) return;
        const fraction = v / max / sum,
          sweep = fraction * Math.PI * 2;
        let n;
        if (fraction >= 1 - 1e-12)
          n = add("circle", { cx, cy, r, fill: palette[i % palette.length] });
        else {
          const end = angle + sweep;
          n = add("path", {
            d: `M ${cx} ${cy} L ${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)} Z`,
            fill: palette[i % palette.length],
            stroke: "white",
          });
        }
        n.append(node("title", {}, `${categories[i]}: ${v}`));
        if (fraction > 0.04)
          text(
            cx + r * 0.64 * Math.cos(angle + sweep / 2),
            cy + r * 0.64 * Math.sin(angle + sweep / 2),
            Math.round(fraction * 100) + "%",
            { fill: "white", "text-anchor": "middle" },
          );
        angle += sweep;
      });
      return svg;
    }
    const horizontal = chart.kind === "bar",
      left = horizontal ? Math.min(100, w * 0.25) : 54,
      right = Math.max(left + 1, w - 16),
      low = Math.max(top + 1, bottom - 18);
    const d = domain(series),
      pos = (v) => {
        const t = (finite(v) / d.magnitude - d.lo) / (d.hi - d.lo);
        return horizontal ? left + t * (right - left) : low - t * (low - top);
      };
    const zero = pos(0);
    for (let i = 0; i <= 5; i++) {
      const v = d.lo + ((d.hi - d.lo) * i) / 5,
        p = horizontal
          ? left + ((right - left) * i) / 5
          : low - ((low - top) * i) / 5;
      add(
        "line",
        horizontal
          ? { x1: p, x2: p, y1: top, y2: low, stroke: "#e6e6e6" }
          : { x1: left, x2: right, y1: p, y2: p, stroke: "#e6e6e6" },
      );
      text(
        horizontal ? p : left - 6,
        horizontal ? low + 14 : p + 3,
        Number((v * d.magnitude).toPrecision(4)).toString(),
        { "text-anchor": horizontal ? "middle" : "end" },
      );
    }
    const band = (horizontal ? low - top : right - left) / categories.length;
    categories.forEach((cat, i) =>
      text(
        horizontal ? left - 6 : left + band * (i + 0.5),
        horizontal ? top + band * (i + 0.5) + 3 : low + 14,
        String(cat).slice(
          0,
          horizontal ? 14 : Math.max(1, Math.floor(band / 6)),
        ),
        { "text-anchor": horizontal ? "end" : "middle" },
      ),
    );
    series.forEach((s, j) => {
      const color = palette[j % palette.length];
      if (chart.kind === "column" || horizontal) {
        s.values.forEach((v, i) => {
          const p = pos(v),
            size = (band * 0.7) / series.length,
            start = (horizontal ? top : left) + band * (i + 0.15) + size * j;
          const rect = add(
            "rect",
            horizontal
              ? {
                  x: Math.min(zero, p),
                  y: start,
                  width: Math.abs(p - zero),
                  height: size,
                  fill: color,
                }
              : {
                  x: start,
                  y: Math.min(zero, p),
                  width: size,
                  height: Math.abs(p - zero),
                  fill: color,
                },
          );
          rect.append(node("title", {}, `${s.name} / ${categories[i]}: ${v}`));
        });
      } else {
        const points = s.values.map((v, i) => [
          left + band * (i + 0.5),
          pos(v),
        ]);
        if (chart.kind === "area")
          add("path", {
            d: `M ${points[0][0]} ${zero} L ${points.map((p) => p.join(" ")).join(" L ")} L ${points.at(-1)[0]} ${zero} Z`,
            fill: color,
            "fill-opacity": 0.3,
          });
        add("polyline", {
          points: points.map((p) => p.join(",")).join(" "),
          fill: "none",
          stroke: color,
          "stroke-width": 2,
        });
        points.forEach((p, i) => {
          const n = add("circle", { cx: p[0], cy: p[1], r: 3, fill: color });
          n.append(
            node("title", {}, `${s.name} / ${categories[i]}: ${s.values[i]}`),
          );
        });
      }
    });
    return svg;
  }
  function renderCharts(ctx) {
    const doc = ctx.document || root.document,
      sheet = ctx.sheet || ctx.model?.sheets?.[ctx.sheetIndex || 0] || {},
      layer = doc.createElement("div");
    layer.className = "sheet-charts";
    Object.assign(layer.style, {
      position: "absolute",
      left: "0",
      top: "0",
      pointerEvents: "none",
    });
    (sheet.charts || []).forEach((chart, index) => {
      const frame = geometry(chart, ctx),
        box = doc.createElement("div");
      box.className = "sheet-chart";
      box.dataset.chartIndex = String(index);
      Object.assign(box.style, {
        position: "absolute",
        left: frame.x + "px",
        top: frame.y + "px",
        width: frame.w + "px",
        height: frame.h + "px",
        pointerEvents: "auto",
      });
      box.append(renderChart(chart, sheet, ctx.calculated || {}, doc));
      if (ctx.onSelect) {
        box.tabIndex = 0;
        box.addEventListener("click", (e) => ctx.onSelect(index, chart, e));
        box.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            ctx.onSelect(index, chart, e);
          }
        });
      }
      layer.append(box);
    });
    return layer;
  }
  const api = {
    renderCharts,
    renderChart,
    resolveChart,
    geometry,
    domain,
    numeric,
    range,
  };
  if (typeof module !== "undefined") module.exports = api;
  root.HanXSheetCharts = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
