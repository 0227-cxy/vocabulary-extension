import { posToChinese } from "./pos.js";
import { fetchWithTimeout } from "./translate.js";

const DICT = "https://api.dictionaryapi.dev/api/v2/entries/en";
const MYMEMORY = "https://api.mymemory.translated.net/get";

/** 提取可用于查词典的单个英文词 */
export function extractHeadword(text) {
  const w = String(text || "")
    .trim()
    .split(/\s+/)[0]
    .replace(/[^a-zA-Z'-]/g, "");
  if (!w || /\s/.test(w)) return "";
  return w.toLowerCase();
}

/** 尝试翻译例句（优先用外部统一翻译引擎，失败则保留英文，降级不影响主流程） */
async function translateLine(en, translate) {
  const text = String(en || "").trim();
  if (!text) return { en: "", zh: "" };
  if (translate) {
    try {
      const zh = await translate(text.slice(0, 280));
      return { en: text, zh: zh || "" };
    } catch {
      return { en: text, zh: "" };
    }
  }
  try {
    const q = encodeURIComponent(text.slice(0, 280));
    const res = await fetchWithTimeout(`${MYMEMORY}?q=${q}&langpair=en|zh-CN`, {}, 6000);
    if (!res.ok) return { en: text, zh: "" };
    const data = await res.json();
    const zh = data.responseData?.translatedText?.trim() || "";
    return { en: text, zh };
  } catch {
    return { en: text, zh: "" };
  }
}

/** 从 Free Dictionary 拉取音标、词性义项、例句、词形（若 API 提供） */
export async function fetchDictionaryDetails(text, opts = {}) {
  const { translate } = opts;
  const head = extractHeadword(text);
  if (!head) return null;
  try {
    const res = await fetchWithTimeout(`${DICT}/${encodeURIComponent(head)}`, {}, 6000);
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data[0];
    if (!entry) return null;

    let phonetic =
      entry.phonetics?.find((p) => p.text)?.text ||
      entry.phonetic ||
      "";

    const senses = [];
    const exampleCandidates = [];

    for (const m of entry.meanings || []) {
      const posZh = posToChinese(m.partOfSpeech);
      for (const d of m.definitions || []) {
        if (d.example) exampleCandidates.push(d.example);
      }
      if (m.definitions?.length) {
        // 免费模式：英文释义机翻质量差，只保留词性标签，不显示绕口释义（避免鬼话）
        senses.push({ pos: m.partOfSpeech || "", posZh, definitions: [] });
      }
    }

    const wordForms = extractWordForms(entry, head);

    // 取 1~2 条例句并行翻译
    const uniqExamples = [...new Set(exampleCandidates)].slice(0, 2);
    const examples = await Promise.all(uniqExamples.map((ex) => translateLine(ex, translate)));

    return { phonetic, senses, examples, wordForms };
  } catch {
    return null;
  }
}

/** 解析词形：优先 API 字段，其次简单规则推断（标注为推断） */
function extractWordForms(entry, head) {
  const forms = {};
  // dictionaryapi.dev 部分词条在 origin / 文本中无统一词形字段，做轻量推断
  const lower = head.toLowerCase();
  if (/^[a-z]+ed$/.test(lower) || entry.meanings?.some((m) => m.partOfSpeech === "verb")) {
    // 不规则无法可靠推断，仅对 looks-like 单音节做提示
  }
  if (entry.origin) {
    // 保留 origin 供展示时可选
    forms.origin = entry.origin;
  }
  // 常见复数/比较级：从 defs 文本中 rarely — skip
  return inferRegularForms(lower, forms);
}

function inferRegularForms(word, base) {
  const out = { ...base };
  if (/^[a-z]+$/.test(word)) {
    if (!word.endsWith("s")) out.plural = `${word}s`;
    if (!word.endsWith("ed")) out.past = `${word}${word.endsWith("e") ? "d" : "ed"}`;
    if (!word.endsWith("ed")) out.pastParticiple = out.past;
    if (word.length <= 6 && !word.endsWith("er")) {
      // 以 e 结尾需先去 e 再加 er/est（humble→humbler/humblest）
      const stem = word.endsWith("e") ? word.slice(0, -1) : word;
      out.comparative = `${stem}er`;
      out.superlative = `${stem}est`;
    }
    out._inferred = true;
  }
  return out;
}

/** 合并有道 basic 字段到词典结构（降级：解析失败则忽略） */
export function parseYoudaoBasic(basic) {
  if (!basic) return { senses: [], phonetic: "", wordForms: {}, examples: [] };
  let phonetic = basic.phonetic ? `/${basic.phonetic}/` : "";
  const senses = [];
  if (basic.explains?.length) {
    // 有道 explains 多为「n. xxx」格式
    const groups = {};
    for (const line of basic.explains) {
      const m = String(line).match(/^([a-z]+\.)\s*(.+)$/i);
      if (m) {
        const posKey = m[1].replace(".", "");
        const posZh = posToChinese(posKey);
        if (!groups[posZh]) groups[posZh] = { pos: posKey, posZh, definitions: [] };
        groups[posZh].definitions.push(m[2]);
      } else {
        if (!groups["_"]) groups["_"] = { pos: "", posZh: "释义", definitions: [] };
        groups["_"].definitions.push(line);
      }
    }
    senses.push(...Object.values(groups));
  }
  const wordForms = {};
  for (const item of basic.wfs || []) {
    const name = item.wf?.name;
    const value = item.wf?.value;
    if (!name || !value) continue;
    if (name.includes("过去式")) wordForms.past = value;
    else if (name.includes("过去分词")) wordForms.pastParticiple = value;
    else if (name.includes("复数")) wordForms.plural = value;
    else if (name.includes("比较级")) wordForms.comparative = value;
    else if (name.includes("最高级")) wordForms.superlative = value;
  }
  return { phonetic, senses, wordForms, examples: [] };
}

/** 将义项列表压成单行 translation 字符串（兼容旧字段） */
export function sensesToTranslation(senses, fallback) {
  if (!senses?.length) return fallback || "";
  const parts = [];
  for (const s of senses) {
    const head = s.posZh ? `${s.posZh} ` : "";
    parts.push(head + (s.definitions || []).slice(0, 3).join("；"));
  }
  return parts.join(" | ") || fallback || "";
}
