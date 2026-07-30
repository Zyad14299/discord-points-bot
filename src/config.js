require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || value.includes('your_')) {
    throw new Error(`حط قيمة صحيحة لـ ${name} في ملف .env`);
  }
  return value;
}

const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: required('GUILD_ID'),
  absentHours: Math.max(0, Number(process.env.ABSENT_HOURS || 2)) || 2,
  absentCheckIntervalMinutes:
    Math.max(1, Number(process.env.ABSENT_CHECK_INTERVAL_MINUTES || 5)) || 5,
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
};

module.exports = config;
