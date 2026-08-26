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

// Map: userId -> { joinedAt, isDeafened, deafenedAt }
const voiceSessions = new Map();

/**
 * يُستدعى عند كل VoiceStateUpdate
 * يتتبع:
 *  - وقت الدخول/الخروج لحساب الساعات
 *  - وقت بداية الصم للـ AFK
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
    // دخل روم
    voiceSessions.set(userId, { joinedAt: now, channelId: newChannel });
  } else if (oldChannel && !newChannel) {
    // طلع من الروم
    const session = voiceSessions.get(userId);
    if (session) {
      const minutes = Math.floor((now - session.joinedAt) / 60000);
      if (minutes > 0) attendanceStore.addVoiceMinutes(userId, minutes);
      voiceSessions.delete(userId);
    }
  } else if (oldChannel && newChannel && oldChannel !== newChannel) {
    // انتقل لروم ثاني — نحسب وقت الروم السابق ونبدأ جديد
    const session = voiceSessions.get(userId);
    if (session) {
      const minutes = Math.floor((now - session.joinedAt) / 60000);
      if (minutes > 0) attendanceStore.addVoiceMinutes(userId, minutes);
    }
    voiceSessions.set(userId, { joinedAt: now, channelId: newChannel });
  }

  // ─── تتبع الصم للـ AFK ───
  const session = voiceSessions.get(userId);
  if (!session) return;

  const wasDeafened = oldState?.selfDeaf || oldState?.serverDeaf;
  const isDeafened = newState?.selfDeaf || newState?.serverDeaf;

  if (!wasDeafened && isDeafened) {
    // بدأ يكون مدفون
    session.deafenedAt = now;
  } else if (wasDeafened && !isDeafened) {
    // رفع الصم
    delete session.deafenedAt;
  }
}

/**
 * تشغيل فحص AFK كل دقيقة
 * لو شخص مدفون أكثر من config.afkDeafenMinutes → ينقل لـ AFK
 */
function startAfkChecker(client) {
  setInterval(async () => {
    const now = Date.now();
    const limitMs = config.afkDeafenMinutes * 60 * 1000;

    for (const guild of client.guilds.cache.values()) {
      const afkChannel = findVoiceChannelByName(guild, config.afkChannelName);
      if (!afkChannel) continue;

      for (const [userId, session] of voiceSessions) {
        if (!session.deafenedAt) continue;
        if (now - session.deafenedAt < limitMs) continue;

        // تأكد إنه لا يزال في السيرفر وليس في روم AFK أصلاً
        let member;
        try {
          member = await guild.members.fetch(userId);
        } catch {
          continue;
        }

        if (!member.voice?.channelId) continue;
        if (member.voice.channelId === afkChannel.id) continue;

        // انقله
        try {
          await member.voice.setChannel(afkChannel, 'مدفون أكثر من ' + config.afkDeafenMinutes + ' دقيقة');
          // نحسب وقته في الروم السابق
          const minutes = Math.floor((now - session.joinedAt) / 60000);
          if (minutes > 0) attendanceStore.addVoiceMinutes(userId, minutes);
          // نبدأ جلسة جديدة من روم AFK
          session.joinedAt = now;
          session.channelId = afkChannel.id;
          // نحافظ على deafenedAt عشان ما نرجع ننقله مرة ثانية
          // لو ظل مدفون في AFK ما في مشكلة لأنه أصلاً في AFK
          session.deafenedAt = now; // نجدد الوقت عشان ما ينقل مرة ثانية فور دخوله
        } catch (e) {
          console.error(`[AFK] فشل نقل ${userId}:`, e.message);
        }
      }
    }
  }, 60 * 1000); // فحص كل دقيقة
}

// ─── ٢. لوحة الساعات الصوتية ─────────────────────────────────

// ID الرسالة المنشورة للوحة (نحفظها عشان نعدلها)
let leaderboardMessageId = null;
let leaderboardChannelId = null;

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

async function buildVoiceLeaderboardEmbed(client, guild) {
  const top = attendanceStore.getVoiceLeaderboard();

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎙️ لوحة الساعات الصوتية')
    .setTimestamp();

  if (top.length === 0) {
    embed.setDescription('> ما في ساعات مسجلة بعد.');
    return embed;
  }

  const lines = await Promise.all(
    top.map(async (entry, i) => {
      const medal = MEDALS[i] || `**${i + 1}.**`;
      let display = `<@${entry.userId}>`;
      try {
        const member = await guild.members.fetch(entry.userId);
        display = `<@${entry.userId}>`;
      } catch {
        // نبقى بالمنشن
      }
      const hours = Math.floor(entry.totalMinutes / 60);
      const mins = entry.totalMinutes % 60;
      const timeStr = mins > 0
        ? `**${hours}س ${mins}د**`
        : `**${hours} ساعة**`;
      return `${medal} ${display} — ${timeStr}`;
    })
  );

  embed
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: '🔄 تتحدث كل 30 ثانية' });

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
  // أول تحديث بعد 5 ثواني من البدء
  setTimeout(() => updateVoiceLeaderboard(client), 5000);
  // ثم كل 30 ثانية
  setInterval(() => updateVoiceLeaderboard(client), 30 * 1000);
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

module.exports = {
  handleVoiceStateForSystems,
  startAfkChecker,
  startVoiceLeaderboard,
  handleAuditLog,
};
