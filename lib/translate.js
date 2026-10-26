import { md5Hex } from "./md5.js";
import { posToChinese } from "./pos.js";

const MYMEMORY = "https://api.mymemory.translated.net/get";
const YOUDAO = "https://openapi.youdao.com/api";
const BAIDU = "https://fanyi-api.baidu.com/api/trans/vip/translate";
const DICT = "https://api.dictionaryapi.dev/api/v2/entries/en";

function truncateForApi(text, max = 480) {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

/** 带超时的 fetch：接口慢/挂起时及时 abort，避免一直"翻译中" */
export async function fetchWithTimeout(url, options = {}, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPhonetic(word) {
  const w = word.trim().split(/\s+/)[0].replace(/[^a-zA-Z'-]/g, "");
  if (!w || w.includes(" ")) return "";
  try {
    const res = await fetchWithTimeout(`${DICT}/${encodeURIComponent(w.toLowerCase())}`, {}, 5000);
    if (!res.ok) return "";
    const data = await res.json();
    const entry = data[0];
    if (!entry?.phonetics?.length) return "";
    const p =
      entry.phonetics.find((x) => x.text)?.text ||
      entry.phonetic ||
      "";
    return p;
  } catch {
    return "";
  }
}

async function translateMyMemory(text) {
  const q = encodeURIComponent(truncateForApi(text));
  const url = `${MYMEMORY}?q=${q}&langpair=en|zh-CN`;
  const res = await fetchWithTimeout(url, {}, 7000);
  if (!res.ok) throw new Error("MyMemory 请求失败");
  const data = await res.json();
  if (data.responseStatus !== 200 && !data.responseData?.translatedText) {
    throw new Error(data.responseDetails || "MyMemory 翻译失败");
  }
  const translation = data.responseData?.translatedText?.trim();
  if (!translation) throw new Error("未获取到译文");
  return { translation, provider: "mymemory" };
}

async function translateYoudao(text, youdao) {
  const { appKey, appSecret } = youdao || {};
  if (!appKey || !appSecret) throw new Error("请先配置有道智云 AppKey 与 AppSecret");

  const q = truncateForApi(text);
  const salt = String(Date.now());
  const curtime = String(Math.round(Date.now() / 1000));
  const input =
    q.length <= 20 ? q : `${q.slice(0, 10)}${q.length}${q.slice(-10)}`;
  const signStr = appKey + input + salt + curtime + appSecret;
  const sign = await md5Hex(signStr);

  const body = new URLSearchParams({
    q,
    from: "en",
    to: "zh-CHS",
    appKey,
    salt,
    sign,
    signType: "v3",
    curtime,
  });

  const res = await fetchWithTimeout(YOUDAO, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, 7000);
  if (!res.ok) throw new Error("有道 API 请求失败");
  const data = await res.json();
  if (data.errorCode !== "0") {
    throw new Error(data.errorCode ? `有道错误码 ${data.errorCode}` : "有道翻译失败");
  }
  const translation = (data.translation && data.translation[0]) || "";
  if (!translation) throw new Error("未获取到译文");
  let phonetic = "";
  if (data.basic?.phonetic) phonetic = `/${data.basic.phonetic}/`;

  // 有道 basic 自带中文释义（explains）与词形，质量专业，直接复用
  const senses = [];
  if (data.basic?.explains?.length) {
    const groups = {};
    for (const line of data.basic.explains) {
      const m = String(line).match(/^([a-z]+\.)\s*(.+)$/i);
      if (m) {
        const posKey = m[1].replace(".", "");
        const posZh = posToChinese(posKey);
        if (!groups[posKey]) groups[posKey] = { pos: posKey, posZh, definitions: [] };
        groups[posKey].definitions.push(m[2]);
      }
    }
    senses.push(...Object.values(groups));
  }
  const wordForms = {};
  for (const item of data.basic?.wfs || []) {
    const name = item.wf?.name;
    const value = item.wf?.value;
    if (!name || !value) continue;
    if (name.includes("过去式")) wordForms.past = value;
    else if (name.includes("过去分词")) wordForms.pastParticiple = value;
    else if (name.includes("复数")) wordForms.plural = value;
    else if (name.includes("比较级")) wordForms.comparative = value;
    else if (name.includes("最高级")) wordForms.superlative = value;
  }

  return { translation, phonetic, provider: "youdao", senses, wordForms };
}

async function translateBaidu(text, baidu) {
  const { appId, secret } = baidu || {};
  if (!appId || !secret) throw new Error("请先配置百度翻译 AppID 与密钥");

  const q = truncateForApi(text);
  const salt = String(Date.now());
  const sign = await md5Hex(appId + q + salt + secret);

  const body = new URLSearchParams({
    q,
    from: "en",
    to: "zh",
    appid: appId,
    salt,
    sign,
  });

  const res = await fetchWithTimeout(BAIDU, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, 7000);
  if (!res.ok) throw new Error("百度 API 请求失败");
  const data = await res.json();
  if (data.error_code) {
    throw new Error(`百度错误 ${data.error_code}: ${data.error_msg || ""}`);
  }
  const translation = data.trans_result?.[0]?.dst?.trim();
  if (!translation) throw new Error("未获取到译文");
  return { translation, provider: "baidu" };
}

export async function translateText(text, settings) {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("文本为空");

  const provider = settings?.provider || "mymemory";
  let result;

  try {
    if (provider === "youdao") {
      result = await translateYoudao(trimmed, settings.youdao);
    } else if (provider === "baidu") {
      result = await translateBaidu(trimmed, settings.baidu);
    } else {
      result = await translateMyMemory(trimmed);
    }
  } catch (primaryErr) {
    if (provider !== "mymemory") {
      try {
        result = await translateMyMemory(trimmed);
        result.fallback = true;
        result.fallbackReason = primaryErr.message;
      } catch {
        throw primaryErr;
      }
    } else {
      throw primaryErr;
    }
  }

  if (!result.phonetic && /^\s*[a-zA-Z'-]+\s*$/.test(trimmed)) {
    result.phonetic = await fetchPhonetic(trimmed);
  }

  return result;
}
