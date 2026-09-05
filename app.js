/* ============================================================
   常闇トワ様配信データベース — Notion 風 wiki
   ============================================================ */

const state = {
  manifest: null,
  tables: new Map(),
  searchIndex: [],
  sort: { field: "", direction: "asc" },
};

/* ---------- テーブルごとの見た目設定 ---------- */
const tableMeta = {
  streams: { icon: "🎪", cover: "アーカイブ", coverStyle: "ink" },
  games: { icon: "🎮", cover: "ゲーム", coverStyle: "ink" },
  collaborators: { icon: "🤝", cover: "メンバー", coverStyle: "ink" },
  themes: { icon: "🎥", cover: "再生リスト", coverStyle: "ink" },
  units: { icon: "👥", cover: "ユニット", coverStyle: "ink" },
  unfinished_cases: { icon: "🔍", cover: "未解決事件", coverStyle: "ink" },
  shishiro_cup_sf6: { icon: "🥊", cover: "獅白杯", coverStyle: "ink" },
};
const homeMeta = { icon: "🌙", cover: "データベース", coverStyle: "photo" };

/* ホームとサイドバーに出さない表（データは残る。URL 直打ちでは見える） */
const hiddenTables = ["unfinished_cases", "shishiro_cup_sf6"];

/* リレーション欄（ページ参照チップとして描画） */
const relationFields = {
  streams: [
    { field: "ゲーム", target: "games" },
    { field: "コラボメンバー", target: "collaborators" },
    { field: "再生リスト", target: "themes" },
  ],
  themes: [
    { field: "ゲーム", target: "games" },
    { field: "コラボメンバー", target: "collaborators" },
  ],
  units: [{ field: "メンバー", target: "collaborators" }],
};

const reverseRelations = {
  games: [{ source: "streams", field: "ゲーム", label: "配信記録" }],
  collaborators: [
    { source: "streams", field: "コラボメンバー", label: "合作配信" },
    { source: "units", field: "メンバー", label: "ユニット" },
  ],
  themes: [{ source: "streams", field: "再生リスト", label: "配信記録" }],
};

const titleFields = {
  streams: "Name",
  games: "ゲーム名",
  collaborators: "名前",
  themes: "Name",
  units: "ユニット名",
  unfinished_cases: "Name",
  shishiro_cup_sf6: "Name",
};

/* タグ（select / multi-select）として描画する欄 */
const tagFields = {
  streams: ["ソロ/コラボ", "タイプ", "チャンネル"],
  themes: ["キーワード", "配信タイプ", "大会", "チーム名", "ハッシュタグ"],
  games: ["タイプ"],
  collaborators: ["グループ", "所属"],
  units: ["HushTag"],
};

/* フィルター対象欄（表ごと）。「年」は Date から導出する疑似欄 */
const filterFields = {
  /* T1b／A4：チャンネル・ソロ/コラボ・再生リスト の下拉拿掉（UI 移除，舊 hash 仍靠 matchesFieldFilters
     生效，不受此表影響，見⑥）；年・タイプ 兩欄改走 chip（streamsFilterBarHtml），
     ゲーム・コラボメンバー 改走 datalist 輸入框（gameMemberInputsHtml），此表僅供這兩支函式讀取順序 */
  streams: ["年", "タイプ", "ゲーム", "コラボメンバー"],
  games: ["タイプ"],
  collaborators: ["グループ", "所属"],
  themes: ["配信タイプ", "キーワード", "大会", "ゲーム", "コラボメンバー"],
  units: ["メンバー"],
};

/* Notion タグカラー割当（スクショに合わせた固定マップ＋ハッシュ） */
const TAG_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
const fixedTagColors = {
  // チャンネル
  "YouTube": "yellow", "Twitch": "purple", "Others": "orange", "SPWN": "pink",
  // タイプ
  "ゲーム": "green", "ゲーム大会": "yellow", "切り抜き": "yellow", "雑談": "orange",
  "企画": "yellow", "音楽": "yellow", "ミラー": "orange", "歌枠": "pink",
  "トワ様いるの": "orange", "トワ様いる（？）の": "orange", "Short": "blue",
  "ライブ": "purple", "ライブゲスト": "purple", "メン限": "red", "案件": "brown",
  "ラジオ": "brown", "同時視聴": "pink",
  // ソロ/コラボ
  "ソロ": "yellow", "コラボ": "orange",
  // キーワード
  "エンジョイ": "pink", "修行": "red", "ワイワイ": "blue", "まったり": "yellow",
  "カスタム": "gray", "大会": "yellow", "ホロ鯖": "green",
};

function tagColor(value) {
  if (fixedTagColors[value]) return fixedTagColors[value];
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length];
}

/* ---------- T1／A7・B2：欄幅（欄名→px、依表分別覆寫；未列出的表用預設） ---------- */
const columnWidths = {
  streams: {
    Name: 320,
    Date: 100,
    "ゲーム": 150,
    "ソロ/コラボ": 80,
    "ユニット": 120,
    "コラボメンバー": 260,
    "タイプ": 90,
    "イベント区分": 110,
    "イベント名": 150,
    "チャンネル": 90,
    "再生リスト": 160,
    "配信リンク": 180,
  },
};
const DEFAULT_COLUMN_WIDTH = 140;
const DEFAULT_TITLE_COLUMN_WIDTH = 320;

function columnWidth(slug, field, titleField) {
  const table = columnWidths[slug];
  if (table && table[field] != null) return table[field];
  return field === titleField ? DEFAULT_TITLE_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH;
}

/* ---------- T1b／A2：配信記録 タイプ 欄の六組合併（streams 専用、他表のタイプ欄には適用しない） ---------- */
const typeGroups = {
  "ゲーム": ["ゲーム"],
  "大会": ["ゲーム大会"],
  "雑談・歌": ["雑談", "歌枠", "音楽"],
  "ライブ": ["ライブ", "ライブゲスト"],
  "切り抜き・Short": ["切り抜き", "Short"],
  /* 上記以外（トワ様いるの、メン限、ミラー、同時視聴…）は「その他」に落ちる */
};
const TYPE_GROUP_ORDER = ["ゲーム", "大会", "雑談・歌", "ライブ", "切り抜き・Short", "その他"];

function typeGroupOf(rawValue) {
  for (const [group, members] of Object.entries(typeGroups)) {
    if (members.includes(rawValue)) return group;
  }
  return "その他";
}

/* ---------- DOM 参照 ---------- */
const app = document.querySelector("#app");
const tableNav = document.querySelector("#tableNav");
const globalSearch = document.querySelector("#globalSearch");
const breadcrumb = document.querySelector("#breadcrumb");
const topbarMeta = document.querySelector("#topbarMeta");

globalSearch.addEventListener("input", () => {
  if (globalSearch.value.trim()) {
    renderSearch(globalSearch.value.trim());
  } else {
    renderRoute();
  }
});

window.addEventListener("hashchange", renderRoute);

boot();

async function boot() {
  try {
    state.manifest = await fetchJson("data/manifest.json");
    await Promise.all(
      state.manifest.tables.map(async (table) => {
        state.tables.set(table.slug, await fetchJson(`data/${table.json}`));
      })
    );
    state.searchIndex = await fetchJson("data/search-index.json");
    renderNav();
    renderRoute();
  } catch (error) {
    app.innerHTML = `
      <div class="loading">
        データを読み込めませんでした。<br>
        <code>site/</code> フォルダで <code>python -m http.server 8787</code> を実行し、
        <code>http://127.0.0.1:8787/</code> を開いてください。
      </div>
    `;
  }
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Cannot load ${path}`);
  return response.json();
}

/* ---------- ナビゲーション ---------- */
function renderNav() {
  tableNav.innerHTML = "";
  const home = document.createElement("button");
  home.type = "button";
  home.className = "nav-button";
  home.dataset.slug = "";
  home.innerHTML = `<span class="nav-icon">🏠</span><span class="nav-label">ホーム</span>`;
  home.addEventListener("click", () => {
    globalSearch.value = "";
    location.hash = "#home";
  });
  tableNav.appendChild(home);

  state.manifest.tables.filter((table) => !hiddenTables.includes(table.slug)).forEach((table) => {
    const meta = tableMeta[table.slug] || { icon: "📄" };
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-button";
    button.dataset.slug = table.slug;
    button.innerHTML = `
      <span class="nav-icon">${meta.icon}</span>
      <span class="nav-label">${escapeHtml(table.table)}</span>
      <span class="nav-count">${table.row_count}</span>
    `;
    button.addEventListener("click", () => {
      globalSearch.value = "";
      location.hash = tableHash(table.slug);
    });
    tableNav.appendChild(button);
  });
}

function renderBreadcrumb(parts) {
  breadcrumb.innerHTML = "";
  const root = document.createElement("button");
  root.type = "button";
  root.className = "crumb";
  root.textContent = "🌙 常闇トワ様配信データベース";
  root.addEventListener("click", () => { globalSearch.value = ""; location.hash = "#home"; });
  breadcrumb.appendChild(root);
  parts.forEach((part) => {
    const sep = document.createElement("span");
    sep.className = "crumb-sep";
    sep.textContent = "/";
    breadcrumb.appendChild(sep);
    if (part.hash) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "crumb";
      btn.textContent = part.label;
      btn.addEventListener("click", () => { location.hash = part.hash; });
      breadcrumb.appendChild(btn);
    } else {
      const span = document.createElement("span");
      span.className = "crumb";
      span.textContent = part.label;
      breadcrumb.appendChild(span);
    }
  });
  topbarMeta.textContent = `最終更新 ${formatDateTime(state.manifest.generated_at)}`;
}

/* ---------- ルーティング ---------- */
function renderRoute() {
  const route = parseHash();
  updateNav(route.table);
  if (globalSearch.value.trim()) {
    renderSearch(globalSearch.value.trim());
    return;
  }
  if (route.view === "table" && route.table) {
    renderTable(route.table, route.filter || "", route.mode || "", route.month || "", route.fieldFilters || {});
    return;
  }
  if (route.view === "detail" && route.table && Number.isInteger(route.row)) {
    renderDetail(route.table, route.row);
    return;
  }
  renderHome();
}

function parseHash() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw || raw === "home") return { view: "home" };
  const params = new URLSearchParams(raw);
  const fieldFilters = {};
  params.forEach((value, key) => {
    if (key.startsWith("f_") && value) fieldFilters[key.slice(2)] = value;
  });
  return {
    view: params.get("view") || "home",
    table: params.get("table") || "",
    row: params.has("row") ? Number(params.get("row")) : null,
    filter: params.get("filter") || "",
    mode: params.get("mode") || "",
    month: params.get("month") || "",
    fieldFilters,
  };
}

function tableHash(slug, filter = "", mode = "", month = "", fieldFilters = {}) {
  const params = new URLSearchParams({ view: "table", table: slug });
  if (filter) params.set("filter", filter);
  if (mode) params.set("mode", mode);
  if (month) params.set("month", month);
  Object.entries(fieldFilters).forEach(([field, value]) => {
    if (value) params.set(`f_${field}`, value);
  });
  return `#${params.toString()}`;
}

function detailHash(slug, rowIndex) {
  return `#${new URLSearchParams({ view: "detail", table: slug, row: String(rowIndex) }).toString()}`;
}

function updateNav(activeSlug) {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.slug === (activeSlug || ""));
  });
}

/* ---------- ページヘッダー共通部品 ---------- */
function pageCover(meta) {
  const style = meta.coverStyle === "photo" ? "page-cover photo" : "page-cover";
  return `<div class="${style}"><span class="cover-word">${escapeHtml(meta.cover)}</span></div>`;
}

function pageHead(meta, title, props) {
  return `
    ${pageCover(meta)}
    <div class="page-head">
      <span class="page-icon">${meta.icon}</span>
      <h1 class="page-title">${escapeHtml(title)}</h1>
      <div class="page-props">
        ${props.map((prop) => `
          <div class="prop">
            <div class="prop-label">${prop.icon} ${escapeHtml(prop.label)}</div>
            <div class="prop-value${prop.value ? "" : " is-empty"}">${prop.value || "空"}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function defaultProps(extra = []) {
  /* T1b／B1：Owner／Verification／Tags（Notion 殘留、Owner 近本名）拿掉，只留 Last edited time；
     內頁 props 已在 T1 隱藏，本項只影響首頁那一行 */
  return [
    { icon: "🕐", label: "Last edited time", value: escapeHtml(formatDateTime(state.manifest.generated_at)) },
    ...extra,
  ];
}

/* ---------- ホーム ---------- */
function renderHome() {
  updateNav("");
  renderBreadcrumb([]);
  const totalRows = state.manifest.tables.reduce((sum, table) => sum + table.row_count, 0);
  app.innerHTML = `
    ${pageHead(homeMeta, "常闇トワ様配信データベース", defaultProps([
      { icon: "📊", label: "公開レコード", value: String(totalRows) },
    ]))}
    <div class="section-heading">データベース一覧</div>
    <div class="home-grid">
      ${state.manifest.tables.filter((table) => !hiddenTables.includes(table.slug)).map((table) => {
        const meta = tableMeta[table.slug] || { icon: "📄", cover: table.table };
        return `
          <button class="home-card" type="button" data-slug="${table.slug}">
            <span class="home-card-cover">${escapeHtml(meta.cover)}</span>
            <span class="home-card-body">
              <span class="home-card-title">${meta.icon} ${escapeHtml(table.table)}</span>
              <div class="home-card-meta">${table.row_count} 件 · ${table.fields.length} プロパティ</div>
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
  document.querySelectorAll(".home-card").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = tableHash(button.dataset.slug);
    });
  });
}

/* ---------- テーブル（リスト／カレンダー） ---------- */
/* 欄値をフィルター用トークンに分解（「年」は Date から導出） */
function rowTokens(slug, row, field) {
  if (field === "年") {
    const match = String(row.Date || "").match(/^(\d{4})/);
    return match ? [match[1]] : [];
  }
  if (slug === "streams" && field === "タイプ") {
    /* T1b／A2：streams 的タイプ在篩選層走六組合併；顯示層（tagPills/cellContent）
       仍直接用 splitTags 讀原始值，不受此改動影響 */
    const raw = row[field];
    if (!raw) return [];
    return splitTags(raw).map(typeGroupOf);
  }
  const value = row[field];
  if (!value) return [];
  if ((tagFields[slug] || []).includes(field)) return splitTags(value);
  const relation = (relationFields[slug] || []).find((item) => item.field === field);
  if (relation) return splitRelation(value);
  return [String(value).trim()].filter(Boolean);
}

function matchesFieldFilters(slug, row, fieldFilters) {
  return Object.entries(fieldFilters).every(([field, wanted]) =>
    rowTokens(slug, row, field).includes(wanted)
  );
}

function filterBarHtml(slug, payload, fieldFilters) {
  /* T1b／A：配信記録だけ chip＋datalist の新レイアウト、他表は既存プルダウンのまま（不動） */
  if (slug === "streams") return streamsFilterBarHtml(payload, fieldFilters);
  return legacyFilterBarHtml(slug, payload, fieldFilters);
}

function legacyFilterBarHtml(slug, payload, fieldFilters) {
  const fields = filterFields[slug] || [];
  if (!fields.length) return "";
  const selects = fields.map((field) => {
    const counts = new Map();
    payload.rows.forEach((row) => {
      rowTokens(slug, row, field).forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
    });
    if (!counts.size) return "";
    const options = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "ja-JP")
    );
    const current = fieldFilters[field] || "";
    return `
      <label class="filter-select${current ? " active" : ""}">
        <span class="filter-label">${escapeHtml(field)}</span>
        <select data-field="${escapeAttribute(field)}">
          <option value="">すべて</option>
          ${options
            .map(([value, count]) => `<option value="${escapeAttribute(value)}"${value === current ? " selected" : ""}>${escapeHtml(value)}（${count}）</option>`)
            .join("")}
        </select>
      </label>
    `;
  }).join("");
  const clear = Object.keys(fieldFilters).length
    ? `<button class="text-button" type="button" id="clearFilters">✕ フィルター解除</button>`
    : "";
  return `<div class="filter-bar">🔽 ${selects}${clear}</div>`;
}

/* ---------- T1b／A1・A2・A5：配信記録専用フィルターバー（1行目＝年chip＋タイプchip、
   3行目＝選択中pill、条件が無ければ3行目は出さない）。2行目（ゲーム／メンバー入力欄）は
   既存 .toolbar に相乗り＝gameMemberInputsHtml() 参照（renderTable 側で差し込む） ---------- */
function streamsFilterBarHtml(payload, fieldFilters) {
  const years = new Set();
  const groups = new Set();
  payload.rows.forEach((row) => {
    rowTokens("streams", row, "年").forEach((y) => years.add(y));
    rowTokens("streams", row, "タイプ").forEach((g) => groups.add(g));
  });
  const yearOptions = [...years].sort();
  const groupOptions = TYPE_GROUP_ORDER.filter((g) => groups.has(g));
  const yearChips = chipGroupHtml("年", yearOptions.map((y) => ({ value: y, label: y })), fieldFilters["年"]);
  const typeChips = chipGroupHtml("タイプ", groupOptions.map((g) => ({ value: g, label: g })), fieldFilters["タイプ"]);
  const row1 = `
    <div class="filter-bar filter-bar-chips">
      <div class="filter-chip-group">${yearChips}</div>
      <span class="filter-divider"></span>
      <div class="filter-chip-group">${typeChips}</div>
    </div>
  `;
  return row1 + selectedPillsHtml(fieldFilters);
}

function chipGroupHtml(field, options, current) {
  return options
    .map(
      (opt) => `
    <button class="filter-chip${current === opt.value ? " active" : ""}" type="button" data-field="${escapeAttribute(field)}" data-value="${escapeAttribute(opt.value)}">${escapeHtml(opt.label)}</button>
  `
    )
    .join("");
}

function selectedPillsHtml(fieldFilters) {
  const keys = Object.keys(fieldFilters);
  if (!keys.length) return "";
  const pills = keys
    .map(
      (field) => `
    <span class="filter-pill">${escapeHtml(fieldFilters[field])}<button class="pill-remove" type="button" data-field="${escapeAttribute(field)}" aria-label="解除">✕</button></span>
  `
    )
    .join("");
  return `<div class="filter-selected">選択中：${pills}<button class="text-button" type="button" id="clearFilters">✕ フィルター解除</button></div>`;
}

/* ---------- T1b／A3：ゲーム・コラボメンバー の datalist 入力（.toolbar に差し込む） ---------- */
function gameMemberInputsHtml(payload, fieldFilters) {
  const fieldsForInput = [
    { field: "ゲーム", listId: "streamsGameOptions", placeholder: "ゲーム…" },
    { field: "コラボメンバー", listId: "streamsMemberOptions", placeholder: "メンバー…" },
  ];
  return fieldsForInput
    .map(({ field, listId, placeholder }) => {
      const counts = new Map();
      payload.rows.forEach((row) => {
        rowTokens("streams", row, field).forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
      });
      const options = [...counts.keys()].sort((a, b) => String(a).localeCompare(String(b), "ja-JP"));
      const current = fieldFilters[field] || "";
      return `
        <label class="table-filter field-filter">
          <input class="field-filter-input" type="text" list="${listId}" data-field="${escapeAttribute(field)}" value="${escapeAttribute(current)}" placeholder="${escapeAttribute(placeholder)}">
        </label>
        <datalist id="${listId}">
          ${options.map((value) => `<option value="${escapeAttribute(value)}">`).join("")}
        </datalist>
      `;
    })
    .join("");
}

function bindFilterBar(slug, initialFilter, mode, month, fieldFilters) {
  document.querySelectorAll(".filter-select select").forEach((select) => {
    select.addEventListener("change", () => {
      const next = { ...fieldFilters };
      if (select.value) next[select.dataset.field] = select.value;
      else delete next[select.dataset.field];
      location.hash = tableHash(slug, initialFilter, mode, month, next);
    });
  });
  const clear = document.querySelector("#clearFilters");
  if (clear) {
    clear.addEventListener("click", () => {
      location.hash = tableHash(slug, initialFilter, mode, month, {});
    });
  }
}

/* ---------- T1b：配信記録の chip／datalist／選択中pill 用バインド（既存 bindFilterBar と併用、
   #clearFilters は bindFilterBar 側の汎用ハンドラがそのまま拾う） ---------- */
function bindStreamsFilterControls(slug, initialFilter, mode, month, fieldFilters) {
  document.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      const value = btn.dataset.value;
      const next = { ...fieldFilters };
      if (next[field] === value) delete next[field];
      else next[field] = value;
      location.hash = tableHash(slug, initialFilter, mode, month, next);
    });
  });
  document.querySelectorAll(".field-filter-input").forEach((input) => {
    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = { ...fieldFilters };
        const field = input.dataset.field;
        if (input.value.trim()) next[field] = input.value.trim();
        else delete next[field];
        location.hash = tableHash(slug, initialFilter, mode, month, next);
      }, 200);
    });
  });
  document.querySelectorAll(".pill-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = { ...fieldFilters };
      delete next[btn.dataset.field];
      location.hash = tableHash(slug, initialFilter, mode, month, next);
    });
  });
}

function renderTable(slug, initialFilter = "", mode = "", month = "", fieldFilters = {}) {
  const payload = state.tables.get(slug);
  if (!payload) return renderHome();
  updateNav(slug);
  const meta = tableMeta[slug] || { icon: "📄", cover: payload.table };
  renderBreadcrumb([{ label: `${meta.icon} ${payload.table}` }]);

  const hasCalendar = slug === "streams";
  const activeMode = hasCalendar && mode === "calendar" ? "calendar" : "list";

  const head = pageHead(meta, payload.table, defaultProps());
  const tabs = `
    <div class="view-tabs">
      <button class="view-tab ${activeMode === "list" ? "active" : ""}" type="button" data-mode="list">📄 リスト</button>
      ${hasCalendar ? `<button class="view-tab ${activeMode === "calendar" ? "active" : ""}" type="button" data-mode="calendar">🗓️ カレンダー</button>` : ""}
      <span class="spacer"></span>
    </div>
  `;
  const filterBar = filterBarHtml(slug, payload, fieldFilters);

  if (activeMode === "calendar") {
    app.innerHTML = head + tabs + filterBar + calendarHtml(slug, payload, month, fieldFilters);
    bindViewTabs(slug, initialFilter, fieldFilters);
    bindFilterBar(slug, "", "calendar", month, fieldFilters);
    if (slug === "streams") bindStreamsFilterControls(slug, "", "calendar", month, fieldFilters);
    bindCalendar(slug, payload, month, fieldFilters);
    return;
  }

  const titleField = titleFields[slug] || payload.fields[0];
  const filter = normalizeText(initialFilter);
  const rows = payload.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => matchesFieldFilters(slug, row, fieldFilters))
    .filter(({ row }) => !filter || normalizeText(Object.values(row).join(" ")).includes(filter));
  const sortedRows = sortRows(rows, state.sort.field, state.sort.direction);
  const tableRows = sortedRows
    .map(({ row, index }) => tableRow(slug, row, index, payload.fields, titleField))
    .join("");

  /* T1b／A6：ゲーム・メンバー入力欄は既存 .toolbar に相乗り（＝文字篩選框／件數と同一行）、
     配信記録以外は空文字のまま（他表は既存 toolbar 未変更） */
  const streamsInputs = slug === "streams" ? gameMemberInputsHtml(payload, fieldFilters) : "";

  app.innerHTML = `
    ${head}
    ${tabs}
    ${filterBar}
    <div class="toolbar">
      ${streamsInputs}
      <label class="table-filter">
        <input id="tableFilter" type="search" value="${escapeAttribute(initialFilter)}" placeholder="このビューを絞り込む…">
      </label>
      <button class="text-button" type="button" id="clearSort">並べ替え解除</button>
      <span class="row-count">${rows.length} / ${payload.row_count} 件</span>
    </div>
    <div class="table-shell">
      <table>
        <thead>
          <tr>${payload.fields.map((field) => headerCell(field, slug, titleField)).join("")}</tr>
        </thead>
        <tbody>${tableRows || `<tr><td colspan="${payload.fields.length}" class="empty">該当なし</td></tr>`}</tbody>
      </table>
    </div>
  `;

  bindViewTabs(slug, initialFilter, fieldFilters);
  bindFilterBar(slug, initialFilter, "", "", fieldFilters);
  if (slug === "streams") bindStreamsFilterControls(slug, initialFilter, "", "", fieldFilters);
  document.querySelector("#tableFilter").addEventListener("input", (event) => {
    location.hash = tableHash(slug, event.target.value, "", "", fieldFilters);
  });
  document.querySelector("#clearSort").addEventListener("click", () => {
    state.sort = { field: "", direction: "asc" };
    renderTable(slug, initialFilter, "", "", fieldFilters);
  });
  document.querySelectorAll(".sort-button").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.field;
      state.sort.direction = state.sort.field === field && state.sort.direction === "asc" ? "desc" : "asc";
      state.sort.field = field;
      renderTable(slug, initialFilter, "", "", fieldFilters);
    });
  });
  document.querySelectorAll(".detail-button").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = detailHash(slug, Number(button.dataset.index));
    });
  });
}

function bindViewTabs(slug, filter, fieldFilters = {}) {
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode === "calendar" ? "calendar" : "";
      location.hash = tableHash(slug, mode ? "" : filter, mode, "", fieldFilters);
    });
  });
}

function headerCell(field, slug, titleField) {
  const arrow = state.sort.field === field ? (state.sort.direction === "asc" ? " ↑" : " ↓") : "";
  const width = columnWidth(slug, field, titleField);
  return `<th style="width:${width}px"><button class="sort-button" type="button" data-field="${escapeAttribute(field)}">${fieldIcon(field)} ${escapeHtml(field)}${arrow}</button></th>`;
}

function fieldIcon(field) {
  if (/date|日|時/i.test(field)) return "📅";
  if (/リンク|url|youtube|twitch|再生リスト【/i.test(field)) return "🔗";
  if (/メンバー|名前|owner/i.test(field)) return "👤";
  if (/ゲーム/.test(field)) return "🎮";
  if (/タイプ|キーワード|タグ|tag|チャンネル|大会/i.test(field)) return "🏷️";
  return "＝";
}

function tableRow(slug, row, index, fields, titleField) {
  return `
    <tr>
      ${fields.map((field) => {
        const value = row[field] || "";
        let content;
        if (field === titleField) {
          content = `<button class="title-cell detail-button" type="button" data-index="${index}"><span class="row-icon">${rowIcon(slug)}</span>${escapeHtml(value || "（無題）")}</button>`;
        } else {
          content = cellContent(slug, field, value, true, index);
        }
        return `<td><div class="cell-truncate" title="${escapeAttribute(value)}">${content}</div></td>`;
      }).join("")}
    </tr>
  `;
}

function rowIcon(slug) {
  return "📄";
}

/* 欄の型に応じてセルを描画（タグ pill／リンク／日付／テキスト） */
function cellContent(slug, field, value, compact = false, rowIndex = null) {
  if (!value) return "";
  if ((tagFields[slug] || []).includes(field)) return tagPills(value);
  if (field === "Date") return escapeHtml(formatDate(value));
  const relation = (relationFields[slug] || []).find((item) => item.field === field);
  if (relation) return relationChips(value, relation.target, compact, rowIndex);
  return linkifyValue(value);
}

function tagPills(value) {
  const parts = splitTags(value);
  if (!parts.length) return "";
  return `<span class="tags">${parts
    .map((part) => `<span class="tag tag-${tagColor(part)}">${escapeHtml(part)}</span>`)
    .join("")}</span>`;
}

/* ---------- カレンダー ---------- */
const DOW_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

function calendarHtml(slug, payload, month, fieldFilters = {}) {
  const anchor = resolveMonth(payload, month);
  const events = eventsByDate(slug, payload, fieldFilters);
  const year = anchor.getFullYear();
  const monthIndex = anchor.getMonth();
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() + 6) % 7; // 月曜はじまり
  const gridStart = new Date(year, monthIndex, 1 - offset);
  const todayKey = dateKey(new Date());

  let cells = "";
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = dateKey(day);
    const inMonth = day.getMonth() === monthIndex;
    const dayEvents = events.get(key) || [];
    const shown = dayEvents.slice(0, 3);
    const extra = dayEvents.length - shown.length;
    cells += `
      <div class="cal-cell${inMonth ? "" : " other-month"}">
        <span class="cal-date${key === todayKey ? " today" : ""}">${day.getDate()}</span>
        ${shown.map((event) => `
          <button class="cal-event" type="button" data-index="${event.index}" title="${escapeAttribute(event.title)}">
            <span class="dot" style="background: var(--tag-${tagColor(event.channel || "YouTube")}-fg)"></span>${escapeHtml(event.title)}
          </button>
        `).join("")}
        ${extra > 0 ? `<span class="cal-more">他 ${extra} 件</span>` : ""}
      </div>
    `;
  }

  return `
    <div class="calendar-wrap">
      <div class="calendar-toolbar">
        <span class="calendar-title">${year}年${monthIndex + 1}月</span>
        <button class="cal-today-btn" type="button" id="calToday">今日</button>
        <button class="cal-nav" type="button" id="calPrev">‹</button>
        <button class="cal-nav" type="button" id="calNext">›</button>
      </div>
      <div class="calendar">
        ${DOW_LABELS.map((label) => `<div class="cal-dow">${label}</div>`).join("")}
        ${cells}
      </div>
    </div>
  `;
}

function bindCalendar(slug, payload, month, fieldFilters = {}) {
  const anchor = resolveMonth(payload, month);
  const shift = (delta) => {
    const next = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
    location.hash = tableHash(slug, "", "calendar", monthKey(next), fieldFilters);
  };
  document.querySelector("#calPrev").addEventListener("click", () => shift(-1));
  document.querySelector("#calNext").addEventListener("click", () => shift(1));
  document.querySelector("#calToday").addEventListener("click", () => {
    location.hash = tableHash(slug, "", "calendar", monthKey(new Date()), fieldFilters);
  });
  document.querySelectorAll(".cal-event").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = detailHash(slug, Number(button.dataset.index));
    });
  });
}

function resolveMonth(payload, month) {
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [year, monthNum] = month.split("-").map(Number);
    return new Date(year, monthNum - 1, 1);
  }
  // 既定＝データが存在する最新の月
  let latest = "";
  payload.rows.forEach((row) => {
    const key = String(row.Date || "").slice(0, 7);
    if (key > latest) latest = key;
  });
  if (/^\d{4}-\d{2}$/.test(latest)) {
    const [year, monthNum] = latest.split("-").map(Number);
    return new Date(year, monthNum - 1, 1);
  }
  return new Date();
}

function eventsByDate(slug, payload, fieldFilters = {}) {
  const titleField = titleFields.streams;
  const map = new Map();
  payload.rows.forEach((row, index) => {
    if (!matchesFieldFilters(slug, row, fieldFilters)) return;
    const key = String(row.Date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ index, title: row[titleField] || "（無題）", channel: row["チャンネル"] || "" });
  });
  return map;
}

function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/* ---------- 詳細ページ ---------- */
function renderDetail(slug, rowIndex) {
  const payload = state.tables.get(slug);
  if (!payload || !payload.rows[rowIndex]) return renderHome();
  updateNav(slug);
  const meta = tableMeta[slug] || { icon: "📄", cover: payload.table };
  const row = payload.rows[rowIndex];
  const titleField = titleFields[slug] || payload.fields[0];
  const title = row[titleField] || payload.table;
  renderBreadcrumb([
    { label: `${meta.icon} ${payload.table}`, hash: tableHash(slug) },
    { label: snippet(title, 30) },
  ]);
  const media = streamThumbnail(slug, row);

  app.innerHTML = `
    <div class="back-line">
      <button class="text-button" type="button" id="backToTable">← ${escapeHtml(payload.table)} に戻る</button>
    </div>
    <div class="page-head">
      <h1 class="page-title" style="font-size: 28px;">${escapeHtml(title)}</h1>
    </div>
    <div class="record">
      <div class="record-main">
        <div class="field-list">
          ${payload.fields.map((field) => detailField(slug, row, field)).join("")}
        </div>
      </div>
      <aside class="record-side">
        ${media}
        ${renderReverseRelations(slug, row)}
      </aside>
    </div>
  `;

  document.querySelector("#backToTable").addEventListener("click", () => {
    location.hash = tableHash(slug);
  });
  bindRelationChips();
  bindRelatedItems();
}

function detailField(slug, row, field) {
  const value = row[field] || "";
  const body = cellContent(slug, field, value);
  return `
    <div class="field-row">
      <div class="field-label">${fieldIcon(field)} ${escapeHtml(field)}</div>
      <div class="field-value">${body || '<span class="empty">空</span>'}</div>
    </div>
  `;
}

function relationChips(value, targetSlug, compact = false, rowIndex = null) {
  const parts = splitRelation(value);
  if (!parts.length) return "";
  const shown = compact ? parts.slice(0, 3) : parts;
  const extra = parts.length - shown.length;
  const chipsHtml = shown.map((name) => relationChip(name, targetSlug)).join("");
  /* T1／B1：表格列超過 3 個合成「＋N」，點它＝進本列詳情（沿用 .detail-button data-index 慣例，
     不新增事件綁定；詳情頁 detailField() 呼叫時 compact=false，extra 恆為 0，全部顯示不受影響） */
  const moreHtml = extra > 0
    ? `<button class="chip chip-more detail-button" type="button" data-index="${rowIndex}">＋${extra}</button>`
    : "";
  return `<span class="chips">${chipsHtml}${moreHtml}</span>`;
}

function relationChip(name, targetSlug) {
  const match = findRowByTitle(targetSlug, name);
  const attrs = match
    ? `data-target="${targetSlug}" data-row="${match.index}"`
    : `data-target="${targetSlug}" data-filter="${escapeAttribute(name)}"`;
  return `<button class="chip relation-chip" type="button" ${attrs}>${escapeHtml(name)}</button>`;
}

function renderReverseRelations(slug, row) {
  const relations = reverseRelations[slug] || [];
  if (!relations.length) return "";
  const title = row[titleFields[slug]] || "";
  return relations
    .map((relation) => {
      const related = findRelatedRows(relation.source, relation.field, title).slice(0, 40);
      if (!related.length) return "";
      return `
        <section>
          <h2 class="related-heading">↗ ${escapeHtml(relation.label)}（${related.length}）</h2>
          <div class="related-list">
            ${related.map((item) => relatedItem(relation.source, item)).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function relatedItem(slug, item) {
  const payload = state.tables.get(slug);
  const titleField = titleFields[slug] || payload.fields[0];
  const title = item.row[titleField] || "（無題）";
  const date = item.row.Date ? formatDate(item.row.Date) : "";
  return `
    <button class="related-item" type="button" data-target="${slug}" data-row="${item.index}">
      <strong>${escapeHtml(title)}</strong>
      <span class="meta">${escapeHtml(date)}</span>
    </button>
  `;
}

function findRelatedRows(sourceSlug, field, title) {
  const payload = state.tables.get(sourceSlug);
  const needle = normalizeText(title);
  if (!payload || !needle) return [];
  return payload.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => splitRelation(row[field]).some((item) => normalizeText(item) === needle));
}

function findRowByTitle(slug, title) {
  const payload = state.tables.get(slug);
  const titleField = titleFields[slug] || payload?.fields[0];
  const needle = normalizeText(title);
  if (!payload || !needle) return null;
  const index = payload.rows.findIndex((row) => normalizeText(row[titleField]) === needle);
  return index >= 0 ? { row: payload.rows[index], index } : null;
}

function bindRelationChips() {
  document.querySelectorAll(".relation-chip").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.row) {
        location.hash = detailHash(button.dataset.target, Number(button.dataset.row));
      } else {
        location.hash = tableHash(button.dataset.target, button.dataset.filter || "");
      }
    });
  });
}

function bindRelatedItems() {
  document.querySelectorAll(".related-item").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = detailHash(button.dataset.target, Number(button.dataset.row));
    });
  });
}

/* ---------- 検索 ---------- */
function renderSearch(query) {
  updateNav("");
  renderBreadcrumb([{ label: "🔍 検索" }]);
  const needle = normalizeText(query);
  const results = state.searchIndex
    .map((item) => ({ ...item, score: scoreSearch(item, needle) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ja-JP"))
    .slice(0, 80);

  app.innerHTML = `
    <div class="search-head">「${escapeHtml(query)}」の検索結果 — ${results.length} 件</div>
    <div class="search-results">
      ${results.map(searchResult).join("") || '<div class="empty">該当なし</div>'}
    </div>
  `;
  document.querySelectorAll(".search-result").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = detailHash(button.dataset.slug, Number(button.dataset.row));
      globalSearch.value = "";
    });
  });
}

function searchResult(item) {
  return `
    <button class="search-result" type="button" data-slug="${item.slug}" data-row="${item.row_index}">
      <span class="badge">${escapeHtml(item.table)}</span>
      <strong>${escapeHtml(item.title || "（無題）")}</strong>
      <span class="meta">${escapeHtml(snippet(item.text, 160))}</span>
    </button>
  `;
}

function scoreSearch(item, needle) {
  if (!needle) return 0;
  const title = normalizeText(item.title);
  const text = normalizeText(item.text);
  if (title === needle) return 100;
  if (title.startsWith(needle)) return 80;
  if (title.includes(needle)) return 60;
  if (text.includes(needle)) return 30;
  return 0;
}

/* ---------- ユーティリティ ---------- */
function sortRows(rows, field, direction) {
  if (!field) return rows;
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a.row[field] || "";
    const right = b.row[field] || "";
    return left.localeCompare(right, "ja-JP", { numeric: true }) * multiplier;
  });
}

function splitRelation(value) {
  return String(value || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitTags(value) {
  return String(value || "")
    .split(/[;,、]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function streamThumbnail(slug, row) {
  const id = youtubeId(row["配信リンク"]);
  if (!id) return "";
  return `<img class="thumb" src="https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg" alt="" loading="lazy">`;
}

function youtubeId(url) {
  const text = String(url || "");
  const watch = text.match(/[?&]v=([A-Za-z0-9_-]+)/);
  if (watch) return watch[1];
  const live = text.match(/youtube\.com\/live\/([A-Za-z0-9_-]+)/);
  if (live) return live[1];
  const short = text.match(/youtu\.be\/([A-Za-z0-9_-]+)/);
  return short ? short[1] : "";
}

function linkifyValue(value) {
  const text = String(value || "");
  if (!text) return "";
  if (/^https?:\/\//.test(text)) {
    return `<a href="${escapeAttribute(text)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(text))}</a>`;
  }
  return escapeHtml(text);
}

function shortUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 18 ? `${parsed.pathname.slice(0, 6)}…${parsed.pathname.slice(-8)}` : parsed.pathname;
    return `${parsed.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .trim();
}

function snippet(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function formatDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(value || "");
  return `${match[1]}/${match[2]}/${match[3]}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
