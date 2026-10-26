import { send } from "../lib/messaging.js";
import { THEMES, applyThemeToDocument } from "../lib/themes.js";

const els = {
  provider: document.getElementById("provider"),
  autoPopup: document.getElementById("autoPopup"),
  youdaoKey: document.getElementById("youdaoKey"),
  youdaoSecret: document.getElementById("youdaoSecret"),
  baiduId: document.getElementById("baiduId"),
  baiduSecret: document.getElementById("baiduSecret"),
  status: document.getElementById("status"),
  themeRow: document.getElementById("theme-row"),
  highlightAuto: document.getElementById("highlightAuto"),
  dailyReminderTime: document.getElementById("dailyReminderTime"),
};

const THEME_NAMES = { blue: "蓝", pink: "粉", yellow: "黄", purple: "紫", green: "绿" };

function renderThemes(current) {
  els.themeRow.innerHTML = '<span class="theme-label">主题色</span>';
  for (const key of Object.keys(THEMES)) {
    const d = document.createElement("div");
    d.className = "theme-dot" + (key === current ? " active" : "");
    d.dataset.theme = key;
    d.title = THEME_NAMES[key];
    d.style.background = THEMES[key]["--wst-primary"];
    d.addEventListener("click", async () => {
      applyThemeToDocument(document, key);
      els.themeRow.querySelectorAll(".theme-dot").forEach((x) => x.classList.remove("active"));
      d.classList.add("active");
      const res = await send("GET_SETTINGS");
      await send("SAVE_SETTINGS", { settings: { ...(res?.ok ? res.settings : {}), theme: key } });
      els.status.textContent = "已应用主题";
      els.status.classList.add("ok");
      setTimeout(() => { els.status.textContent = ""; els.status.classList.remove("ok"); }, 1500);
    });
    els.themeRow.appendChild(d);
  }
}

async function load() {
  const res = await send("GET_SETTINGS");
  if (!res?.ok) return;
  const s = res.settings;
  els.provider.value = s.provider || "mymemory";
  els.autoPopup.checked = s.autoPopup !== false;
  els.youdaoKey.value = s.youdao?.appKey || "";
  els.youdaoSecret.value = s.youdao?.appSecret || "";
  els.baiduId.value = s.baidu?.appId || "";
  els.baiduSecret.value = s.baidu?.secret || "";
  els.highlightAuto.checked = s.highlightAuto !== false;
  els.dailyReminderTime.value = s.dailyReminderTime || "";
  renderThemes(s.theme || "blue");
  applyThemeToDocument(document, s.theme || "blue");
}

document.getElementById("btn-save").addEventListener("click", async () => {
  const settings = {
    provider: els.provider.value,
    autoPopup: els.autoPopup.checked,
    highlightAuto: els.highlightAuto.checked,
    dailyReminderTime: els.dailyReminderTime.value,
    youdao: {
      appKey: els.youdaoKey.value.trim(),
      appSecret: els.youdaoSecret.value.trim(),
    },
    baidu: {
      appId: els.baiduId.value.trim(),
      secret: els.baiduSecret.value.trim(),
    },
  };
  const res = await send("SAVE_SETTINGS", { settings });
  els.status.textContent = res?.ok ? "已保存" : res?.error || "保存失败";
  els.status.classList.toggle("ok", !!res?.ok);
  setTimeout(() => {
    els.status.textContent = "";
    els.status.classList.remove("ok");
  }, 2000);
});

load();
