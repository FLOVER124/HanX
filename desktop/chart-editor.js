(function (root) {
  "use strict";
  const chartKinds = [
    ["column", "세로 막대"],
    ["bar", "가로 막대"],
    ["line", "꺾은선"],
    ["area", "영역"],
    ["pie", "원형"],
  ];

  function open(ctx, index = null) {
    const { model, selected, cellRange, el, edit } = ctx;
    const old = index === null ? null : model.sheets[selected].charts[index];
    const dialog = el("dialog", {
      class: "chart-editor",
      "aria-label": old ? "차트 편집" : "차트 삽입",
    });
    const form = el("form");
    const kind = el("select", { "aria-label": "차트 종류" });
    for (const [value, label] of chartKinds)
      kind.append(el("option", { value, text: label }));
    kind.value = old?.kind || "column";
    const input = (label, value, type = "text") =>
      el("input", { type, value, "aria-label": label });
    const title = input("차트 제목", old?.title || "");
    title.maxLength = 1024;
    const range = input("차트 데이터 범위", old?.range || cellRange || "A1");
    range.required = true;
    range.oninput = () => range.setCustomValidity("");
    function row(label, control) {
      form.append(el("label", {}, label, control));
    }
    form.append(el("h2", { text: old ? "차트 편집" : "차트 삽입" }));
    row("종류", kind);
    row("제목", title);
    row("데이터 범위", range);
    const size = {};
    for (const [key, label, initial] of [
      ["x", "가로 위치", 32],
      ["y", "세로 위치", 32],
      ["width", "너비", 420],
      ["height", "높이", 260],
    ]) {
      const control = input(label, old?.[key] ?? initial, "number");
      control.required = true;
      control.min = ["x", "y"].includes(key) ? "0" : "0.01";
      control.max = "100000";
      control.step = "any";
      size[key] = control;
      row(label + " (pt)", control);
    }
    const close = () => dialog.close();
    const actions = el("div", { class: "dialog-actions" });
    if (old)
      actions.append(
        el("button", {
          type: "button",
          text: "차트 삭제",
          onclick() {
            close();
            edit({ op: "delete_chart", sheet: selected, index });
          },
        }),
      );
    actions.append(
      el("button", { type: "button", text: "취소", onclick: close }),
      el("button", {
        type: "submit",
        class: "primary",
        text: old ? "적용" : "삽입",
      }),
    );
    form.append(actions);
    form.onsubmit = (event) => {
      event.preventDefault();
      let address;
      try {
        address = root.HanXAdvanced.range(range.value);
      } catch (error) {
        range.setCustomValidity(error.message);
        range.reportValidity();
        return;
      }
      const value = { kind: kind.value, title: title.value, range: address };
      for (const [key, control] of Object.entries(size))
        value[key] = control.valueAsNumber;
      close();
      edit(
        old
          ? { op: "update_chart", sheet: selected, index, value }
          : { op: "add_chart", sheet: selected, value },
      );
    };
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.append(form);
    root.document.body.append(dialog);
    dialog.showModal();
    range.focus();
    range.select();
  }
  root.HanXChartEditor = { open };
})(window);
