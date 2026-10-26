import { getVocab, removeVocab, clearVocab, setVocab, send } from "../lib/messaging.js";
import { initThemeOnPage } from "../lib/theme-init.js";
import { applyThemeToDocument, THEMES } from "../lib/themes.js";

let allItems = [];

const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
const diffFilterEl = document.getElementById("diff-filter");
const tableWrap = document.getElementById("table-wrap");
const statsEl = document.getElementById("stats");

const reviewDialog = document.getElementById("review-dialog");
const reviewWord = document.getElementById("review-word");
const reviewPhonetic = document.getElementById("review-phonetic");
const reviewAnswer = document.getElementById("review-answer");

const DIFF_LABEL = { unfamiliar: "生疏", familiar: "熟悉", mastered: "掌握" };
const DIFF_ORDER = ["unfamiliar", "familiar", "mastered"];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString("zh-CN", { hour12: false });
}

/* ---------- 主题 ---------- */
const THEME_NAMES = { blue: "蓝", pink: "粉", yellow: "黄", purple: "紫", green: "绿" };
const themeRow = document.getElementById("theme-row");
function renderThemes(current) {
  themeRow.innerHTML = '<span class="theme-label">主题</span>';
  for (const key of Object.keys(THEMES)) {
    const d = document.createElement("div");
    d.className = "theme-dot" + (key === current ? " active" : "");
    d.dataset.theme = key;
    d.title = THEME_NAMES[key];
    d.style.background = THEMES[key]["--wst-primary"];
    d.addEventListener("click", async () => {
      applyThemeToDocument(document, key);
      themeRow.querySelectorAll(".theme-dot").forEach((x) => x.classList.remove("active"));
      d.classList.add("active");
      const res = await send("GET_SETTINGS");
      await send("SAVE_SETTINGS", { settings: { ...(res?.ok ? res.settings : {}), theme: key } });
    });
    themeRow.appendChild(d);
  }
}

/* ---------- 统计 ---------- */
const statsRow = document.getElementById("stats-row");
async function renderStats() {
  const res = await send("GET_STATS");
  const st = res?.ok ? res.stats : {};
  statsRow.innerHTML = `
    <span class="stat-badge">今日 +${st.todayNew || 0}</span>
    <span class="stat-badge">累计 ${st.totalWords || 0}</span>
    <span class="stat-badge">连续 ${st.streak || 0} 天</span>
  `;
  return st;
}

/* ---------- 排序 / 筛选 ---------- */
function sortItems(list) {
  const mode = sortEl.value;
  const copy = [...list];
  if (mode === "time-desc") copy.sort((a, b) => b.addedAt - a.addedAt);
  else if (mode === "time-asc") copy.sort((a, b) => a.addedAt - b.addedAt);
  else if (mode === "alpha-asc") copy.sort((a, b) => a.word.localeCompare(b.word, "en"));
  else copy.sort((a, b) => b.word.localeCompare(a.word, "en"));
  return copy;
}

function filterItems(list) {
  const q = searchEl.value.trim().toLowerCase();
  const df = diffFilterEl.value;
  return list.filter((x) => {
    if (df !== "all" && x.difficulty !== df) return false;
    if (!q) return true;
    return (
      x.word.toLowerCase().includes(q) ||
      (x.translation || "").toLowerCase().includes(q) ||
      (x.sourceTitle || "").toLowerCase().includes(q)
    );
  });
}

function senseSummary(item) {
  return (item.senses || [])
    .slice(0, 3)
    .map((s) => {
      const head = s.posZh || s.pos || "";
      const defs = (s.definitions || []).slice(0, 2).join("；");
      return head ? (defs ? `${head} ${defs}` : head) : defs;
    })
    .filter(Boolean)
    .join("<br>");
}

function renderTable(list) {
  statsEl.textContent = `共 ${allItems.length} 个生词，当前显示 ${list.length} 个`;
  if (!list.length) {
    tableWrap.innerHTML = '<div class="empty">没有匹配的生词</div>';
    return;
  }
  const rows = list
    .map(
      (item) => `
    <tr data-id="${item.id}">
      <td class="word-cell">${escapeHtml(item.word)}</td>
      <td>${escapeHtml(item.translation || "—")}</td>
      <td class="sense-cell">${senseSummary(item) || "—"}</td>
      <td>${escapeHtml(item.phonetic || "—")}</td>
      <td class="diff-cell"><span class="diff-tag diff-${item.difficulty || "unfamiliar"}" data-difftag="${item.id}" title="点击切换难度">${DIFF_LABEL[item.difficulty] || "生疏"}</span></td>
      <td>${formatDate(item.addedAt)}</td>
      <td class="link-cell">${
        item.sourceUrl
          ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourceTitle || item.sourceUrl)}</a>`
          : escapeHtml(item.sourceTitle || "—")
      }</td>
      <td><button type="button" class="btn-row" data-del="${item.id}">删除</button></td>
    </tr>`
    )
    .join("");

  tableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>单词</th>
          <th>释义</th>
          <th>词性 / 义项</th>
          <th>音标</th>
          <th>难度</th>
          <th>加入时间</th>
          <th>来源</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function refreshView() {
  const list = sortItems(filterItems(allItems));
  renderTable(list);
}

async function load() {
  allItems = await getVocab();
  refreshView();
}

searchEl.addEventListener("input", refreshView);
sortEl.addEventListener("change", refreshView);
diffFilterEl.addEventListener("change", refreshView);

tableWrap.addEventListener("click", async (e) => {
  const tag = e.target.closest("[data-difftag]");
  if (tag) {
    const id = tag.dataset.difftag;
    const item = allItems.find((x) => x.id === id);
    if (!item) return;
    const idx = DIFF_ORDER.indexOf(item.difficulty || "unfamiliar");
    item.difficulty = DIFF_ORDER[(idx + 1) % DIFF_ORDER.length];
    await setVocab(allItems);
    refreshView();
    return;
  }
  const id = e.target.dataset?.del;
  if (!id) return;
  await removeVocab(id);
  allItems = allItems.filter((x) => x.id !== id);
  refreshView();
});

document.getElementById("btn-clear").addEventListener("click", async () => {
  if (!allItems.length) return;
  if (!confirm("确定清空全部生词？")) return;
  await clearVocab();
  allItems = [];
  refreshView();
});

/* ---------- 导出 ---------- */
function download(filename, content, type) {
  const blob = new Blob([content], { type: type || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("btn-export").addEventListener("click", () => {
  download(`vocab-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(allItems, null, 2), "application/json");
});

document.getElementById("btn-export-anki").addEventListener("click", () => {
  // Anki 文本格式：每行 单词<TAB>释义<TAB>例句
  const lines = allItems.map((item) => {
    const example = item.examples?.[0]?.en || "";
    return [item.word, item.translation || "", example].join("\t");
  });
  download(`anki-${new Date().toISOString().slice(0, 10)}.txt`, lines.join("\n"), "text/plain;charset=utf-8");
});

function csvEscape(s) {
  const str = String(s ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

document.getElementById("btn-export-csv").addEventListener("click", () => {
  const header = ["word", "phonetic", "translation", "difficulty", "addedAt", "sourceTitle", "sourceUrl"];
  const lines = [header.join(",")];
  for (const item of allItems) {
    lines.push(
      [item.word, item.phonetic, item.translation, item.difficulty, item.addedAt, item.sourceTitle, item.sourceUrl]
        .map(csvEscape)
        .join(",")
    );
  }
  download(`vocab-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
});

/* ---------- 导入 ---------- */
document.getElementById("import-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("JSON 应为数组");
    const normalized = data.map((item) => ({
      id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      word: String(item.word || "").trim(),
      translation: String(item.translation || ""),
      phonetic: String(item.phonetic || ""),
      senses: Array.isArray(item.senses) ? item.senses : [],
      examples: Array.isArray(item.examples) ? item.examples : [],
      wordForms: item.wordForms && typeof item.wordForms === "object" ? item.wordForms : {},
      difficulty: item.difficulty || "unfamiliar",
      sourceTitle: String(item.sourceTitle || ""),
      sourceUrl: String(item.sourceUrl || ""),
      addedAt: Number(item.addedAt) || Date.now(),
    })).filter((x) => x.word);
    const merged = [...normalized];
    for (const old of allItems) {
      if (!merged.some((m) => m.word.toLowerCase() === old.word.toLowerCase())) {
        merged.push(old);
      }
    }
    await setVocab(merged);
    allItems = merged;
    refreshView();
    alert(`已导入 ${normalized.length} 条记录`);
  } catch (err) {
    alert(err.message || "导入失败");
  }
});

/* ---------- 随机复习 ---------- */
let reviewPool = [];

function pickReviewItem() {
  const visible = sortItems(filterItems(allItems));
  reviewPool = visible.length ? visible : allItems;
  if (!reviewPool.length) return null;
  return reviewPool[Math.floor(Math.random() * reviewPool.length)];
}

function showReviewItem(item) {
  reviewWord.textContent = item.word;
  reviewPhonetic.textContent = item.phonetic || "";
  reviewAnswer.textContent = item.translation || "（无释义）";
  reviewAnswer.classList.add("hidden");
  reviewCat.textContent = "";
}

document.getElementById("btn-review").addEventListener("click", () => {
  const item = pickReviewItem();
  if (!item) {
    alert("生词本为空，无法复习");
    return;
  }
  showReviewItem(item);
  reviewDialog.showModal();
});

document.getElementById("btn-show-answer").addEventListener("click", () => {
  reviewAnswer.classList.remove("hidden");
});

document.getElementById("btn-next").addEventListener("click", () => {
  const item = pickReviewItem();
  if (item) showReviewItem(item);
});

document.getElementById("btn-close-review").addEventListener("click", () => {
  reviewDialog.close();
});

document.getElementById("btn-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function init() {
  await initThemeOnPage();
  const currentTheme = document.documentElement.dataset.wstTheme || "blue";
  renderThemes(currentTheme);
  await renderStats();
  load();
}

init();
