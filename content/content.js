(function () {
  if (window.__WST_CONTENT_LOADED__) return;
  window.__WST_CONTENT_LOADED__ = true;

  const ENGLISH_RE = /[a-zA-Z]/;
  const ROOT_ID = "wst-root";

  let panel = null;
  let toastEl = null;
  let dragState = null;
  let selectionTimer = null;
  let lastSelectionText = "";
  let autoPopupEnabled = true;
  let maxSelectionLength = 500;
  let currentData = {};

  function isLikelyEnglish(text) {
    const t = text.trim();
    if (!t || t.length > maxSelectionLength) return false;
    if (!ENGLISH_RE.test(t)) return false;
    const letters = (t.match(/[a-zA-Z]/g) || []).length;
    return letters / t.length >= 0.5;
  }

  function ensureUi() {
    if (document.getElementById(ROOT_ID)) return;

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div id="wst-panel" class="wst-hidden" role="dialog" aria-label="划词翻译">
        <div class="wst-header">
          <span class="wst-title">划词翻译</span>
          <button type="button" class="wst-speak" title="朗读发音" aria-label="朗读">🔊</button>
          <button type="button" class="wst-close" title="关闭" aria-label="关闭">×</button>
        </div>
        <div class="wst-body">
          <div class="wst-word"></div>
          <div class="wst-phonetic"></div>
          <div class="wst-translation"><span class="wst-loading">翻译中…</span></div>
          <div class="wst-senses"></div>
          <div class="wst-forms"></div>
          <div class="wst-examples"></div>
          <div class="wst-synonyms"></div>
          <div class="wst-toast"></div>
        </div>
        <div class="wst-appearance">
          <span class="wst-app-label">外观</span>
          <div class="wst-app-colors">
            <span class="wst-color active" data-c="#4f46e5" data-soft="#eef2ff" style="background:#4f46e5" title="蓝"></span>
            <span class="wst-color" data-c="#ec4899" data-soft="#fdf2f8" style="background:#ec4899" title="粉"></span>
            <span class="wst-color" data-c="#eab308" data-soft="#fefce8" style="background:#eab308" title="黄"></span>
            <span class="wst-color" data-c="#8b5cf6" data-soft="#f5f3ff" style="background:#8b5cf6" title="紫"></span>
            <span class="wst-color" data-c="#10b981" data-soft="#ecfdf5" style="background:#10b981" title="绿"></span>
          </div>
          <button type="button" class="wst-lace-btn" title="切换花边">🌸</button>
        </div>
        <div class="wst-footer">
          <button type="button" class="wst-btn wst-btn-save wst-btn-primary">存入生词本</button>
          <button type="button" class="wst-btn wst-btn-copy">复制译文</button>
          <button type="button" class="wst-btn wst-btn-vocab" title="打开生词本完整页">生词本</button>
        </div>
      </div>
      <div id="wst-toast-fixed"></div>
    `;
    document.documentElement.appendChild(root);

    panel = root.querySelector("#wst-panel");
    toastEl = root.querySelector("#wst-toast-fixed");

    panel.querySelector(".wst-close").addEventListener("click", hidePanel);
    panel.querySelector(".wst-btn-save").addEventListener("click", onSaveVocab);
    panel.querySelector(".wst-btn-copy").addEventListener("click", onCopy);
    panel.querySelector(".wst-btn-vocab").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_VOCAB_PAGE" });
    });
    panel.querySelector(".wst-speak").addEventListener("click", onSpeak);

    panel.querySelectorAll(".wst-color").forEach((dot) => {
      dot.addEventListener("click", () => {
        panel.style.setProperty("--wstp", dot.dataset.c);
        panel.style.setProperty("--wstp-soft", dot.dataset.soft);
        panel.querySelectorAll(".wst-color").forEach((d) => d.classList.toggle("active", d === dot));
      });
    });
    panel.querySelector(".wst-lace-btn").addEventListener("click", (e) => {
      panel.classList.toggle("wst-laced");
      e.currentTarget.classList.toggle("active");
    });

    const header = panel.querySelector(".wst-header");
    header.addEventListener("mousedown", onDragStart);

    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);

    document.addEventListener("mousedown", (e) => {
      if (!panel || panel.classList.contains("wst-hidden")) return;
      if (panel.contains(e.target)) return;
      hidePanel();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hidePanel();
    });
  }

  function hidePanel() {
    if (panel) panel.classList.add("wst-hidden");
  }

  function positionPanel(clientX, clientY) {
    const rect = panel.getBoundingClientRect();
    const margin = 12;
    let left = clientX + 12;
    let top = clientY + 12;
    if (left + rect.width > window.innerWidth - margin) {
      left = window.innerWidth - rect.width - margin;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = clientY - rect.height - 12;
    }
    left = Math.max(margin, left);
    top = Math.max(margin, top);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  const FORM_LABELS = {
    past: "过去式",
    pastParticiple: "过去分词",
    plural: "复数",
    comparative: "比较级",
    superlative: "最高级",
    thirdPerson: "第三人称单数",
  };

  function renderSenses(senses) {
    if (!senses?.length) return "";
    return senses
      .map((s) => {
        const defs = (s.definitions || []).map(escapeHtml).join("；");
        return `<div class="wst-sense"><span class="wst-pos">${escapeHtml(s.posZh || s.pos || "")}</span>${defs ? `<span class="wst-defs">${defs}</span>` : ""}</div>`;
      })
      .join("");
  }

  function renderForms(wordForms) {
    if (!wordForms || typeof wordForms !== "object") return "";
    const keys = Object.keys(wordForms).filter(
      (k) => k !== "origin" && k !== "_inferred"
    );
    if (!keys.length) return "";
    return (
      '<div class="wst-forms-title">词形变化</div>' +
      keys
        .map(
          (k) =>
            `<span class="wst-form"><b>${FORM_LABELS[k] || k}</b> ${escapeHtml(wordForms[k])}</span>`
        )
        .join(" ")
    );
  }

  function renderExamples(examples) {
    if (!examples?.length) return "";
    return examples
      .map(
        (ex) =>
          `<div class="wst-ex"><span class="wst-ex-en">${escapeHtml(ex.en)}</span>${ex.zh ? `<span class="wst-ex-zh">${escapeHtml(ex.zh)}</span>` : ""}</div>`
      )
      .join("");
  }

  function renderSynonyms(synonyms) {
    const arr = (Array.isArray(synonyms) ? synonyms : []).filter(Boolean).slice(0, 8);
    if (!arr.length) return "";
    return (
      '<div class="wst-syn-title">同义词</div>' +
      arr.map((s) => `<span class="wst-syn">${escapeHtml(s)}</span>`).join("")
    );
  }

  function setPanelContent(data = {}) {
    const { word, translation, phonetic, senses, examples, wordForms, synonyms, loading, error, saved } = data;
    currentData = { word: word || "", translation: translation || "", phonetic: phonetic || "", senses: senses || [], examples: examples || [], wordForms: wordForms || {}, synonyms: Array.isArray(synonyms) ? synonyms : [] };

    panel.querySelector(".wst-word").textContent = currentData.word;
    const ph = panel.querySelector(".wst-phonetic");
    ph.textContent = phonetic ? phonetic : "";
    ph.style.display = phonetic ? "block" : "none";

    const box = panel.querySelector(".wst-translation");
    const toast = panel.querySelector(".wst-toast");
    toast.textContent = saved ? "已存入生词本" : "";

    if (loading) {
      box.innerHTML = '<span class="wst-loading">翻译中…</span>';
      panel.querySelector(".wst-senses").innerHTML = "";
      panel.querySelector(".wst-forms").innerHTML = "";
      panel.querySelector(".wst-examples").innerHTML = "";
      panel.querySelector(".wst-synonyms").innerHTML = "";
      return;
    }
    if (error) {
      box.innerHTML = `<span class="wst-error">${escapeHtml(error)}</span>`;
      panel.querySelector(".wst-senses").innerHTML = "";
      panel.querySelector(".wst-forms").innerHTML = "";
      panel.querySelector(".wst-examples").innerHTML = "";
      panel.querySelector(".wst-synonyms").innerHTML = "";
      return;
    }
    box.textContent = translation || "—";
    panel.querySelector(".wst-senses").innerHTML = renderSenses(senses);
    panel.querySelector(".wst-forms").innerHTML = renderForms(wordForms);
    panel.querySelector(".wst-examples").innerHTML = renderExamples(examples);
    panel.querySelector(".wst-synonyms").innerHTML = renderSynonyms(synonyms);
  }

  function onSpeak() {
    const word = currentData.word;
    if (!word) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = "en-US";
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch {
      /* 忽略 TTS 失败 */
    }
  }

  async function showTranslation(text, opts = {}) {
    ensureUi();
    const { x, y, preloaded } = opts;
    panel.classList.remove("wst-hidden");
    setPanelContent({
      word: text,
      loading: !preloaded && !opts.error,
      translation: preloaded?.translation,
      phonetic: preloaded?.phonetic,
      senses: preloaded?.senses,
      examples: preloaded?.examples,
      wordForms: preloaded?.wordForms,
      synonyms: preloaded?.synonyms,
      error: opts.error,
      saved: opts.saved,
    });
    positionPanel(x ?? window.innerWidth / 2, y ?? 80);

    if (preloaded || opts.error) return preloaded;

    const res = await chrome.runtime.sendMessage({ type: "TRANSLATE", text });
    if (!res?.ok) {
      setPanelContent({ word: text, error: res?.error || "翻译失败" });
      return null;
    }
    setPanelContent({
      word: text,
      translation: res.translation,
      phonetic: res.phonetic || "",
      senses: res.senses,
      examples: res.examples,
      wordForms: res.wordForms,
      synonyms: res.synonyms,
    });
    return res;
  }

  async function onSaveVocab() {
    const { word, translation, phonetic, senses, examples, wordForms } = currentData;
    if (!word || !translation) return;

    const res = await chrome.runtime.sendMessage({
      type: "ADD_VOCAB",
      entry: {
        word,
        translation,
        phonetic,
        senses,
        examples,
        wordForms,
        synonyms: currentData.synonyms,
        sourceTitle: document.title,
        sourceUrl: location.href,
      },
    });
    if (res?.ok) {
      panel.querySelector(".wst-toast").textContent = "已存入生词本";
      showFixedToast("已加入生词本");
    }
  }

  async function onCopy() {
    const t = currentData.translation;
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      showFixedToast("译文已复制");
    } catch {
      showFixedToast("复制失败");
    }
  }

  function showFixedToast(msg) {
    ensureUi();
    toastEl.textContent = msg;
    toastEl.classList.add("wst-show");
    clearTimeout(showFixedToast._t);
    showFixedToast._t = setTimeout(() => toastEl.classList.remove("wst-show"), 1800);
  }

  function onDragStart(e) {
    if (e.button !== 0) return;
    if (!e.target.closest(".wst-header")) return;
    const rect = panel.getBoundingClientRect();
    dragState = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
    };
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!dragState) return;
    panel.style.left = `${e.clientX - dragState.dx}px`;
    panel.style.top = `${e.clientY - dragState.dy}px`;
  }

  function onDragEnd() {
    dragState = null;
  }

  function getSelectionMeta() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = sel.toString().trim();
    if (!isLikelyEnglish(text)) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const x = rect.right || rect.left;
    const y = rect.bottom || rect.top;
    return { text, x, y };
  }

  document.addEventListener("mouseup", (e) => {
    if (panel?.contains(e.target)) return;
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(async () => {
      if (!autoPopupEnabled) return;
      const meta = getSelectionMeta();
      if (!meta) {
        lastSelectionText = "";
        return;
      }
      if (meta.text === lastSelectionText && !panel?.classList.contains("wst-hidden")) {
        return;
      }
      lastSelectionText = meta.text;
      await showTranslation(meta.text, { x: meta.x, y: meta.y });
    }, 280);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SHOW_TRANSLATION_FOR") {
      const x = window.innerWidth / 2 - 160;
      const y = 100;
      showTranslation(msg.text, {
        x,
        y,
        preloaded: msg.translation
          ? {
              translation: msg.translation,
              phonetic: msg.phonetic,
              senses: msg.senses,
              examples: msg.examples,
              wordForms: msg.wordForms,
              synonyms: msg.synonyms,
            }
          : undefined,
        error: msg.error,
        saved: msg.saved,
      });
    }
    if (msg.type === "VOCAB_SAVED") {
      showFixedToast(`「${msg.word}」已加入生词本`);
    }
  });

  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).then((res) => {
    if (res?.ok && res.settings) {
      autoPopupEnabled = res.settings.autoPopup !== false;
      maxSelectionLength = res.settings.maxSelectionLength || 500;
    }
  });

  /* ---------- 生词自动高亮 ---------- */
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async function highlightKnownWords() {
    try {
      const vocab = await chrome.runtime.sendMessage({ type: "GET_VOCAB" });
      const words = (vocab?.ok ? vocab.list : [])
        .map((x) => (x.word || "").trim())
        .filter((w) => /^[a-zA-Z][a-zA-Z'-]*$/.test(w));
      if (!words.length || !document.body) return;

      const pattern = new RegExp(`\\b(${words.map(escapeRegExp).join("|")})\\b`, "gi");

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const t = node.nodeValue;
          if (!t || !t.trim()) return NodeFilter.FILTER_REJECT;
          const tag = (node.parentElement && node.parentElement.tagName) || "";
          if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "OPTION", "PRE", "CODE"].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      for (const node of textNodes) {
        const text = node.nodeValue;
        if (!text) continue;
        pattern.lastIndex = 0;
        if (!pattern.test(text)) continue;
        const frag = document.createDocumentFragment();
        let last = 0;
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(text))) {
          if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
          const span = document.createElement("span");
          span.className = "wst-hl";
          span.textContent = m[0];
          span.title = "生词本中的单词，点击查看";
          span.addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "TRANSLATE", text: m[0] }).then((res) => {
              if (res?.ok) {
                showTranslation(m[0], {
                  x: Math.min(window.innerWidth - 200, window.innerWidth / 2),
                  y: 100,
                  preloaded: {
                    translation: res.translation,
                    phonetic: res.phonetic,
                    senses: res.senses,
                    examples: res.examples,
                    wordForms: res.wordForms,
                    synonyms: res.synonyms,
                  },
                });
              }
            });
          });
          frag.appendChild(span);
          last = m.index + m[0].length;
          if (m.index === pattern.lastIndex) pattern.lastIndex++;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      }
    } catch {
      /* 高亮失败不影响其他功能 */
    }
  }

  async function initHighlight() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
      if (res?.ok && res.settings?.highlightAuto === false) return;
      await highlightKnownWords();
    } catch {
      /* 忽略 */
    }
  }

  initHighlight();
})();
