import { sensesToTranslation } from "./dictionary.js";

/** 难易：生疏 / 熟悉 / 掌握 */
export const DIFFICULTY = {
  UNFAMILIAR: "unfamiliar",
  FAMILIAR: "familiar",
  MASTERED: "mastered",
};

export const DIFFICULTY_LABEL = {
  unfamiliar: "生疏",
  familiar: "熟悉",
  mastered: "掌握",
};

/** 规范化生词条目，兼容旧数据缺字段 */
export function normalizeVocabEntry(raw) {
  const word = String(raw?.word || "").trim();
  const senses = Array.isArray(raw?.senses) ? raw.senses : [];
  const translation =
    String(raw?.translation || "").trim() || sensesToTranslation(senses, "");

  return {
    id: raw?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    word,
    translation,
    phonetic: String(raw?.phonetic || ""),
    senses,
    examples: Array.isArray(raw?.examples) ? raw.examples : [],
    wordForms:
      raw?.wordForms && typeof raw.wordForms === "object" ? raw.wordForms : {},
    difficulty: raw?.difficulty || DIFFICULTY.UNFAMILIAR,
    sourceTitle: String(raw?.sourceTitle || ""),
    sourceUrl: String(raw?.sourceUrl || ""),
    addedAt: Number(raw?.addedAt) || Date.now(),
  };
}

/** 从翻译接口结果组装可存储条目 */
export function entryFromTranslateResult(text, result, meta = {}) {
  const senses = result.senses || [];
  return normalizeVocabEntry({
    word: text,
    translation: result.translation || sensesToTranslation(senses, ""),
    phonetic: result.phonetic || "",
    senses,
    examples: result.examples || [],
    wordForms: result.wordForms || {},
    sourceTitle: meta.sourceTitle || "",
    sourceUrl: meta.sourceUrl || "",
    difficulty: DIFFICULTY.UNFAMILIAR,
  });
}
