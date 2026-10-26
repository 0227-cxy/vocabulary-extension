const VOCAB_KEY = "vocabulary";
const SETTINGS_KEY = "settings";

const DEFAULT_SETTINGS = {
  provider: "mymemory",
  youdao: { appKey: "", appSecret: "" },
  baidu: { appId: "", secret: "" },
  autoPopup: true,
  maxSelectionLength: 500,
  highlightAuto: true,
  dailyReminderTime: "",
};

export async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

export async function saveSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function getVocabulary() {
  const data = await chrome.storage.local.get(VOCAB_KEY);
  const list = data[VOCAB_KEY];
  return Array.isArray(list) ? list : [];
}

async function persistVocab(list) {
  await chrome.storage.local.set({ [VOCAB_KEY]: list });
}

export async function addVocabularyEntry(entry) {
  const list = await getVocabulary();
  const word = (entry.word || "").trim();
  if (!word) throw new Error("单词不能为空");

  const senses = Array.isArray(entry.senses) ? entry.senses : [];
  const wordForms =
    entry.wordForms && typeof entry.wordForms === "object" ? entry.wordForms : {};
  const examples = Array.isArray(entry.examples) ? entry.examples : [];

  const existing = list.find(
    (item) => item.word.toLowerCase() === word.toLowerCase()
  );
  if (existing) {
    const updated = {
      ...existing,
      translation: entry.translation ?? existing.translation,
      phonetic: entry.phonetic ?? existing.phonetic,
      senses: senses.length ? senses : existing.senses || [],
      examples: examples.length ? examples : existing.examples || [],
      wordForms: Object.keys(wordForms).length ? wordForms : existing.wordForms || {},
      difficulty: entry.difficulty ?? existing.difficulty,
      sourceTitle: entry.sourceTitle ?? existing.sourceTitle,
      sourceUrl: entry.sourceUrl ?? existing.sourceUrl,
      addedAt: Date.now(),
    };
    const next = list.map((item) => (item.id === existing.id ? updated : item));
    await persistVocab(next);
    return { entry: updated, isNew: false };
  }

  const saved = {
    id: newId(),
    word,
    translation: entry.translation || "",
    phonetic: entry.phonetic || "",
    senses,
    examples,
    wordForms,
    difficulty: entry.difficulty || "unfamiliar",
    sourceTitle: entry.sourceTitle || "",
    sourceUrl: entry.sourceUrl || "",
    addedAt: entry.addedAt || Date.now(),
  };
  list.unshift(saved);
  await persistVocab(list);
  return { entry: saved, isNew: true };
}

export async function removeVocabularyEntry(id) {
  const list = await getVocabulary();
  await persistVocab(list.filter((item) => item.id !== id));
}

export async function clearVocabulary() {
  await persistVocab([]);
}

export async function setVocabulary(list) {
  if (!Array.isArray(list)) throw new Error("无效的生词列表");
  await persistVocab(list);
}
