/** 小猫鼓励语库 */
const MESSAGES_SAVE = [
  "好棒，又记住一个新词！",
  "积少成多，继续保持～",
  "这个词被你拿下啦！",
  "学习的小步，也是进步！",
  "喵～记下来了！",
];

const MESSAGES_REVIEW = [
  "答对啦，真厉害！",
  "记忆很牢固呢～",
  "继续保持这个节奏！",
  "喵呜，满分气质！",
];

const MILESTONE_MSG = {
  10: "🎉 已经 10 个词啦，小猫为你撒花！",
  50: "🎊 50 个词！你已经很强了！",
  100: "🏆 100 个词达成！传奇学习者！",
};

export function randomMessage(type = "save") {
  const pool = type === "review" ? MESSAGES_REVIEW : MESSAGES_SAVE;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function milestoneMessage(count) {
  return MILESTONE_MSG[count] || null;
}

/**
 * 根据连续学习天数返回表情 class
 * 0-1: normal, 2-4: happy, 5+: star
 */
export function catMoodClass(streak) {
  if (streak >= 5) return "wst-cat-mood-star";
  if (streak >= 2) return "wst-cat-mood-happy";
  return "wst-cat-mood-normal";
}

/** 内联 SVG 小猫（男女通用、中性可爱风） */
export function catSvgHtml(moodClass = "") {
  return `
  <div class="wst-cat ${moodClass}" aria-hidden="true">
    <svg viewBox="0 0 80 80" width="64" height="64" class="wst-cat-svg">
      <ellipse cx="40" cy="52" rx="26" ry="22" fill="#F4E4C8"/>
      <path d="M18 28 L26 14 L32 30 Z" fill="#F4E4C8"/>
      <path d="M62 28 L54 14 L48 30 Z" fill="#F4E4C8"/>
      <circle cx="40" cy="48" r="22" fill="#FFF8EE"/>
      <ellipse class="wst-cat-eye" cx="32" cy="46" rx="3" ry="4" fill="#334155"/>
      <ellipse class="wst-cat-eye" cx="48" cy="46" rx="3" ry="4" fill="#334155"/>
      <path class="wst-cat-mouth" d="M36 54 Q40 58 44 54" stroke="#64748b" stroke-width="1.5" fill="none"/>
      <ellipse cx="26" cy="52" rx="4" ry="2.5" fill="#FECACA" opacity=".45"/>
      <ellipse cx="54" cy="52" rx="4" ry="2.5" fill="#FECACA" opacity=".45"/>
      <path class="wst-cat-blush" d="M22 38 Q40 32 58 38" stroke="#F9A8D4" stroke-width="2" fill="none" opacity="0"/>
    </svg>
    <div class="wst-cat-bubble"></div>
  </div>`;
}

export function buildCatWidgetHTML(streak = 0) {
  return catSvgHtml(catMoodClass(streak));
}
