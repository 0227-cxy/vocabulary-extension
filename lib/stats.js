const STATS_KEY = "learningStats";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayDiff(a, b) {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db - da) / 86400000);
}

const DEFAULT_STATS = {
  todayDate: "",
  todayNew: 0,
  totalAdded: 0,
  streak: 0,
  lastActiveDate: "",
  milestonesCelebrated: [],
};

export async function getLearningStats() {
  const data = await chrome.storage.local.get(STATS_KEY);
  return { ...DEFAULT_STATS, ...(data[STATS_KEY] || {}) };
}

async function saveLearningStats(stats) {
  await chrome.storage.local.set({ [STATS_KEY]: stats });
}

/** 新词入库时更新统计（重复更新同一词不计入今日新增） */
export async function recordNewVocabAdded(isBrandNew) {
  try {
    const stats = await getLearningStats();
    const today = todayKey();
    if (stats.todayDate !== today) {
      stats.todayDate = today;
      stats.todayNew = 0;
    }
    if (isBrandNew) {
      stats.todayNew += 1;
      stats.totalAdded += 1;
    }
    await touchActiveDay(stats);
    return stats;
  } catch {
    return null;
  }
}

/** 打卡：复习答对、打开学习页等 */
export async function touchActiveDay(statsIn) {
  try {
    const stats = statsIn || (await getLearningStats());
    const today = todayKey();
    if (stats.lastActiveDate === today) {
      await saveLearningStats(stats);
      return stats;
    }
    if (!stats.lastActiveDate) {
      stats.streak = 1;
    } else {
      const diff = dayDiff(stats.lastActiveDate, today);
      if (diff === 1) stats.streak += 1;
      else if (diff > 1) stats.streak = 1;
    }
    stats.lastActiveDate = today;
    if (stats.todayDate !== today) {
      stats.todayDate = today;
      stats.todayNew = stats.todayNew || 0;
    }
    await saveLearningStats(stats);
    return stats;
  } catch {
    return statsIn || null;
  }
}

export async function getStatsForDisplay(vocabCount) {
  const stats = await touchActiveDay();
  return {
    todayNew: stats?.todayNew || 0,
    totalWords: vocabCount,
    streak: stats?.streak || 0,
  };
}

export function markMilestone(stats, count) {
  const milestones = [10, 50, 100];
  if (!milestones.includes(count)) return null;
  if (stats.milestonesCelebrated?.includes(count)) return null;
  stats.milestonesCelebrated = [...(stats.milestonesCelebrated || []), count];
  return count;
}
