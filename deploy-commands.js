require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { commands } = require('./src/commands');
const config = require('./src/config');

async function deploy() {
  const rest = new REST({ version: '10' }).setToken(config.token);

  console.log('جاري تسجيل الأوامر...');
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands }
  );
  console.log('تم تسجيل الأوامر بنجاح.');
}

deploy().catch((error) => {
  console.error('فشل تسجيل الأوامر:', error);
  process.exit(1);
});
