/* Pure geometry shared by the portable slide editor and source tests. */
(function (root) {
  const bounds = (shape) => {
    const f = shape.frame,
      a = ((shape.rotation || 0) * Math.PI) / 180,
      w = Math.abs(f.w * Math.cos(a)) + Math.abs(f.h * Math.sin(a)),
      h = Math.abs(f.w * Math.sin(a)) + Math.abs(f.h * Math.cos(a));
    return { x: f.x + (f.w - w) / 2, y: f.y + (f.h - h) / 2, w, h };
  };
  function arrange(shapes, ids, mode, width, height, slide) {
    const chosen = shapes
      .filter((s) => ids.has(s.id) && !s.locked)
      .map((s) => ({ s, b: bounds(s) }));
    if (!chosen.length) return [];
    const op = (item, dx, dy) => ({
      op: "update_shape",
      slide,
      shapeId: item.s.id,
      x: item.s.frame.x + dx,
      y: item.s.frame.y + dy,
    });
    if (mode === "horizontal" || mode === "vertical") {
      if (chosen.length < 3) return [];
      const axis = mode === "horizontal" ? "x" : "y",
        size = axis === "x" ? "w" : "h";
      chosen.sort((a, b) => a.b[axis] - b.b[axis]);
      const first = chosen[0],
        last = chosen.at(-1),
        gap =
          (last.b[axis] +
            last.b[size] -
            first.b[axis] -
            chosen.reduce((n, i) => n + i.b[size], 0)) /
          (chosen.length - 1);
      let cursor = first.b[axis];
      return chosen
        .map((item, index) => {
          const delta = cursor - item.b[axis];
          cursor += item.b[size] + gap;
          return index === 0 || index === chosen.length - 1
            ? null
            : op(item, axis === "x" ? delta : 0, axis === "y" ? delta : 0);
        })
        .filter(Boolean);
    }
    const left = Math.min(...chosen.map((i) => i.b.x)),
      top = Math.min(...chosen.map((i) => i.b.y)),
      right = Math.max(...chosen.map((i) => i.b.x + i.b.w)),
      bottom = Math.max(...chosen.map((i) => i.b.y + i.b.h));
    const target =
      chosen.length === 1
        ? { x: 0, y: 0, w: width, h: height }
        : { x: left, y: top, w: right - left, h: bottom - top };
    return chosen
      .map((i) => {
        let dx = 0,
          dy = 0;
        if (mode === "left") dx = target.x - i.b.x;
        else if (mode === "center")
          dx = target.x + target.w / 2 - i.b.x - i.b.w / 2;
        else if (mode === "right") dx = target.x + target.w - i.b.x - i.b.w;
        else if (mode === "top") dy = target.y - i.b.y;
        else if (mode === "middle")
          dy = target.y + target.h / 2 - i.b.y - i.b.h / 2;
        else if (mode === "bottom") dy = target.y + target.h - i.b.y - i.b.h;
        return op(i, dx, dy);
      })
      .filter((o) => {
        const s = shapes.find((s) => s.id === o.shapeId);
        return (
          Math.abs(o.x - s.frame.x) > 1e-9 || Math.abs(o.y - s.frame.y) > 1e-9
        );
      });
  }
  const api = { bounds, arrange };
  if (typeof module !== "undefined") module.exports = api;
  else root.HanXArrangement = api;
})(globalThis);
