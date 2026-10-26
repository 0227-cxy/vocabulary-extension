import { initThemeOnPage } from "../lib/theme-init.js";
import { applyThemeToDocument, THEMES } from "../lib/themes.js";
import { getVocab, removeVocab, clearVocab, send } from "../lib/messaging.js";

const listEl = document.getElementById("vocab-list");
const searchEl = document.getElementById("search");
const countLabel = document.getElementById("count-label");
const addForm = document.getElementById("add-form");
const diffFilter = document.getElementById("diff-filter");
const statsRow = document.getElementById("stats-row");
const themeRow = document.getElementById("theme-row");

const DIFF_LABEL = { unfamiliar: "生疏", familiar: "熟悉", mastered: "掌握" };
const DIFF_ORDER = ["unfamiliar", "familiar", "mastered"];

let allItems = [];

function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------- 主题切换 ---------- */
const THEME_NAMES = { blue: "蓝", pink: "粉", yellow: "黄", purple: "紫", green: "绿" };
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

/* ---------- 列表渲染 ---------- */
function diffTagHtml(diff) {
  const label = DIFF_LABEL[diff] || DIFF_LABEL.unfamiliar;
  return `<span class="diff-tag diff-${diff}" title="点击切换难度">${label}</span>`;
}

function render(list) {
  listEl.innerHTML = "";
  if (!list.length) {
    listEl.innerHTML = '<li class="empty">暂无生词，在网页上划词或手动添加吧</li>';
    countLabel.textContent = "0 个生词";
    return;
  }
  countLabel.textContent = `${list.length} 个生词`;
  for (const item of list) {
    const li = document.createElement("li");
    li.className = "vocab-item";
    const senseLine = (item.senses || [])
      .slice(0, 2)
      .map((s) => `${s.posZh || s.pos || ""} ${(s.definitions || []).slice(0, 2).join("；")}`)
      .join(" | ");
    li.innerHTML = `
      <div class="vocab-item-main">
        <div class="vocab-word">${escapeHtml(item.word)} <span class="diff-tag diff-${item.difficulty || "unfamiliar"}" data-difftag="${item.id}">${DIFF_LABEL[item.difficulty] || "生疏"}</span></div>
        <div class="vocab-meta">${item.phonetic ? escapeHtml(item.phonetic) + " · " : ""}${formatTime(item.addedAt)}</div>
        <div class="vocab-trans">${escapeHtml(item.translation || "—")}</div>
        ${senseLine ? `<div class="vocab-senses">${escapeHtml(senseLine)}</div>` : ""}
      </div>
      <button type="button" class="btn-delete" title="删除" data-id="${item.id}">✕</button>
    `;
    listEl.appendChild(li);
  }
}

function filtered() {
  const q = searchEl.value.trim().toLowerCase();
  const df = diffFilter.value;
  return allItems.filter((x) => {
    if (df !== "all" && x.difficulty !== df) return false;
    if (!q) return true;
    return (
      x.word.toLowerCase().includes(q) ||
      (x.translation || "").toLowerCase().includes(q)
    );
  });
}

async function refresh() {
  allItems = await getVocab();
  render(filtered());
}

/* 点击难易标签循环切换 */
listEl.addEventListener("click", async (e) => {
  const tag = e.target.closest("[data-difftag]");
  if (tag) {
    const id = tag.dataset.difftag;
    const item = allItems.find((x) => x.id === id);
    if (!item) return;
    const idx = DIFF_ORDER.indexOf(item.difficulty || "unfamiliar");
    item.difficulty = DIFF_ORDER[(idx + 1) % DIFF_ORDER.length];
    await send("SET_VOCAB", { list: allItems });
    render(filtered());
    return;
  }
  const btn = e.target.closest(".btn-delete");
  if (!btn) return;
  await removeVocab(btn.dataset.id);
  allItems = allItems.filter((x) => x.id !== btn.dataset.id);
  render(filtered());
});

searchEl.addEventListener("input", () => render(filtered()));
diffFilter.addEventListener("change", () => render(filtered()));

document.getElementById("btn-clear").addEventListener("click", async () => {
  if (!allItems.length) return;
  if (!confirm("确定清空全部生词？")) return;
  await clearVocab();
  allItems = [];
  render(filtered());
});

document.getElementById("btn-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("btn-open-full").addEventListener("click", () => {
  send("OPEN_VOCAB_PAGE");
});

document.getElementById("btn-add").addEventListener("click", () => {
  addForm.classList.toggle("hidden");
});

document.getElementById("btn-add-cancel").addEventListener("click", () => {
  addForm.classList.add("hidden");
  document.getElementById("add-word").value = "";
  document.getElementById("add-translation").value = "";
});

document.getElementById("btn-add-save").addEventListener("click", async () => {
  const word = document.getElementById("add-word").value.trim();
  let translation = document.getElementById("add-translation").value.trim();
  if (!word) return alert("请输入英文");
  try {
    if (!translation) {
      const tr = await send("TRANSLATE", { text: word });
      translation = tr?.ok ? tr.translation : "";
    }
    const res = await send("ADD_VOCAB", {
      entry: { word, translation, phonetic: "", sourceTitle: "手动添加", sourceUrl: "" },
    });
    if (!res?.ok) throw new Error(res?.error || "添加失败");
    addForm.classList.add("hidden");
    document.getElementById("add-word").value = "";
    document.getElementById("add-translation").value = "";
    await refresh();
    await renderStats();
  } catch (err) {
    alert(err.message);
  }
});

async function init() {
  await initThemeOnPage();
  const currentTheme = document.documentElement.dataset.wstTheme || "blue";
  renderThemes(currentTheme);
  await renderStats();
  refresh();
}

init();
