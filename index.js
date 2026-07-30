require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} = require('discord.js');
const config = require('./src/config');
const { handleInteraction } = require('./src/interactions');
const { handleMusicMessage } = require('./src/musicCommands');
const attendanceStore = require('./src/attendanceStore');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// نحتفظ بآخر وقت تم فيه رصد العضو داخل روم صوتي،
// عشان نقدر نقول هل هو "غير موجود بالرومات" لمدة 2 ساعة.
const lastVoiceSeenAt = new Map(); // userId -> timestamp ms
const isInVoice = new Map(); // userId -> boolean

client.once(Events.ClientReady, (readyClient) => {
  console.log(`البوت شغال باسم: ${readyClient.user.tag}`);
  console.log('نظام تسجيل الحضور + الموسيقى جاهز.');

  // نمسح كل الرومات الصوتية الحالية عند البدء عشان نعرف مين موجود
  try {
    for (const guild of readyClient.guilds.cache.values()) {
      for (const [memberId, voiceState] of guild.voiceStates.cache) {
        if (voiceState.channelId) {
          isInVoice.set(memberId, true);
          lastVoiceSeenAt.set(memberId, Date.now());
        }
      }
    }
    console.log(`تم رصد ${isInVoice.size} عضو في الرومات الصوتية عند البدء.`);
  } catch (e) {
    console.error('خطأ في رصد الرومات عند البدء:', e);
  }

  const absentMs = config.absentHours * 60 * 60 * 1000;
  const intervalMs = config.absentCheckIntervalMinutes * 60 * 1000;

  console.log(
    `مراقبة الغياب التلقائية مفعلة: ${
      config.absentHours
    } ساعة (فحص كل ${config.absentCheckIntervalMinutes} دقيقة).`
  );

  setInterval(async () => {
    if (absentMs <= 0) return;

    const warningChannelId = attendanceStore.getWarningChannelId();
    if (!warningChannelId) return;

    const activeSessions = attendanceStore.getAllActive();
    if (activeSessions.length === 0) return;

    let warningChannel = client.channels.cache.get(warningChannelId);
    if (!warningChannel) {
      warningChannel = await client.channels
        .fetch(warningChannelId)
        .catch(() => null);
    }

    if (!warningChannel || typeof warningChannel.send !== 'function') return;

    const now = Date.now();

    for (const session of activeSessions) {
      const userId = session.userId;

      if (attendanceStore.isExempt(userId)) continue;

      // لو هو داخل روم صوتي حالياً، ما نشيل.
      if (isInVoice.get(userId)) continue;

      // إذا ما عندنا سجل صوت سابق، نعتبره غايب من وقت تسجيل الدخول.
      const refAt = lastVoiceSeenAt.get(userId) || session.loginAt;
      const absentFor = now - refAt;

      if (absentFor < absentMs) continue;

      const result = attendanceStore.forceLogoutWithoutCounting(userId);
      if (!result.ok) continue;

      // حساب مدة الغياب بالساعات والدقائق
      const absentMinutes = Math.floor(absentFor / 60000);
      const absentHoursDisplay = Math.floor(absentMinutes / 60);
      const absentMinsDisplay = absentMinutes % 60;
      const absentStr = absentMinsDisplay > 0
        ? `${absentHoursDisplay} ساعة و ${absentMinsDisplay} دقيقة`
        : `${absentHoursDisplay} ساعة`;

      // تحذير في روم اللوحة.
      await warningChannel
        .send({
          content: [
            `⚠️ **تحذير تلقائي** | <@${userId}>`,
            ``,
            `تم تسجيل خروجك تلقائياً لأنك كنت مسجل دخول في نظام الحضور لكن **غير موجود في أي روم صوتي** لمدة **${absentStr}**.`,
            ``,
            `> 📌 **السبب:** الغياب عن الرومات الصوتية لمدة تتجاوز ${config.absentHours} ساعة`,
            `> ❌ **النتيجة:** تم حذف ساعات هذه الجلسة وتسجيل الخروج`,
            ``,
            `إذا كنت موجوداً وهذا خطأ، تواصل مع الأدمن.`,
          ].join('\n'),
        })
        .catch(() => {});
    }
  }, intervalMs);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error('خطأ في التفاعل:', error);
    const payload = {
      content: 'صار خطأ أثناء تنفيذ الأمر.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleMusicMessage(message);
  } catch (error) {
    console.error('خطأ في أمر الموسيقى:', error);
    await message.reply('صار خطأ أثناء تنفيذ أمر الموسيقى.').catch(() => {});
  }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  try {
    const memberId = (newState && newState.id) || (oldState && oldState.id);
    if (!memberId) return;

    const channelId = newState?.channelId || null;

    if (channelId) {
      isInVoice.set(memberId, true);
      lastVoiceSeenAt.set(memberId, Date.now());
    } else {
      isInVoice.set(memberId, false);
      lastVoiceSeenAt.set(memberId, Date.now());
    }
  } catch {
    // ignore
  }
});

client.login(config.token);
