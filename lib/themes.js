/** 多主题色：蓝 / 粉 / 黄 / 紫 / 绿 */
export const THEMES = {
  blue: {
    "--wst-bg": "#f0f7ff",
    "--wst-surface": "#ffffff",
    "--wst-border": "#dbeafe",
    "--wst-text": "#1e3a5f",
    "--wst-muted": "#64748b",
    "--wst-primary": "#2563eb",
    "--wst-primary-hover": "#1d4ed8",
    "--wst-accent-soft": "#eff6ff",
    "--wst-danger": "#dc2626",
    "--wst-radius": "14px",
    "--wst-shadow": "0 10px 32px rgba(37, 99, 235, 0.1)",
  },
  pink: {
    "--wst-bg": "#fff5f7",
    "--wst-surface": "#ffffff",
    "--wst-border": "#fce7f3",
    "--wst-text": "#4a3040",
    "--wst-muted": "#9d8189",
    "--wst-primary": "#db2777",
    "--wst-primary-hover": "#be185d",
    "--wst-accent-soft": "#fdf2f8",
    "--wst-danger": "#dc2626",
    "--wst-radius": "14px",
    "--wst-shadow": "0 10px 32px rgba(219, 39, 119, 0.1)",
  },
  yellow: {
    "--wst-bg": "#fffbeb",
    "--wst-surface": "#ffffff",
    "--wst-border": "#fde68a",
    "--wst-text": "#422006",
    "--wst-muted": "#78716c",
    "--wst-primary": "#d97706",
    "--wst-primary-hover": "#b45309",
    "--wst-accent-soft": "#fef3c7",
    "--wst-danger": "#dc2626",
    "--wst-radius": "14px",
    "--wst-shadow": "0 10px 32px rgba(217, 119, 6, 0.12)",
  },
  purple: {
    "--wst-bg": "#f5f3ff",
    "--wst-surface": "#ffffff",
    "--wst-border": "#ddd6fe",
    "--wst-text": "#3b0764",
    "--wst-muted": "#7c6a9a",
    "--wst-primary": "#7c3aed",
    "--wst-primary-hover": "#6d28d9",
    "--wst-accent-soft": "#ede9fe",
    "--wst-danger": "#dc2626",
    "--wst-radius": "14px",
    "--wst-shadow": "0 10px 32px rgba(124, 58, 237, 0.1)",
  },
  green: {
    "--wst-bg": "#ecfdf5",
    "--wst-surface": "#ffffff",
    "--wst-border": "#a7f3d0",
    "--wst-text": "#064e3b",
    "--wst-muted": "#6b7280",
    "--wst-primary": "#059669",
    "--wst-primary-hover": "#047857",
    "--wst-accent-soft": "#d1fae5",
    "--wst-danger": "#dc2626",
    "--wst-radius": "14px",
    "--wst-shadow": "0 10px 32px rgba(5, 150, 105, 0.1)",
  },
};

export function applyThemeToDocument(doc, themeId) {
  const vars = THEMES[themeId] || THEMES.blue;
  const root = doc.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  root.dataset.wstTheme = themeId;
}
