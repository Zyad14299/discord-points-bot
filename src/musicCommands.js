const { EmbedBuilder } = require('discord.js');
const { getGuildMusic, resolveTrack } = require('./musicPlayer');

function usageEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('أوامر الموسيقى')
    .setDescription(
      [
        '`ش اسم الأغنية` — تشغيل من يوتيوب',
        '`تخطي` — تخطي الأغنية الحالية',
        '`وقف` — إيقاف ومغادرة الروم',
        '`باوس` — إيقاف مؤقت',
        '`كمل` — متابعة التشغيل',
        '`صوت 50` — تعديل الصوت من 0 إلى 100',
        '`قائمة` — عرض قائمة الانتظار',
        '`الحين` — الأغنية الحالية',
      ].join('\n')
    );
}

async function requireVoice(message) {
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    await message.reply('ادخل روم صوتي أول بعدين اكتب الأمر.');
    return null;
  }
  return voiceChannel;
}

async function handlePlay(message, query) {
  const voiceChannel = await requireVoice(message);
  if (!voiceChannel) return;

  const status = await message.reply('جاري البحث...');

  try {
    const track = await resolveTrack(query, message.author.toString());
    const music = getGuildMusic(message.guild.id);
    const result = await music.enqueue(track, voiceChannel, message.channel);

    if (result.queued) {
      await status.edit(
        `➕ تمت الإضافة للقائمة: **${track.title}** (رقم ${result.position})`
      );
    } else {
      await status.edit(`▶️ يتم التشغيل: **${track.title}**`);
    }
  } catch (error) {
    console.error('خطأ تشغيل الموسيقى:', error);
    await status.edit(`ما قدرت أشغّل الأغنية: ${error.message || 'خطأ غير معروف'}`);
  }
}

async function handleSkip(message) {
  const music = getGuildMusic(message.guild.id);
  if (!music.current && music.queue.length === 0) {
    await message.reply('ما في شي يشتغل الحين.');
    return;
  }

  const skipped = music.skip();
  await message.reply(
    skipped ? `⏭️ تم تخطي: **${skipped.title}**` : 'تم التخطي.'
  );
}

async function handleStop(message) {
  const music = getGuildMusic(message.guild.id);
  music.stop();
  await message.reply('⏹️ تم الإيقاف ومغادرة الروم.');
}

async function handlePause(message) {
  const music = getGuildMusic(message.guild.id);
  if (!music.current) {
    await message.reply('ما في شي يشتغل الحين.');
    return;
  }
  music.pause();
  await message.reply('⏸️ تم الإيقاف المؤقت.');
}

async function handleResume(message) {
  const music = getGuildMusic(message.guild.id);
  if (!music.current) {
    await message.reply('ما في شي يشتغل الحين.');
    return;
  }
  music.resume();
  await message.reply('▶️ تم الاستمرار.');
}

async function handleVolume(message, raw) {
  const value = Number(raw);
  if (Number.isNaN(value)) {
    await message.reply('اكتب رقم من 0 إلى 100، مثال: `صوت 40`');
    return;
  }

  const music = getGuildMusic(message.guild.id);
  const set = music.setVolume(value);
  await message.reply(`🔊 الصوت الآن: **${set}%**`);
}

async function handleQueue(message) {
  const music = getGuildMusic(message.guild.id);
  if (!music.current && music.queue.length === 0) {
    await message.reply('القائمة فاضية.');
    return;
  }

  const lines = [];
  if (music.current) {
    lines.push(`▶️ الحين: **${music.current.title}** — ${music.current.requestedBy}`);
  }

  music.queue.forEach((track, index) => {
    lines.push(`**${index + 1}.** ${track.title} — ${track.requestedBy}`);
  });

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('قائمة التشغيل')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `الصوت: ${Math.round(music.volume * 100)}%` });

  await message.reply({ embeds: [embed] });
}

async function handleNow(message) {
  const music = getGuildMusic(message.guild.id);
  if (!music.current) {
    await message.reply('ما في أغنية تشتغل الحين.');
    return;
  }

  await message.reply(
    `▶️ الحين: **${music.current.title}**\nطلبها: ${music.current.requestedBy}\nالصوت: **${Math.round(music.volume * 100)}%**`
  );
}

async function handleMusicMessage(message) {
  if (message.author.bot || !message.guild) return false;

  const content = message.content.trim();
  if (!content) return false;

  const playMatch = content.match(/^(?:ش|شغل)\s+(.+)$/i);
  if (playMatch) {
    await handlePlay(message, playMatch[1]);
    return true;
  }

  const lower = content.toLowerCase();

  if (['موسيقى', 'اوامر الموسيقى', 'أوامر الموسيقى', 'help music'].includes(lower)) {
    await message.reply({ embeds: [usageEmbed()] });
    return true;
  }

  if (['تخطي', 'سكب', 'skip', 'س'].includes(lower)) {
    await handleSkip(message);
    return true;
  }

  if (['وقف', 'ايقاف', 'إيقاف', 'stop'].includes(lower)) {
    await handleStop(message);
    return true;
  }

  if (['باوس', 'مؤقت', 'pause'].includes(lower)) {
    await handlePause(message);
    return true;
  }

  if (['كمل', 'استمر', 'resume'].includes(lower)) {
    await handleResume(message);
    return true;
  }

  if (['قائمة', 'queue'].includes(lower)) {
    await handleQueue(message);
    return true;
  }

  if (['الحين', 'الان', 'الآن', 'np'].includes(lower)) {
    await handleNow(message);
    return true;
  }

  const volumeMatch = content.match(/^(?:صوت|volume)\s+(\d{1,3})$/i);
  if (volumeMatch) {
    await handleVolume(message, volumeMatch[1]);
    return true;
  }

  return false;
}

module.exports = {
  handleMusicMessage,
};
