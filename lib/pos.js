/** 英文词性 → 中文展示（词典式释义用） */
export const POS_TO_ZH = {
  noun: "n. 名词",
  "pro noun": "pron. 代词",
  pronoun: "pron. 代词",
  verb: "v. 动词",
  "auxiliary verb": "v. 助动词",
  adjective: "adj. 形容词",
  adverb: "adv. 副词",
  preposition: "prep. 介词",
  conjunction: "conj. 连词",
  interjection: "int. 感叹词",
  article: "art. 冠词",
  determiner: "det. 限定词",
  abbreviation: "abbr. 缩写",
  exclamation: "int. 感叹词",
  idiom: "idiom 习语",
  phrase: "phr. 短语",
};

/** 将接口返回的词性字符串规范并转为中文；未知则原样附带缩写说明 */
export function posToChinese(posRaw) {
  if (!posRaw) return "";
  const key = String(posRaw).trim().toLowerCase();
  if (POS_TO_ZH[key]) return POS_TO_ZH[key];
  // 常见缩写
  const short = {
    n: "n. 名词",
    v: "v. 动词",
    adj: "adj. 形容词",
    adv: "adv. 副词",
  };
  if (short[key]) return short[key];
  return `${posRaw}`;
}
