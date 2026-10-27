import { translateText } from "./lib/translate.js";
import {
  getSettings,
  saveSettings,
  getVocabulary,
  addVocabularyEntry,
  removeVocabularyEntry,
  clearVocabulary,
  setVocabulary,
} from "./lib/storage.js";
import { fetchDictionaryDetails } from "./lib/dictionary.js";
import { normalizeVocabEntry } from "./lib/vocab-model.js";
import {
  recordNewVocabAdded,
  getLearningStats,
  markMilestone,
} from "./lib/stats.js";

const MENU_TRANSLATE_SAVE = "wst-translate-save";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_TRANSLATE_SAVE,
      title: "翻译并存入生词本",
      contexts: ["selection"],
    });
  });
  scheduleDailyReminder();
});

/** 根据设置排每日复习提醒（alarm），到点发系统通知 */
async function scheduleDailyReminder() {
  const settings = await getSettings();
  const t = settings.dailyReminderTime;
  if (!t) {
    chrome.alarms.clear("wst-daily-review");
    return;
  }
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    chrome.alarms.clear("wst-daily-review");
    return;
  }
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delayMin = Math.max(1, Math.round((target - now) / 60000));
  chrome.alarms.create("wst-daily-review", { delayInMinutes: delayMin, periodInMinutes: 1440 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "wst-daily-review") return;
  chrome.notifications.create("wst-daily-review-note", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "看累了吧，起来活动一下 🌸",
    message: "嗨～今天的生词还在等你呢。先起来喝口水、望望远，顺便花两分钟过一遍，记得更牢哦！",
  });
});

function isLikelyEnglish(text) {
  const t = text.trim();
  if (!t) return false;
  const letters = (t.match(/[a-zA-Z]/g) || []).length;
  return letters / t.length >= 0.5;
}

/** 单个英文词才补充词典详情（词性/释义/例句/词形） */
function isSingleEnglishWord(text) {
  return /^[a-zA-Z][a-zA-Z'-]*$/.test((text || "").trim());
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.selectionText?.trim()) return;
  const text = info.selectionText.trim();
  if (!isLikelyEnglish(text)) return;

  if (info.menuItemId === MENU_TRANSLATE_SAVE) {
    try {
      const result = await translateWithDict(text);
      const { entry, isNew } = await addVocabularyEntry(
        normalizeVocabEntry({
          word: text,
          translation: result.translation,
          phonetic: result.phonetic || "",
          senses: result.senses,
          examples: result.examples,
          wordForms: result.wordForms,
          synonyms: result.synonyms,
          sourceTitle: tab.title || "",
          sourceUrl: tab.url || "",
        })
      );
      await recordNewVocabAdded(isNew);
      chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_TRANSLATION_FOR",
        text,
        translation: result.translation,
        phonetic: result.phonetic || "",
        senses: result.senses,
        examples: result.examples,
        wordForms: result.wordForms,
        synonyms: result.synonyms,
        saved: true,
        fromContextMenu: true,
      });
    } catch (err) {
      chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_TRANSLATION_FOR",
        text,
        error: err.message || String(err),
        fromContextMenu: true,
      });
    }
  }
});

/** 翻译；单个英文词时并行补充词典详情，失败不影响主译文（有道路径自带专业释义，不重复抓取） */
async function translateWithDict(text) {
  const settings = await getSettings();
  const needDict = isSingleEnglishWord(text) && settings?.provider !== "youdao";
  const translateFn = async (en) => {
    try {
      const r = await translateText(en, settings);
      return r.translation || "";
    } catch {
      return "";
    }
  };
  const dictTask = needDict
    ? fetchDictionaryDetails(text, { translate: translateFn }).catch(() => null)
    : Promise.resolve(null);
  const [result, details] = await Promise.all([translateText(text, settings), dictTask]);
  if (details) {
    result.senses = details.senses;
    result.phonetic = details.phonetic || result.phonetic;
    result.examples = details.examples;
    result.wordForms = details.wordForms;
    result.synonyms = details.synonyms;
  }
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (!handler) return false;
  Promise.resolve(handler(message, sender))
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});

const messageHandlers = {
  async TRANSLATE({ text }) {
    const result = await translateWithDict(text);
    return { ok: true, ...result };
  },

  async ADD_VOCAB({ entry }) {
    const norm = normalizeVocabEntry(entry);
    const { entry: saved, isNew } = await addVocabularyEntry(norm);
    await recordNewVocabAdded(isNew);
    const stats = await getLearningStats();
    let milestone = null;
    if (isNew && stats) {
      milestone = markMilestone(stats, stats.totalAdded);
    }
    return { ok: true, entry: saved, stats, milestone };
  },

  async GET_VOCAB() {
    const list = await getVocabulary();
    return { ok: true, list };
  },

  async GET_STATS() {
    const list = await getVocabulary();
    const stats = await getLearningStats();
    return { ok: true, stats: stats ? { ...stats, totalWords: list.length } : { totalWords: list.length } };
  },

  async REMOVE_VOCAB({ id }) {
    await removeVocabularyEntry(id);
    return { ok: true };
  },

  async CLEAR_VOCAB() {
    await clearVocabulary();
    return { ok: true };
  },

  async SET_VOCAB({ list }) {
    await setVocabulary(list);
    return { ok: true };
  },

  async GET_SETTINGS() {
    const settings = await getSettings();
    return { ok: true, settings };
  },

  async SAVE_SETTINGS({ settings }) {
    const saved = await saveSettings(settings);
    scheduleDailyReminder();
    return { ok: true, settings: saved };
  },

  async OPEN_VOCAB_PAGE() {
    await chrome.tabs.create({ url: chrome.runtime.getURL("pages/vocab.html") });
    return { ok: true };
  },
};
