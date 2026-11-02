(function (root) {
  "use strict";
  const A =
    typeof module !== "undefined"
      ? require("./advanced-ribbon.js")
      : root.HanXAdvanced;
  function sortOperation(sheet, selection, key, ascending, header) {
    if (!/^[A-Za-z]{1,3}$/.test(String(key).trim()))
      throw Error("정렬 기준은 A, B 같은 열 이름으로 입력하세요.");
    const range = A.range(selection),
      ends = range.split(":").map(A.address),
      column = A.address(String(key).trim().toUpperCase() + "1");
    if (
      column.col < Math.min(ends[0].col, ends.at(-1).col) ||
      column.col > Math.max(ends[0].col, ends.at(-1).col)
    )
      throw Error("정렬 기준 열은 선택 범위 안에 있어야 합니다.");
    if (typeof ascending !== "boolean" || typeof header !== "boolean")
      throw Error("정렬 설정을 확인하세요.");
    return {
      op: "sort_range",
      sheet,
      range,
      keyColumn: column.column,
      ascending,
      header,
    };
  }
  function fillOperation(sheet, selection, direction) {
    if (!["down", "right"].includes(direction))
      throw Error("채우기 방향을 선택하세요.");
    return { op: "fill_range", sheet, range: A.range(selection), direction };
  }
  function groups(ctx) {
    const {
      el,
      button,
      field,
      selectField,
      ribbonGroup,
      edit,
      selected,
      cellRange,
      cell,
    } = ctx;
    const range = field("데이터 범위", cellRange || cell || "A1", () => {}),
      key = field("정렬 기준 열", A.address(cell || "A1").column, () => {}),
      header = selectField(
        "첫 행 제목",
        [
          ["no", "제목 없음"],
          ["yes", "제목 유지"],
        ],
        "no",
        () => {},
      );
    const input = range.querySelector("input"),
      submit = (builder) => {
        try {
          const operation = builder();
          input.setCustomValidity("");
          edit(operation);
        } catch (error) {
          input.setCustomValidity(error.message);
          input.reportValidity();
        }
      };
    return [
      ribbonGroup("범위", range),
      ribbonGroup(
        "정렬",
        key,
        header,
        button("오름차순", () =>
          submit(() =>
            sortOperation(
              selected,
              input.value,
              key.querySelector("input").value,
              true,
              header.querySelector("select").value === "yes",
            ),
          ),
        ),
        button("내림차순", () =>
          submit(() =>
            sortOperation(
              selected,
              input.value,
              key.querySelector("input").value,
              false,
              header.querySelector("select").value === "yes",
            ),
          ),
        ),
      ),
      ribbonGroup(
        "채우기",
        button("아래로 채우기", () =>
          submit(() => fillOperation(selected, input.value, "down")),
        ),
        button("오른쪽으로 채우기", () =>
          submit(() => fillOperation(selected, input.value, "right")),
        ),
      ),
    ];
  }
  const api = { sortOperation, fillOperation, groups };
  if (typeof module !== "undefined") module.exports = api;
  else root.HanXSheetData = api;
})(typeof window !== "undefined" ? window : globalThis);
