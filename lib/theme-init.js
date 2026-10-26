import { applyThemeToDocument } from "./themes.js";
import { send } from "./messaging.js";

/** 页面加载时从 storage 读取主题并应用（失败则用蓝色） */
export async function initThemeOnPage() {
  try {
    const res = await send("GET_SETTINGS");
    const theme = res?.settings?.theme || "blue";
    applyThemeToDocument(document, theme);
  } catch {
    applyThemeToDocument(document, "blue");
  }
}
