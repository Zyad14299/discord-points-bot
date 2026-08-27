/**
 * voiceSystems.js
 * ثلاثة أنظمة:
 * 1. AFK تلقائي — ينقل المدفون أكثر من X دقيقة لروم AFK
 * 2. لوحة الساعات الصوتية — Top 5 تتحدث كل 30 ثانية في قناة التفاعل
 * 3. لوقات المودريشن — يسجل كل deafen / mute / ban / timeout / move
 */

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const config = require('./config');
const attendanceStore = require('./attendanceStore');

// ─── مساعد: جيب قناة باسمها ──────────────────────────────────
function findChannelByName(guild, name) {
  return guild.channels.cache.find(
    (c) => c.name === name && c.isTextBased && c.isTextBased()
  ) || null;
}

function findVoiceChannelByName(guild, name) {
  const { ChannelType } = require('discord.js');
  return guild.channels.cache.find(
    (c) => c.name === name && c.type === ChannelType.GuildVoice
  ) || null;
}

// ─── ١. نظام AFK ─────────────────────────────────────────────

// Map: userId -> { joinedAt, channelId, deafenedAt?, userId, live? }
const voiceSessions = new Map();

/**
 * يُستدعى عند كل VoiceStateUpdate
 */
function handleVoiceStateForSystems(oldState, newState, client) {
  const userId = newState?.member?.id || oldState?.member?.id;
  if (!userId) return;

  const member = newState?.member || oldState?.member;
  if (!member || member.user?.bot) return;

  const oldChannel = oldState?.channelId;
  const newChannel = newState?.channelId;
  const now = Date.now();

  // ─── تتبع الوقت الصوتي ───
  if (!oldChannel && newChannel) {
    // دخل روم جديد
    voiceSessions.set(userId, {
      userId,
      joinedAt: now,
      channelId: newChannel,
      deafenedAt: (newState?.selfDeaf || newState?.serverDeaf) ? now : undefined,
    });
  } else if (oldChannel && !newChannel) {
    // طلع من الروم
    const session = voiceSessions.get(userId);
    if (session) {
      const minutes = Math.floor((now - session.joinedAt) / 60000);
      if (minutes > 0) attendanceStore.addVoiceMinutes(userId, minutes);
      voiceSessions.delete(userId);
    }
  } else if (oldChannel && newChannel && oldChannel !== newChannel) {
    // انتقل لروم ثاني
    const session = voiceSessions.get(userId);
    if (session) {
      const minutes = Math.floor((now - session.joinedAt) / 60000);
      if (minutes > 0) attendanceStore.addVoiceMinutes(userId, minutes);
    }
    voiceSessions.set(userId, {
      userId,
      joinedAt: now,
      channelId: newChannel,
      deafenedAt: (newState?.selfDeaf || newState?.serverDeaf) ? now : undefined,
    });
  } else if (oldChannel && newChannel && oldChannel === newChannel) {
    // نفس الروم — تغيير حالة (mute/deaf)
    const session = voiceSessions.get(userId);
    if (!session) return;

    const wasDeafened = oldState?.selfDeaf || oldState?.serverDeaf;
    const isDeafened = newState?.selfDeaf || newState?.serverDeaf;

    if (!wasDeafened && isDeafened) {
      session.deafenedAt = now;
    } else if (wasDeafened && !isDeafened) {
      delete session.deafenedAt;
    }
  }
}

/**
 * تشغيل فحص AFK كل دقيقة
 * لو شخص مدفون أكثر من config.afkDeafenMinutes → ينقل لـ AFK
 */
function startAfkChecker(client) {
  setInterval(async () => {
    const now = Date.now();
    const limitMs = 30 * 1000; // 30 ثانية

    for (const guild of client.guilds.cache.values()) {
      const afkChannel = findVoiceChannelByName(guild, config.afkChannelName);
      if (!afkChannel) continue;

      // نفحص كل شخص في أي روم صوتي مباشرة
      for (const [, voiceState] of guild.voiceStates.cache) {
        if (!voiceState.channelId) continue;
        if (voiceState.member?.user?.bot) continue;
        if (voiceState.channelId === afkChannel.id) continue;

        const userId = voiceState.id;
        const isDeaf = voiceState.selfDeaf || voiceState.serverDeaf;

        if (!isDeaf) {
          // مو مدفون — نمسح وقت الدفن لو كان موجود
          const session = voiceSessions.get(userId);
          if (session) delete session.deafenedAt;
          continue;
        }

        // مدفون — نسجل وقت البدء لو ما سجلنا
        const session = voiceSessions.get(userId);
        if (!session) continue;

        if (!session.deafenedAt) {
          session.deafenedAt = now;
          continue;
        }

        // نشوف قديش صار مدفون
        if (now - session.deafenedAt < limitMs) continue;

        // ننقله لـ AFK
        try {
          const member = voiceState.member || await guild.members.fetch(userId).catch(() => null);
          if (!member) continue;

          await member.voice.setChannel(afkChannel, 'Deafened for 30+ seconds');
          console.log(`[AFK] نقل ${userId} لروم AFK`);

          const minutes = Math.floor((now - session.joinedAt) / 60000);
          if (minutes > 0) attendanceStore.addVoiceMinutes(userId, minutes);

          session.joinedAt = now;
          session.channelId = afkChannel.id;
          session.deafenedAt = now; // نجدد عشان ما ينقل مرة ثانية فور
        } catch (e) {
          console.error(`[AFK] فشل نقل ${userId}:`, e.message);
        }
      }
    }
  }, 10 * 1000);
}

// ─── ٢. لوحة الساعات الصوتية ─────────────────────────────────

// ID الرسالة المنشورة للوحة (نحفظها عشان نعدلها)
let leaderboardMessageId = null;
let leaderboardChannelId = null;

function buildProgressBar(minutes, maxMinutes) {
  const total = 10;
  const filled = maxMinutes > 0 ? Math.round((minutes / maxMinutes) * total) : 0;
  const empty = total - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

async function buildVoiceLeaderboardEmbed(client, guild) {
  const now = Date.now();

  // نجيب الساعات المحفوظة
  const savedData = attendanceStore.getVoiceLeaderboard();
  const minutesMap = new Map();
  for (const entry of savedData) {
    minutesMap.set(entry.userId, { totalMinutes: entry.totalMinutes, live: false });
  }

  // نضيف الوقت الحي لكل شخص في روم الحين
  for (const [userId, session] of voiceSessions) {
    const liveMinutes = Math.floor((now - session.joinedAt) / 60000);
    if (liveMinutes <= 0) continue;
    const existing = minutesMap.get(userId);
    if (existing) {
      existing.totalMinutes += liveMinutes;
      existing.live = true;
    } else {
      minutesMap.set(userId, { totalMinutes: liveMinutes, live: true });
    }
  }

  // نرتب ونأخذ Top 5
  const top = [...minutesMap.entries()]
    .map(([userId, data]) => ({ userId, ...data }))
    .filter(e => e.totalMinutes > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 5);

  const maxMinutes = top.length > 0 ? top[0].totalMinutes : 1;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🏆  Voice Hours Leaderboard')
    .setDescription('> The most active members in voice channels this session')
    .setTimestamp();

  if (top.length === 0) {
    embed
      .addFields({ name: '\u200b', value: '```\n  No hours recorded yet\n  Join any voice channel to start\n```' })
      .setFooter({ text: '🔄 Updates every 30 seconds' });
    return embed;
  }

  const RANK_EMOJIS = ['👑', '🥈', '🥉', '4️⃣', '5️⃣'];

  for (let i = 0; i < top.length; i++) {
    const entry = top[i];
    const hours = Math.floor(entry.totalMinutes / 60);
    const mins = entry.totalMinutes % 60;
    const timeStr = hours > 0
      ? `${hours}h ${mins > 0 ? mins + 'm' : ''}`
      : `${mins}m`;

    const bar = buildProgressBar(entry.totalMinutes, maxMinutes);
    const liveTag = entry.live ? '  🔴 **LIVE**' : '';

    embed.addFields({
      name: `${RANK_EMOJIS[i]}  Rank #${i + 1}${liveTag}`,
      value: `<@${entry.userId}>\n\`${bar}\`  ⏱️ **${timeStr}**`,
      inline: false,
    });
  }

  embed
    .addFields({ name: '\u200b', value: '🔴 = In voice now' })
    .setFooter({ text: '🔄 Updates every 30 seconds' });

  return embed;
}

async function updateVoiceLeaderboard(client) {
  for (const guild of client.guilds.cache.values()) {
    const channel = findChannelByName(guild, config.voiceLeaderboardChannelName);
    if (!channel) continue;

    const embed = await buildVoiceLeaderboardEmbed(client, guild);

    // لو عندنا رسالة سابقة نعدلها
    if (leaderboardMessageId && leaderboardChannelId === channel.id) {
      try {
        const msg = await channel.messages.fetch(leaderboardMessageId);
        await msg.edit({ embeds: [embed] });
        continue;
      } catch {
        // الرسالة اتحذفت، ننشر جديدة
        leaderboardMessageId = null;
      }
    }

    // ننشر رسالة جديدة
    try {
      const msg = await channel.send({ embeds: [embed] });
      leaderboardMessageId = msg.id;
      leaderboardChannelId = channel.id;
    } catch (e) {
      console.error('[Leaderboard] فشل النشر:', e.message);
    }
  }
}

function startVoiceLeaderboard(client) {
  // ننشر مرة وحدة فقط عند البدء
  setTimeout(() => updateVoiceLeaderboard(client), 5000);
}

// ─── ٣. لوقات المودريشن ──────────────────────────────────────

async function getModLogChannel(guild) {
  return findChannelByName(guild, config.modLogChannelName);
}

async function sendModLog(guild, embed) {
  const channel = await getModLogChannel(guild);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => {});
}

/**
 * يُستدعى عند GuildAuditLogEntryCreate
 * يراقب: BAN / UNBAN / TIMEOUT / MEMBER_UPDATE (mute/deafen) / MEMBER_DISCONNECT / MEMBER_MOVE
 */
async function handleAuditLog(entry, guild) {
  const { action, executor, target, changes, reason, extra } = entry;

  // تجاهل أفعال البوت نفسه
  if (executor?.bot) return;

  let embed = null;

  // ─── BAN ───
  if (action === AuditLogEvent.MemberBanAdd) {
    embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🔨 باند')
      .addFields(
        { name: '👤 المفعول به', value: `<@${target.id}> (${target.tag || target.id})`, inline: true },
        { name: '🛡️ الفاعل', value: `<@${executor.id}> (${executor.tag || executor.id})`, inline: true },
        { name: '📋 السبب', value: reason || 'بدون سبب', inline: false }
      )
      .setTimestamp();
  }

  // ─── UNBAN ───
  else if (action === AuditLogEvent.MemberBanRemove) {
    embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ رفع باند')
      .addFields(
        { name: '👤 المفعول به', value: `<@${target.id}> (${target.tag || target.id})`, inline: true },
        { name: '🛡️ الفاعل', value: `<@${executor.id}> (${executor.tag || executor.id})`, inline: true },
        { name: '📋 السبب', value: reason || 'بدون سبب', inline: false }
      )
      .setTimestamp();
  }

  // ─── TIMEOUT ───
  else if (action === AuditLogEvent.MemberUpdate) {
    if (!changes || changes.length === 0) return;

    for (const change of changes) {
      // Timeout
      if (change.key === 'communication_disabled_until') {
        const wasTimedOut = change.old != null;
        const isTimedOut = change.new != null;

        if (!wasTimedOut && isTimedOut) {
          // تايم اوت جديد
          const until = new Date(change.new);
          const unixTs = Math.floor(until.getTime() / 1000);
          embed = new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle('⏱️ تايم اوت')
            .addFields(
              { name: '👤 المفعول به', value: `<@${target.id}>`, inline: true },
              { name: '🛡️ الفاعل', value: `<@${executor.id}>`, inline: true },
              { name: '⏰ ينتهي', value: `<t:${unixTs}:R>`, inline: false },
              { name: '📋 السبب', value: reason || 'بدون سبب', inline: false }
            )
            .setTimestamp();
          await sendModLog(guild, embed);
          return;
        } else if (wasTimedOut && !isTimedOut) {
          // رفع تايم اوت
          embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('✅ رفع تايم اوت')
            .addFields(
              { name: '👤 المفعول به', value: `<@${target.id}>`, inline: true },
              { name: '🛡️ الفاعل', value: `<@${executor.id}>`, inline: true }
            )
            .setTimestamp();
          await sendModLog(guild, embed);
          return;
        }
      }

      // Server Mute
      if (change.key === 'mute') {
        const isMuted = change.new === true;
        embed = new EmbedBuilder()
          .setColor(isMuted ? 0xff9800 : 0x57f287)
          .setTitle(isMuted ? '🔇 ميوت' : '🔊 رفع ميوت')
          .addFields(
            { name: '👤 المفعول به', value: `<@${target.id}>`, inline: true },
            { name: '🛡️ الفاعل', value: `<@${executor.id}>`, inline: true },
            { name: '📋 السبب', value: reason || 'بدون سبب', inline: false }
          )
          .setTimestamp();
        await sendModLog(guild, embed);
        return;
      }

      // Server Deafen (دفن)
      if (change.key === 'deaf') {
        const isDeafened = change.new === true;
        embed = new EmbedBuilder()
          .setColor(isDeafened ? 0x9b59b6 : 0x57f287)
          .setTitle(isDeafened ? '🔕 دفن' : '🔔 رفع دفن')
          .addFields(
            { name: '👤 المفعول به', value: `<@${target.id}>`, inline: true },
            { name: '🛡️ الفاعل', value: `<@${executor.id}>`, inline: true },
            { name: '📋 السبب', value: reason || 'بدون سبب', inline: false }
          )
          .setTimestamp();
        await sendModLog(guild, embed);
        return;
      }
    }
    return; // ما في تغيير يهمنا
  }

  // ─── KICK ───
  else if (action === AuditLogEvent.MemberKick) {
    embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('👟 كيك')
      .addFields(
        { name: '👤 المفعول به', value: `<@${target.id}> (${target.tag || target.id})`, inline: true },
        { name: '🛡️ الفاعل', value: `<@${executor.id}> (${executor.tag || executor.id})`, inline: true },
        { name: '📋 السبب', value: reason || 'بدون سبب', inline: false }
      )
      .setTimestamp();
  }

  // ─── MEMBER MOVE (نقل من روم لروم) ───
  else if (action === AuditLogEvent.MemberMove) {
    const count = extra?.count || 1;
    embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🚀 نقل من روم لروم')
      .addFields(
        { name: '🛡️ الفاعل', value: `<@${executor.id}>`, inline: true },
        { name: '📍 الروم الجديد', value: extra?.channel ? `<#${extra.channel.id}>` : 'غير معروف', inline: true },
        { name: '👥 عدد المنقولين', value: String(count), inline: true }
      )
      .setTimestamp();
  }

  // ─── MEMBER DISCONNECT (طرد من الروم الصوتي) ───
  else if (action === AuditLogEvent.MemberDisconnect) {
    const count = extra?.count || 1;
    embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle('📵 طرد من الروم الصوتي')
      .addFields(
        { name: '🛡️ الفاعل', value: `<@${executor.id}>`, inline: true },
        { name: '👥 عدد المطرودين', value: String(count), inline: true }
      )
      .setTimestamp();
  }

  if (embed) {
    await sendModLog(guild, embed);
  }
}

/**
 * يُستدعى عند ClientReady لتسجيل من هو في الرومات الحين
 */
function initVoiceSessions(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    for (const [, voiceState] of guild.voiceStates.cache) {
      if (!voiceState.channelId) continue;
      if (voiceState.member?.user?.bot) continue;
      const userId = voiceState.id;
      const isDeaf = voiceState.selfDeaf || voiceState.serverDeaf;
      voiceSessions.set(userId, {
        userId,
        joinedAt: now,
        channelId: voiceState.channelId,
        // لو مدفون من الأول نبدأ العداد من الحين
        deafenedAt: isDeaf ? now : undefined,
      });
      console.log(`[Init] ${userId} — deaf: ${isDeaf} — channel: ${voiceState.channelId}`);
    }
  }
  console.log(`[VoiceSessions] تم تسجيل ${voiceSessions.size} شخص في الرومات عند البدء`);
}

module.exports = {
  handleVoiceStateForSystems,
  initVoiceSessions,
  startAfkChecker,
  startVoiceLeaderboard,
  handleAuditLog,
};