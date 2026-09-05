/**
 * ticketSystem.js
 * نظام التذاكر بالعربي الكامل
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'tickets.json');

// ─── حفظ وقراءة البيانات ──────────────────────────────────────
function readTicketData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ config: {}, tickets: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { config: {}, tickets: {} };
  }
}

function writeTicketData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getConfig(guildId) {
  const data = readTicketData();
  return data.config[guildId] || {};
}

function setConfig(guildId, cfg) {
  const data = readTicketData();
  data.config[guildId] = { ...(data.config[guildId] || {}), ...cfg };
  writeTicketData(data);
}

function saveTicket(channelId, info) {
  const data = readTicketData();
  data.tickets[channelId] = info;
  writeTicketData(data);
}

function getTicket(channelId) {
  const data = readTicketData();
  return data.tickets[channelId] || null;
}

function deleteTicket(channelId) {
  const data = readTicketData();
  delete data.tickets[channelId];
  writeTicketData(data);
}

// ─── مساعد: جيب قناة لوق التذاكر ────────────────────────────
async function getLogChannel(guild) {
  const cfg = getConfig(guild.id);
  if (!cfg.logChannelId) return null;
  try {
    return await guild.channels.fetch(cfg.logChannelId);
  } catch {
    return null;
  }
}

// ─── إرسال لوق ────────────────────────────────────────────────
async function sendTicketLog(guild, embed) {
  const ch = await getLogChannel(guild);
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}

// ─── لوحة فتح التذكرة ─────────────────────────────────────────
function ticketPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫  نظام التذاكر')
    .setDescription(
      [
        '> مرحباً بك في نظام الدعم!',
        '',
        '**لفتح تذكرة جديدة:**',
        'اضغط على زر **📩 فتح تذكرة** أدناه وسيتم إنشاء قناة خاصة بك مع فريق الدعم.',
        '',
        '**ملاحظة:**',
        'الرجاء وصف مشكلتك بوضوح بعد فتح التذكرة.',
      ].join('\n')
    )
    .setFooter({ text: 'نظام التذاكر' })
    .setTimestamp();
}

function ticketPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open')
      .setLabel('📩  فتح تذكرة')
      .setStyle(ButtonStyle.Primary)
  );
}

// ─── فتح تذكرة ────────────────────────────────────────────────
async function openTicket(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;
  const cfg = getConfig(guild.id);

  await interaction.deferReply({ ephemeral: true });

  // نشوف لو عنده تذكرة مفتوحة
  const data = readTicketData();
  const existingTicket = Object.values(data.tickets).find(
    (t) => t.userId === user.id && t.guildId === guild.id && t.status === 'open'
  );

  if (existingTicket) {
    await interaction.editReply({
      content: `عندك تذكرة مفتوحة بالفعل: <#${existingTicket.channelId}>`,
    });
    return;
  }

  // نجيب الكاتيقوري
  let category = guild.channels.cache.find(
    (c) => c.name === 'Tickets' && c.type === ChannelType.GuildCategory
  );

  // نحسب رقم التذكرة
  const ticketCount = Object.keys(data.tickets).length + 1;
  const channelName = `تذكرة-${user.username}-${ticketCount}`;

  // صلاحيات القناة
  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  // نضيف رول الأدمن لو موجود
  if (cfg.supportRoleId) {
    permissionOverwrites.push({
      id: cfg.supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  // ننشئ القناة
  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id || null,
      permissionOverwrites,
      topic: `تذكرة ${user.tag} | رقم ${ticketCount}`,
    });
  } catch (e) {
    await interaction.editReply({ content: `فشل إنشاء القناة: ${e.message}` });
    return;
  }

  // نحفظ التذكرة
  saveTicket(ticketChannel.id, {
    channelId: ticketChannel.id,
    userId: user.id,
    guildId: guild.id,
    ticketNumber: ticketCount,
    openedAt: Date.now(),
    status: 'open',
  });

  // نرسل رسالة الترحيب داخل التذكرة
  const welcomeEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🎫  تذكرة #${ticketCount}`)
    .setDescription(
      [
        `أهلاً ${user}!`,
        '',
        'تم فتح تذكرتك بنجاح. سيقوم فريق الدعم بالرد عليك في أقرب وقت.',
        '',
        '**يرجى وصف مشكلتك بوضوح.**',
        '',
        'لإغلاق التذكرة اضغط على الزر أدناه.',
      ].join('\n')
    )
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('🔒  إغلاق التذكرة')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('✋  استلام التذكرة')
      .setStyle(ButtonStyle.Secondary)
  );

  await ticketChannel.send({
    content: `${user} ${cfg.supportRoleId ? `<@&${cfg.supportRoleId}>` : ''}`,
    embeds: [welcomeEmbed],
    components: [closeRow],
  });

  await interaction.editReply({
    content: `✅ تم فتح تذكرتك: ${ticketChannel}`,
  });

  // لوق
  const logEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🎫  تذكرة جديدة')
    .addFields(
      { name: '👤 المستخدم', value: `${user} (${user.tag})`, inline: true },
      { name: '🔢 رقم التذكرة', value: `#${ticketCount}`, inline: true },
      { name: '📍 القناة', value: `${ticketChannel}`, inline: true }
    )
    .setTimestamp();

  await sendTicketLog(guild, logEmbed);
}

// ─── إغلاق تذكرة ─────────────────────────────────────────────
async function closeTicket(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const ticket = getTicket(channel.id);

  if (!ticket) {
    await interaction.reply({ content: 'هذه القناة ليست تذكرة.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  // نبني الأرشيف (نسخة نصية من المحادثة)
  let archiveText = `=== أرشيف التذكرة #${ticket.ticketNumber} ===\n`;
  archiveText += `المستخدم: ${ticket.userId}\n`;
  archiveText += `تاريخ الفتح: ${new Date(ticket.openedAt).toLocaleString('ar-SA')}\n`;
  archiveText += `تاريخ الإغلاق: ${new Date().toLocaleString('ar-SA')}\n`;
  archiveText += `===========================================\n\n`;

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].reverse();
    for (const msg of sorted) {
      if (msg.author.bot) continue;
      archiveText += `[${new Date(msg.createdTimestamp).toLocaleTimeString('ar-SA')}] ${msg.author.tag}: ${msg.content}\n`;
    }
  } catch { /* تجاهل */ }

  // نرسل الأرشيف لقناة archives
  const archiveChannel = guild.channels.cache.find((c) => c.name === 'archives');
  if (archiveChannel) {
    const archiveEmbed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle(`📦  أرشيف تذكرة #${ticket.ticketNumber}`)
      .addFields(
        { name: '👤 المستخدم', value: `<@${ticket.userId}>`, inline: true },
        { name: '🔒 أُغلقت بواسطة', value: `${interaction.user}`, inline: true },
        { name: '📅 التاريخ', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setTimestamp();

    await archiveChannel.send({
      embeds: [archiveEmbed],
      files: [
        {
          attachment: Buffer.from(archiveText, 'utf8'),
          name: `تذكرة-${ticket.ticketNumber}.txt`,
        },
      ],
    }).catch(() => {});
  }

  // لوق الإغلاق
  const logEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🔒  تذكرة مغلقة')
    .addFields(
      { name: '👤 المستخدم', value: `<@${ticket.userId}>`, inline: true },
      { name: '🔒 أُغلقت بواسطة', value: `${interaction.user}`, inline: true },
      { name: '🔢 رقم التذكرة', value: `#${ticket.ticketNumber}`, inline: true }
    )
    .setTimestamp();

  await sendTicketLog(guild, logEmbed);

  // نحدّث الحالة
  ticket.status = 'closed';
  ticket.closedAt = Date.now();
  ticket.closedBy = interaction.user.id;
  saveTicket(channel.id, ticket);

  await interaction.editReply({ content: '🔒 جاري إغلاق التذكرة...' });

  // نحذف القناة بعد 5 ثواني
  setTimeout(async () => {
    try {
      deleteTicket(channel.id);
      await channel.delete('تم إغلاق التذكرة');
    } catch { /* تجاهل */ }
  }, 5000);
}

// ─── استلام تذكرة ─────────────────────────────────────────────
async function claimTicket(interaction) {
  const ticket = getTicket(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ content: 'هذه القناة ليست تذكرة.', ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `✅ تم استلام التذكرة بواسطة ${interaction.user}`,
  });
}

// ─── معالج التفاعلات ──────────────────────────────────────────
async function handleTicketInteraction(interaction) {
  if (!interaction.isButton()) return false;

  if (interaction.customId === 'ticket_open') {
    await openTicket(interaction);
    return true;
  }

  if (interaction.customId === 'ticket_close') {
    await closeTicket(interaction);
    return true;
  }

  if (interaction.customId === 'ticket_claim') {
    await claimTicket(interaction);
    return true;
  }

  return false;
}

module.exports = {
  ticketPanelEmbed,
  ticketPanelButtons,
  handleTicketInteraction,
  getConfig,
  setConfig,
};
