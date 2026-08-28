const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('حضور')
    .setDescription('نشر لوحة تسجيل الحضور في الروم')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('روم-التحذير')
    .setDescription('تحديد روم التحذير للنظام التلقائي')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('ساعاتي')
    .setDescription('عرض ساعات حضورك هذا الأسبوع'),

  new SlashCommandBuilder()
    .setName('لوحة')
    .setDescription('لوحة تحكم الأدمن للحضور')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName('عرض').setDescription('فتح لوحة الأدمن')
    )
    .addSubcommand((sub) =>
      sub.setName('الاسبوع').setDescription('عرض ساعات الجميع هذا الأسبوع')
    )
    .addSubcommand((sub) =>
      sub
        .setName('عضو')
        .setDescription('عرض ساعات عضو محدد')
        .addUserOption((option) =>
          option.setName('عضو').setDescription('العضو').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('اخراج-عضو')
        .setDescription('إزالة عضو من المسجلين دخول حالياً')
        .addUserOption((option) =>
          option.setName('عضو').setDescription('العضو').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('استثناء-عضو')
        .setDescription('استثناء عضو من نظام الإزالة التلقائية')
        .addUserOption((option) =>
          option.setName('عضو').setDescription('العضو').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('الغاء-استثناء-عضو')
        .setDescription('إلغاء استثناء عضو')
        .addUserOption((option) =>
          option.setName('عضو').setDescription('العضو').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('استثناء-قائمة').setDescription('عرض قائمة الأعضاء المستثنين')
    )
    .addSubcommand((sub) =>
      sub
        .setName('تصفير-عضو')
        .setDescription('تصفير ساعات عضو واحد')
        .addUserOption((option) =>
          option.setName('عضو').setDescription('العضو').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('تصفير-الكل').setDescription('تصفير ساعات الجميع')
    ),

  new SlashCommandBuilder()
    .setName('مخالفين')
    .setDescription('عرض الأعضاء الذين ساعاتهم أقل من 12 ساعة هذا الأسبوع')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ─── أوامر الساعات الصوتية ───
  new SlashCommandBuilder()
    .setName('voice')
    .setDescription('إدارة ساعات الروم الصوتي')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('أضف وقت لعضو')
        .addUserOption((o) =>
          o.setName('عضو').setDescription('العضو').setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName('دقائق').setDescription('عدد الدقائق').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('اسحب وقت من عضو')
        .addUserOption((o) =>
          o.setName('عضو').setDescription('العضو').setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName('دقائق').setDescription('عدد الدقائق').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('صفّر ساعات عضو')
        .addUserOption((o) =>
          o.setName('عضو').setDescription('العضو').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('reset-all').setDescription('صفّر ساعات الجميع في اللوحة الصوتية')
    ),

  // ─── لوحة الفائزين الأسبوعية ───
  new SlashCommandBuilder()
    .setName('winners')
    .setDescription('عرض لوحة الفائزين الأسبوعيين')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

].map((command) => command.toJSON());

module.exports = { commands };
