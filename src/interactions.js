const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const store = require('./attendanceStore');
const config = require('./config');
const { ticketPanelEmbed, ticketPanelButtons, handleTicketInteraction, setConfig } = require('./ticketSystem');

// ─── أمر voice ────────────────────────────────────────────────

async function handleVoiceCommand(interaction) {
  if (!isAdmin(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: 'هذا الأمر للأدمن فقط.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ flags: 64 });
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser('عضو', sub !== 'reset-all');

  if (sub === 'add') {
    const mins = interaction.options.getInteger('دقائق', true);
    store.addVoiceMinutes(user.id, mins);
    const total = store.getVoiceMinutes(user.id);
    const h = Math.floor(total / 60), m = total % 60;
    await interaction.editReply({
      content: `✅ تمت إضافة **${mins} دقيقة** لـ ${user}\nالإجمالي الآن: **${h}س ${m}د**`,
    });
    return;
  }

  if (sub === 'remove') {
    const mins = interaction.options.getInteger('دقائق', true);
    store.removeVoiceMinutes(user.id, mins);
    const total = store.getVoiceMinutes(user.id);
    const h = Math.floor(total / 60), m = total % 60;
    await interaction.editReply({
      content: `✅ تم سحب **${mins} دقيقة** من ${user}\nالإجمالي الآن: **${h}س ${m}د**`,
    });
    return;
  }

  if (sub === 'reset') {
    store.resetVoiceMinutes(user.id);
    await interaction.editReply({ content: `✅ تم تصفير ساعات ${user} في اللوحة الصوتية.` });
    return;
  }

  if (sub === 'reset-all') {
    store.resetAllVoiceMinutes();
    await interaction.editReply({ content: '✅ تم تصفير ساعات الجميع في اللوحة الصوتية.' });
  }
}

// ─── أمر winners ──────────────────────────────────────────────

async function handleWinnersCommand(interaction) {
  if (!isAdmin(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: 'هذا الأمر للأدمن فقط.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const leaderboard = store.getVoiceLeaderboard();
  const top7 = leaderboard.slice(0, 7);

  if (top7.length === 0) {
    await interaction.editReply({ content: 'ما في ساعات مسجلة بعد.' });
    return;
  }

  const RANKS = [
    { emoji: '👑', label: '1st Place', win: true },
    { emoji: '🥈', label: '2nd Place', win: true },
    { emoji: '🥉', label: '3rd Place', win: true },
    { emoji: '4️⃣', label: '4th Place', win: false },
    { emoji: '5️⃣', label: '5th Place', win: false },
    { emoji: '6️⃣', label: '6th Place', win: false },
    { emoji: '7️⃣', label: '7th Place', win: false },
  ];

  const lines = top7.map((entry, i) => {
    const rank = RANKS[i];
    const h = Math.floor(entry.totalMinutes / 60);
    const m = entry.totalMinutes % 60;
    const timeStr = h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}` : `${m}m`;
    const tag = rank.win
      ? `🎉 **Congratulations!**`
      : `💪 **Hard Luck!**`;
    return `${rank.emoji} ${tag}\n┗ <@${entry.userId}> — ⏱️ **${timeStr}**`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🏆  Weekly Voice Leaderboard')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `Top ${top7.length} members this week` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
function isAdmin(userId, member) {
  if (config.adminIds.includes(userId)) return true;
  if (member?.permissions?.has?.('Administrator')) return true;
  return false;
}

function discordTimestamp(ms, style = 'f') {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function attendancePanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🚨 مرحباً بك في نظام تسجيل الحضور لأعضاء العصابة! 🔫')
    .setDescription(
      [
        '**تسجيل الدخول:**',
        'اضغط على زر «تسجيل دخول» عند بدء دوامك. سيتم تسجيل وقت الدخول تلقائيًا.',
        '',
        '**تسجيل الخروج:**',
        'اضغط على زر «تسجيل خروج» عند انتهاء دوامك. سيتم تسجيل وقت الخروج وحساب الساعات.',
        '',
        '**عرض الحضور:**',
        'اضغط على الزر لعرض قائمة أعضاء العصابة المسجلين دخول حاليًا وأوقات دخولهم.',
        '',
        '**ملاحظات:**',
        'يرجى تسجيل الدخول والخروج في الوقت المناسب للحفاظ على سجلاتك. النظام إلزامي لجميع أعضاء العصابة.',
      ].join('\n')
    )
    .setFooter({ text: 'نظام تسجيل الحضور' })
    .setTimestamp();
}

function attendanceButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('att_login')
        .setLabel('تسجيل دخول 🔫')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('att_logout')
        .setLabel('تسجيل خروج 🛑')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('att_view')
        .setLabel('عرض الحضور 📋')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function adminPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('لوحة تحكم الحضور')
    .setDescription(
      [
        'من هنا تقدر تتابع ساعات أعضاء العصابة وتصفرها.',
        '',
        '**الأوامر:**',
        '`/لوحة الاسبوع` — ساعات الجميع هذا الأسبوع',
        '`/لوحة عضو` — ساعات عضو محدد',
        '`/لوحة اخراج-عضو` — إزالة عضو من المسجلين دخول',
        '`/لوحة استثناء-عضو` — استثناء عضو من الإزالة التلقائية',
        '`/لوحة الغاء-استثناء-عضو` — إلغاء استثناء',
        '`/لوحة استثناء-قائمة` — عرض المستثنين',
        '`/لوحة تصفير-عضو` — تصفير عضو',
        '`/لوحة تصفير-الكل` — تصفير الجميع',
      ].join('\n')
    )
    .setTimestamp();
}

function adminPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_week')
      .setLabel('ساعات الأسبوع')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_reset_all')
      .setLabel('تصفير الجميع')
      .setStyle(ButtonStyle.Danger)
  );
}

async function buildWeeklyEmbed(client, title = 'ساعات الحضور هذا الأسبوع') {
  const leaderboard = store.getWeeklyLeaderboard();
  if (leaderboard.length === 0) {
    return new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(title)
      .setDescription('ما في ساعات مسجلة هذا الأسبوع.')
      .setTimestamp();
  }

  const lines = await Promise.all(
    leaderboard.map(async (entry, index) => {
      let name = `<@${entry.userId}>`;
      try {
        const user = await client.users.fetch(entry.userId);
        name = user.tag;
      } catch {
        // يبقى المنشن لو فشل الجلب
      }
      return `**${index + 1}.** ${name} — **${store.formatDuration(entry.totalMinutes)}**`;
    })
  );

  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `الإجمالي: ${leaderboard.length} عضو` })
    .setTimestamp();
}

// ─── دوال اللوق ───────────────────────────────────────────────

async function sendLoginLog(client, userId, loginAt) {
  const logChannelId = config.logChannelId;
  if (!logChannelId) return;

  let channel = client.channels.cache.get(logChannelId);
  if (!channel) channel = await client.channels.fetch(logChannelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setDescription(
      [
        `📥 **تسجيل دخول**`,
        `👤 <@${userId}>`,
        `🕐 <t:${Math.floor(loginAt / 1000)}:T> — <t:${Math.floor(loginAt / 1000)}:D>`,
      ].join('\n')
    );

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function sendLogoutLog(client, userId, logoutAt, sessionMinutes) {
  const logChannelId = config.logChannelId;
  if (!logChannelId) return;

  let channel = client.channels.cache.get(logChannelId);
  if (!channel) channel = await client.channels.fetch(logChannelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setDescription(
      [
        `📤 **تسجيل خروج**`,
        `👤 <@${userId}>`,
        `🕐 <t:${Math.floor(logoutAt / 1000)}:T> — <t:${Math.floor(logoutAt / 1000)}:D>`,
        `⏱️ المدة: **${store.formatDuration(sessionMinutes)}**`,
      ].join('\n')
    );

  await channel.send({ embeds: [embed] }).catch(() => {});
}

// ─── معالجات الأوامر ──────────────────────────────────────────

async function handleAttendancePost(interaction) {
  if (!isAdmin(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: 'هذا الأمر للأدمن فقط.', ephemeral: true });
    return;
  }

  store.setWarningChannelId(interaction.channelId);

  await interaction.reply({ content: 'تم نشر لوحة الحضور.', ephemeral: true });
  await interaction.channel.send({
    embeds: [attendancePanelEmbed()],
    components: attendanceButtons(),
  });
}

async function handleMyHours(interaction) {
  await interaction.deferReply({ flags: 64 });

  const minutes = store.getWeeklyMinutes(interaction.user.id);
  const active = store.getActive(interaction.user.id);

  const lines = [
    `يا ${interaction.user}، ساعاتك هذا الأسبوع: **${store.formatDuration(minutes)}**`,
  ];

  if (active) {
    lines.push(
      `أنت مسجل دخول حالياً منذ: ${discordTimestamp(active.loginAt)} (${discordTimestamp(active.loginAt, 'R')})`
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('ساعاتك')
    .setDescription(lines.join('\n'))
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleWarningChannel(interaction) {
  if (!isAdmin(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: 'هذا الأمر للأدمن فقط.', ephemeral: true });
    return;
  }

  store.setWarningChannelId(interaction.channelId);
  await interaction.reply({
    content: `✅ تم تحديد هذا الروم (${interaction.channel}) كروم للتحذيرات التلقائية.`,
    ephemeral: true,
  });
}

async function handleAdminCommand(interaction) {
  if (!isAdmin(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: 'هذا الأمر للأدمن فقط.', ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'عرض') {
    await interaction.reply({
      embeds: [adminPanelEmbed()],
      components: [adminPanelButtons()],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  if (sub === 'الاسبوع') {
    const embed = await buildWeeklyEmbed(interaction.client);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === 'تصفير-الكل') {
    store.resetAll();
    await interaction.editReply({ content: 'تم تصفير ساعات الجميع لهذا الأسبوع.' });
    return;
  }

  if (sub === 'استثناء-قائمة') {
    const ids = store.getExemptions();
    if (ids.length === 0) {
      await interaction.editReply({ content: 'ما في أعضاء مستثنين حالياً.' });
      return;
    }
    const lines = ids.map((id) => `<@${id}>`).join('\n');
    await interaction.editReply({ content: `المستثنين (${ids.length}):\n${lines}` });
    return;
  }

  const user = interaction.options.getUser('عضو', true);

  if (sub === 'عضو') {
    const minutes = store.getWeeklyMinutes(user.id);
    const active = store.getActive(user.id);
    const lines = [`ساعات ${user}: **${store.formatDuration(minutes)}**`];
    if (active) lines.push(`مسجل دخول حالياً منذ: ${discordTimestamp(active.loginAt)}`);
    await interaction.editReply({ content: lines.join('\n') });
    return;
  }

  if (sub === 'اخراج-عضو') {
    const result = store.logout(user.id);
    if (!result.ok) {
      await interaction.editReply({ content: `${user} مو مسجل دخول حالياً.` });
      return;
    }
    await interaction.editReply({
      content: [
        `تمت إزالة ${user} من المسجلين دخول.`,
        `مدة الحضور المحتسبة: **${store.formatDuration(result.sessionMinutes)}**`,
        `إجمالي الأسبوع الآن: **${store.formatDuration(result.weeklyMinutes)}**`,
      ].join('\n'),
    });
    return;
  }

  if (sub === 'استثناء-عضو') {
    store.addExempt(user.id);
    await interaction.editReply({ content: `تم استثناء ${user} من الإزالة التلقائية.` });
    return;
  }

  if (sub === 'الغاء-استثناء-عضو') {
    store.removeExempt(user.id);
    await interaction.editReply({ content: `تم إلغاء استثناء ${user}.` });
    return;
  }

  if (sub === 'تصفير-عضو') {
    store.resetUser(user.id);
    await interaction.editReply({ content: `تم تصفير ساعات ${user}.` });
  }
}

async function handleLogin(interaction) {
  await interaction.deferReply({ flags: 64 });

  const result = store.login(interaction.user.id);

  if (!result.ok) {
    await interaction.editReply({
      content: `أنت مسجل دخول مسبقاً منذ ${discordTimestamp(result.session.loginAt)}. سجّل خروج أولاً.`,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('تم تسجيل الدخول ✅')
    .setDescription(
      [
        `${interaction.user} سجّل دخوله.`,
        `الوقت: ${discordTimestamp(result.session.loginAt)}`,
      ].join('\n')
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  // إرسال لوق الدخول
  await sendLoginLog(interaction.client, interaction.user.id, result.session.loginAt);
}

async function handleLogout(interaction) {
  await interaction.deferReply({ flags: 64 });

  const result = store.logout(interaction.user.id);

  if (!result.ok) {
    await interaction.editReply({ content: 'أنت مو مسجل دخول حالياً.' });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('تم تسجيل الخروج 🛑')
    .setDescription(
      [
        `${interaction.user} سجّل خروجه.`,
        `الدخول: ${discordTimestamp(result.loginAt)}`,
        `الخروج: ${discordTimestamp(result.logoutAt)}`,
        `مدة الحضور: **${store.formatDuration(result.sessionMinutes)}**`,
        `إجمالي الأسبوع: **${store.formatDuration(result.weeklyMinutes)}**`,
      ].join('\n')
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  // إرسال لوق الخروج
  await sendLogoutLog(interaction.client, interaction.user.id, result.logoutAt, result.sessionMinutes);
}

async function handleViewAttendance(interaction) {
  await interaction.deferReply({ flags: 64 });

  const active = store.getAllActive();

  if (active.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle('📋 الحضور الحالي')
      .setDescription('> ما في أحد مسجل دخول حالياً.')
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = active.map((session, index) => {
    const medal = medals[index] || `**${index + 1}.**`;
    const duration = store.formatDuration(Math.floor((Date.now() - session.loginAt) / 60000));
    return `${medal} <@${session.userId}>\n┗ ⏱️ ${discordTimestamp(session.loginAt, 'R')} • ${duration}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 الأعضاء المسجلين دخول حالياً')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `👥 العدد: ${active.length} عضو` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleAdminButton(interaction) {
  if (!isAdmin(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: 'هذا الزر للأدمن فقط.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  if (interaction.customId === 'admin_reset_all') {
    store.resetAll();
    await interaction.editReply({ content: 'تم تصفير ساعات الجميع لهذا الأسبوع.' });
    return;
  }

  if (interaction.customId === 'admin_week') {
    const embed = await buildWeeklyEmbed(interaction.client);
    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleViolators(interaction) {
  if (!isAdmin(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: 'هذا الأمر للأدمن فقط.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  const REQUIRED_MINUTES = 12 * 60; // 12 ساعة

  // نجيب كل أعضاء السيرفر
  let members;
  try {
    members = await interaction.guild.members.fetch();
  } catch {
    await interaction.editReply({ content: 'ما قدرت أجيب قائمة الأعضاء.' });
    return;
  }

  const violators = [];

  for (const [memberId, member] of members) {
    // نتجاهل البوتات
    if (member.user.bot) continue;

    const minutes = store.getWeeklyMinutes(memberId);
    if (minutes < REQUIRED_MINUTES) {
      violators.push({
        userId: memberId,
        tag: member.user.tag,
        minutes,
      });
    }
  }

  if (violators.length === 0) {
    await interaction.editReply({ content: '✅ ما في مخالفين، الجميع تجاوز 12 ساعة!' });
    return;
  }

  // ترتيب من الأقل للأكثر
  violators.sort((a, b) => a.minutes - b.minutes);

  const lines = violators.map((v, i) => {
    const hours = store.formatDuration(v.minutes);
    const hoursStr = v.minutes === 0 ? '**لم يسجل دخول**' : `**${hours}**`;
    return `**${i + 1}.** <@${v.userId}> — ${hoursStr}`;
  });

  // Discord يحد الـ embed بـ 4096 حرف — نقسم لو كثير
  const chunkSize = 30;
  const chunks = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    chunks.push(lines.slice(i, i + chunkSize));
  }

  const { EmbedBuilder: EB } = require('discord.js');

  const embeds = chunks.map((chunk, i) => {
    return new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(i === 0 ? `⚠️ المخالفون — ساعات أقل من 12 ساعة (${violators.length} عضو)` : `⚠️ المخالفون (تابع)`)
      .setDescription(chunk.join('\n'))
      .setFooter({ text: `المطلوب: 12 ساعة أسبوعياً` })
      .setTimestamp();
  });

  await interaction.editReply({ embeds: embeds.slice(0, 10) });
}

async function handleTicketSetup(interaction) {
  if (!isAdmin(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: 'هذا الأمر للأدمن فقط.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();

  if (sub === 'رول-الدعم') {
    const role = interaction.options.getRole('رول', true);
    setConfig(interaction.guild.id, { supportRoleId: role.id });
    await interaction.editReply({ content: `✅ تم تحديد رول الدعم: ${role}` });
    return;
  }

  if (sub === 'قناة-اللوق') {
    const channel = interaction.options.getChannel('قناة', true);
    setConfig(interaction.guild.id, { logChannelId: channel.id });
    await interaction.editReply({ content: `✅ تم تحديد قناة اللوق: ${channel}` });
  }
}

async function handleTicketPost(interaction) {
  if (!isAdmin(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: 'هذا الأمر للأدمن فقط.', ephemeral: true });
    return;
  }

  await interaction.reply({ content: '✅ تم نشر لوحة التذاكر.', ephemeral: true });
  await interaction.channel.send({
    embeds: [ticketPanelEmbed()],
    components: [ticketPanelButtons()],
  });
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'حضور') {
      await handleAttendancePost(interaction);
      return;
    }
    if (interaction.commandName === 'روم-التحذير') {
      await handleWarningChannel(interaction);
      return;
    }
    if (interaction.commandName === 'ساعاتي') {
      await handleMyHours(interaction);
      return;
    }
    if (interaction.commandName === 'لوحة') {
      await handleAdminCommand(interaction);
      return;
    }
    if (interaction.commandName === 'مخالفين') {
      await handleViolators(interaction);
      return;
    }
    if (interaction.commandName === 'voice') {
      await handleVoiceCommand(interaction);
      return;
    }
    if (interaction.commandName === 'winners') {
      await handleWinnersCommand(interaction);
      return;
    }
    if (interaction.commandName === 'تذاكر-نشر') {
      await handleTicketPost(interaction);
      return;
    }
    if (interaction.commandName === 'تذاكر-إعداد') {
      await handleTicketSetup(interaction);
      return;
    }
  }

  if (interaction.isButton()) {
    // نظام التذاكر أولاً
    const handled = await handleTicketInteraction(interaction);
    if (handled) return;
    if (interaction.customId === 'att_login') {
      await handleLogin(interaction);
      return;
    }
    if (interaction.customId === 'att_logout') {
      await handleLogout(interaction);
      return;
    }
    if (interaction.customId === 'att_view') {
      await handleViewAttendance(interaction);
      return;
    }
    if (
      interaction.customId === 'admin_reset_all' ||
      interaction.customId === 'admin_week'
    ) {
      await handleAdminButton(interaction);
    }
  }
}

module.exports = {
  handleInteraction,
  isAdmin,
};
