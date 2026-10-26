export function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

export async function getVocab() {
  const res = await send("GET_VOCAB");
  if (!res?.ok) throw new Error(res?.error || "读取生词本失败");
  return res.list;
}

export async function removeVocab(id) {
  const res = await send("REMOVE_VOCAB", { id });
  if (!res?.ok) throw new Error(res?.error || "删除失败");
}

export async function clearVocab() {
  const res = await send("CLEAR_VOCAB");
  if (!res?.ok) throw new Error(res?.error || "清空失败");
}

export async function addVocab(entry) {
  const res = await send("ADD_VOCAB", { entry });
  if (!res?.ok) throw new Error(res?.error || "添加失败");
  return res.entry;
}

export async function setVocab(list) {
  const res = await send("SET_VOCAB", { list });
  if (!res?.ok) throw new Error(res?.error || "保存失败");
}

export async function translate(text) {
  const res = await send("TRANSLATE", { text });
  if (!res?.ok) throw new Error(res?.error || "翻译失败");
  return res;
}
