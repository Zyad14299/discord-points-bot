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

].map((command) => command.toJSON());

module.exports = { commands };
