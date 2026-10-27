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
    const synSet = new Set();

    for (const m of entry.meanings || []) {
      const posZh = posToChinese(m.partOfSpeech);
      for (const d of m.definitions || []) {
        if (d.example) exampleCandidates.push(d.example);
        if (Array.isArray(d.synonyms)) {
          for (const s of d.synonyms) if (s && typeof s === "string") synSet.add(s.trim());
        }
      }
      if (m.definitions?.length) {
        // 免费模式：英文释义机翻不可靠，显示词典权威的英文原释义，中文意思见顶部翻译行
        const defTexts = m.definitions
          .map((d) => (d.definition || "").trim())
          .filter(Boolean)
          .slice(0, 2);
        senses.push({ pos: m.partOfSpeech || "", posZh, definitions: defTexts });
      }
    }

    const wordForms = extractWordForms(entry, head);

    // 同义词：优先词典自带；不足时用 Datamuse 免费接口补充（免 Key）
    if (synSet.size < 3) {
      try {
        const sr = await fetchWithTimeout(
          `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(head)}&max=8`,
          {},
          4500
        );
        if (sr.ok) {
          const sdata = await sr.json();
          const more = (Array.isArray(sdata) ? sdata : [])
            .map((x) => (x.word || "").trim())
            .filter((w) => w && w.toLowerCase() !== head.toLowerCase());
          for (const w of more) synSet.add(w);
        }
      } catch {
        /* 同义词获取失败不影响其他功能 */
      }
    }
    const synonyms = [...synSet].slice(0, 8);

    // 取 1~2 条例句并行翻译
    const uniqExamples = [...new Set(exampleCandidates)].slice(0, 2);
    const examples = await Promise.all(uniqExamples.map((ex) => translateLine(ex, translate)));

    return { phonetic, senses, examples, wordForms, synonyms };
  } catch {
    return null;
  }
}

/** 常见不规则词形（覆盖规则推断无法处理的词，命中直接返回，避免 run→runed 之类错误） */
const IRREGULAR_FORMS = {
  good: { comparative: "better", superlative: "best" },
  bad: { comparative: "worse", superlative: "worst" },
  far: { comparative: "farther", superlative: "farthest" },
  little: { comparative: "less", superlative: "least" },
  many: { comparative: "more", superlative: "most" },
  much: { comparative: "more", superlative: "most" },
  go: { past: "went", pastParticiple: "gone" },
  run: { past: "ran", pastParticiple: "run" },
  see: { past: "saw", pastParticiple: "seen" },
  take: { past: "took", pastParticiple: "taken" },
  make: { past: "made", pastParticiple: "made" },
  have: { past: "had", pastParticiple: "had" },
  do: { past: "did", pastParticiple: "done" },
  say: { past: "said", pastParticiple: "said" },
  get: { past: "got", pastParticiple: "gotten" },
  come: { past: "came", pastParticiple: "come" },
  know: { past: "knew", pastParticiple: "known" },
  think: { past: "thought", pastParticiple: "thought" },
  give: { past: "gave", pastParticiple: "given" },
  find: { past: "found", pastParticiple: "found" },
  tell: { past: "told", pastParticiple: "told" },
  become: { past: "became", pastParticiple: "become" },
  feel: { past: "felt", pastParticiple: "felt" },
  put: { past: "put", pastParticiple: "put" },
  bring: { past: "brought", pastParticiple: "brought" },
  begin: { past: "began", pastParticiple: "begun" },
  keep: { past: "kept", pastParticiple: "kept" },
  hold: { past: "held", pastParticiple: "held" },
  write: { past: "wrote", pastParticiple: "written" },
  stand: { past: "stood", pastParticiple: "stood" },
  hear: { past: "heard", pastParticiple: "heard" },
  meet: { past: "met", pastParticiple: "met" },
  pay: { past: "paid", pastParticiple: "paid" },
  sit: { past: "sat", pastParticiple: "sat" },
  speak: { past: "spoke", pastParticiple: "spoken" },
  lead: { past: "led", pastParticiple: "led" },
  read: { past: "read", pastParticiple: "read" },
  grow: { past: "grew", pastParticiple: "grown" },
  lose: { past: "lost", pastParticiple: "lost" },
  fall: { past: "fell", pastParticiple: "fallen" },
  send: { past: "sent", pastParticiple: "sent" },
  build: { past: "built", pastParticiple: "built" },
  draw: { past: "drew", pastParticiple: "drawn" },
  break: { past: "broke", pastParticiple: "broken" },
  spend: { past: "spent", pastParticiple: "spent" },
  cut: { past: "cut", pastParticiple: "cut" },
  rise: { past: "rose", pastParticiple: "risen" },
  drive: { past: "drove", pastParticiple: "driven" },
  buy: { past: "bought", pastParticiple: "bought" },
  wear: { past: "wore", pastParticiple: "worn" },
  choose: { past: "chose", pastParticiple: "chosen" },
  eat: { past: "ate", pastParticiple: "eaten" },
  drink: { past: "drank", pastParticiple: "drunk" },
  sleep: { past: "slept", pastParticiple: "slept" },
  teach: { past: "taught", pastParticiple: "taught" },
  catch: { past: "caught", pastParticiple: "caught" },
  fly: { past: "flew", pastParticiple: "flown" },
  sing: { past: "sang", pastParticiple: "sung" },
  swim: { past: "swam", pastParticiple: "swum" },
  win: { past: "won", pastParticiple: "won" },
  box: { plural: "boxes" },
  tomato: { plural: "tomatoes" },
  potato: { plural: "potatoes" },
  hero: { plural: "heroes" },
  church: { plural: "churches" },
  class: { plural: "classes" },
  bus: { plural: "buses" },
  match: { plural: "matches" },
  watch: { plural: "watches" },
  child: { plural: "children" },
  man: { plural: "men" },
  woman: { plural: "women" },
  foot: { plural: "feet" },
  tooth: { plural: "teeth" },
  mouse: { plural: "mice" },
  person: { plural: "people" },
  sheep: { plural: "sheep" },
  fish: { plural: "fish" },
  deer: { plural: "deer" },
  leaf: { plural: "leaves" },
  knife: { plural: "knives" },
  wife: { plural: "wives" },
  life: { plural: "lives" },
};

/** 解析词形：优先 API 字段，其次按词性做轻量推断（标注为推断） */
function extractWordForms(entry, head) {
  const forms = {};
  const lower = head.toLowerCase();
  if (entry.origin) {
    forms.origin = entry.origin;
  }
  // 以第一个 meaning 的词性为主导，仅生成该词性对应的词形，
  // 避免多词性叠加出现 easys/easyed 这类荒谬变位
  const primary = (entry.meanings?.[0]?.partOfSpeech || "").toLowerCase().trim();
  return inferRegularForms(lower, forms, primary);
}

function inferRegularForms(word, base, primary = "") {
  const out = { ...base };
  if (!/^[a-z]+$/.test(word)) return out;
  // 命中常见不规则词表，直接返回正确词形，不再走规则推断
  const irr = IRREGULAR_FORMS[word];
  if (irr) {
    Object.assign(out, irr);
    out._inferred = true;
    return out;
  }
  // 已是变形形态（进行时 -ing / 过去式 -ed），不再叠加变位，避免 dancing→dancinged
  if (/(ing|ed)$/.test(word) && word.length > 4) {
    out._inferred = true;
    return out;
  }
  // 以 s 结尾多视为复数形式（如 shoes），不再叠加变位
  const pluralLike = word.endsWith("s") && word.length > 1;
  // 以「辅音+y」结尾时变位需 y→i（easy→easier；city→cities）
  const yToI = /[^aeiou]y$/.test(word);
  const eStem = word.endsWith("e") && !word.endsWith("ee") ? word.slice(0, -1) : word;
  const stem = yToI ? word.slice(0, -1) : eStem;

  if (primary === "noun") {
    out.plural = pluralLike ? word : (yToI ? `${stem}ies` : `${word}s`);
  } else if (primary === "verb") {
    out.past = yToI ? `${stem}ied` : (word.endsWith("e") ? `${word}d` : `${word}ed`);
    out.pastParticiple = out.past;
  } else if (primary === "adjective") {
    out.comparative = yToI ? `${stem}ier` : `${eStem}er`;
    out.superlative = yToI ? `${stem}iest` : `${eStem}est`;
  } else if (!primary) {
    // 无词性信息：保守只给复数
    if (!pluralLike) out.plural = yToI ? `${stem}ies` : `${word}s`;
  }
  // 代词 / 副词 / 介词等明确词性无规则变位，不生成
  out._inferred = true;
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
