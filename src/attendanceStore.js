const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'attendance.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    // نحاول نجيب البيانات من متغير البيئة لو موجود (للـ Railway)
    const envData = process.env.BOT_PERSIST_DATA;
    if (envData) {
      try {
        const parsed = JSON.parse(Buffer.from(envData, 'base64').toString('utf8'));
        fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf8');
        return;
      } catch { /* نكمل بالملف الجديد */ }
    }
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        {
          active: {},
          weekly: {},
          meta: {
            warningChannelId: null,
            moveLogChannelId: null,
            moveLogEnabled: false
          },
          exceptions: {},
          voiceData: { lastVoiceSeenAt: {}, isInVoice: {} },
          voiceMinutes: {},
        },
        null,
        2
      ),
      'utf8'
    );
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    return {
      active: data.active && typeof data.active === 'object' ? data.active : {},
      weekly: data.weekly && typeof data.weekly === 'object' ? data.weekly : {},
      meta:
        data.meta && typeof data.meta === 'object'
          ? data.meta
          : { warningChannelId: null, moveLogChannelId: null, moveLogEnabled: false },
      exceptions:
        data.exceptions && typeof data.exceptions === 'object'
          ? data.exceptions
          : {},
      voiceData:
        data.voiceData && typeof data.voiceData === 'object'
          ? data.voiceData
          : { lastVoiceSeenAt: {}, isInVoice: {} },
      voiceMinutes:
        data.voiceMinutes && typeof data.voiceMinutes === 'object'
          ? data.voiceMinutes
          : {},
    };
  } catch {
    return {
      active: {},
      weekly: {},
      meta: { warningChannelId: null, moveLogChannelId: null, moveLogEnabled: false },
      exceptions: {},
      voiceData: { lastVoiceSeenAt: {}, isInVoice: {} },
      voiceMinutes: {},
    };
  }
}

function writeStore(data) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function formatDuration(totalMinutes) {
  const minutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} دقيقة`;
  if (mins === 0) return `${hours} ساعة`;
  return `${hours} ساعة و ${mins} دقيقة`;
}

function getActive(userId) {
  const data = readStore();
  return data.active[userId] || null;
}

function getAllActive() {
  const data = readStore();
  return Object.entries(data.active).map(([userId, session]) => ({
    userId,
    loginAt: session.loginAt,
  }));
}

function login(userId) {
  const data = readStore();
  if (data.active[userId]) {
    return { ok: false, reason: 'already_logged_in', session: data.active[userId] };
  }

  const session = { loginAt: Date.now() };
  data.active[userId] = session;
  writeStore(data);
  return { ok: true, session };
}

function logout(userId) {
  return logoutInternal(userId, { countMinutes: true });
}

function logoutInternal(userId, { countMinutes = true } = {}) {
  const data = readStore();
  const session = data.active[userId];
  if (!session) {
    return { ok: false, reason: 'not_logged_in' };
  }

  const logoutAt = Date.now();
  const sessionMinutes = Math.max(
    1,
    Math.round((logoutAt - session.loginAt) / 60000)
  );

  if (countMinutes) {
    const prev = Number(data.weekly[userId]?.totalMinutes || 0);
    data.weekly[userId] = {
      totalMinutes: prev + sessionMinutes,
    };
  }

  delete data.active[userId];
  writeStore(data);

  return {
    ok: true,
    sessionMinutes,
    weeklyMinutes: Number(data.weekly[userId]?.totalMinutes || 0),
    loginAt: session.loginAt,
    logoutAt,
  };
}

function forceLogoutWithoutCounting(userId) {
  return logoutInternal(userId, { countMinutes: false });
}

function getWeeklyMinutes(userId) {
  const data = readStore();
  return Number(data.weekly[userId]?.totalMinutes || 0);
}

function getWeeklyLeaderboard() {
  const data = readStore();
  return Object.entries(data.weekly)
    .map(([userId, entry]) => ({
      userId,
      totalMinutes: Number(entry.totalMinutes) || 0,
    }))
    .filter((entry) => entry.totalMinutes > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

function resetUser(userId) {
  const data = readStore();
  delete data.weekly[userId];
  writeStore(data);
}

function resetAll() {
  const data = readStore();
  data.weekly = {};
  writeStore(data);
}

// دالة لحفظ وجلب روم اللوق
function getLogChannelId() {
  const data = readStore();
  return data.meta?.logChannelId || null;
}

function setLogChannelId(channelId) {
  const data = readStore();
  data.meta = data.meta || {};
  data.meta.logChannelId = channelId || null;
  writeStore(data);
}
function getWarningChannelId() {
  const data = readStore();
  return data.meta?.warningChannelId || null;
}

function setWarningChannelId(channelId) {
  const data = readStore();
  data.meta = data.meta || { warningChannelId: null };
  data.meta.warningChannelId = channelId || null;
  writeStore(data);
}

function isExempt(userId) {
  const data = readStore();
  return Boolean(data.exceptions?.[userId]);
}

function addExempt(userId) {
  const data = readStore();
  data.exceptions = data.exceptions || {};
  data.exceptions[userId] = true;
  writeStore(data);
}

function removeExempt(userId) {
  const data = readStore();
  if (data.exceptions && data.exceptions[userId]) {
    delete data.exceptions[userId];
  }
  writeStore(data);
}

function getExemptions() {
  const data = readStore();
  return Object.keys(data.exceptions || {});
}

// دوال لحفظ بيانات الرومات الصوتية
function getVoiceData() {
  const data = readStore();
  return {
    lastVoiceSeenAt: data.voiceData?.lastVoiceSeenAt || {},
    isInVoice: data.voiceData?.isInVoice || {},
  };
}

function setVoiceData(userId, lastSeen, inVoice) {
  const data = readStore();
  data.voiceData = data.voiceData || { lastVoiceSeenAt: {}, isInVoice: {} };
  data.voiceData.lastVoiceSeenAt[userId] = lastSeen;
  data.voiceData.isInVoice[userId] = inVoice;
  writeStore(data);
}

function clearVoiceData(userId) {
  const data = readStore();
  if (data.voiceData) {
    delete data.voiceData.lastVoiceSeenAt[userId];
    delete data.voiceData.isInVoice[userId];
    writeStore(data);
  }
}

// ─── دوال تتبع الساعات الصوتية ───────────────────────────────

function addVoiceMinutes(userId, minutes) {
  const data = readStore();
  data.voiceMinutes = data.voiceMinutes || {};
  const prev = Number(data.voiceMinutes[userId] || 0);
  data.voiceMinutes[userId] = prev + minutes;
  writeStore(data);
}

function getVoiceMinutes(userId) {
  const data = readStore();
  return Number(data.voiceMinutes?.[userId] || 0);
}

function getVoiceLeaderboard() {
  const data = readStore();
  return Object.entries(data.voiceMinutes || {})
    .map(([userId, mins]) => ({ userId, totalMinutes: Number(mins) || 0 }))
    .filter((e) => e.totalMinutes > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
  // بدون slice عشان نرجع كل الأعضاء
}

module.exports = {
  formatDuration,
  getActive,
  getAllActive,
  login,
  logout,
  forceLogoutWithoutCounting,
  getWeeklyMinutes,
  getWeeklyLeaderboard,
  resetUser,
  resetAll,
  getWarningChannelId,
  setWarningChannelId,
  getLogChannelId,
  setLogChannelId,
  isExempt,
  addExempt,
  removeExempt,
  getExemptions,
  getVoiceData,
  setVoiceData,
  clearVoiceData,
  addVoiceMinutes,
  getVoiceMinutes,
  getVoiceLeaderboard,
};
