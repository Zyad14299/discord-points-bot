const path = require('path');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const play = require('play-dl');

const ffmpegPath = require('ffmpeg-static');
if (ffmpegPath) {
  process.env.PATH = `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH}`;
  process.env.FFMPEG_PATH = ffmpegPath;
}

/** @type {Map<string, GuildMusic>} */
const guildPlayers = new Map();

class GuildMusic {
  constructor(guildId) {
    this.guildId = guildId;
    this.queue = [];
    this.player = createAudioPlayer();
    this.connection = null;
    this.current = null;
    this.volume = 0.5;
    this.textChannel = null;

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.current = null;
      this.playNext().catch(() => {});
    });

    this.player.on('error', (error) => {
      console.error('خطأ مشغل الصوت:', error.message);
      this.current = null;
      this.playNext().catch(() => {});
    });
  }

  async connect(voiceChannel) {
    const existing = getVoiceConnection(this.guildId);
    if (existing) {
      this.connection = existing;
      this.connection.subscribe(this.player);
      return;
    }

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.connection.subscribe(this.player);

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  async enqueue(track, voiceChannel, textChannel) {
    this.textChannel = textChannel || this.textChannel;
    await this.connect(voiceChannel);
    this.queue.push(track);

    if (!this.current && this.player.state.status !== AudioPlayerStatus.Playing) {
      await this.playNext();
      return { queued: false, track: this.current || track };
    }

    return { queued: true, track, position: this.queue.length };
  }

  async playNext() {
    const next = this.queue.shift();
    if (!next) {
      this.current = null;
      return;
    }

    this.current = next;

    const streamInfo = await play.stream(next.url, { discordPlayerCompatibility: true });
    const resource = createAudioResource(streamInfo.stream, {
      inputType: streamInfo.type,
      inlineVolume: true,
    });

    if (resource.volume) {
      resource.volume.setVolume(this.volume);
    }

    this.player.play(resource);

    if (this.textChannel) {
      await this.textChannel
        .send(`▶️ الحين: **${next.title}** — طلبها ${next.requestedBy}`)
        .catch(() => {});
    }
  }

  skip() {
    if (!this.current && this.queue.length === 0) {
      return null;
    }
    const skipped = this.current;
    this.player.stop(true);
    return skipped;
  }

  stop() {
    this.queue = [];
    this.current = null;
    this.player.stop(true);
    this.destroy();
  }

  pause() {
    return this.player.pause(true);
  }

  resume() {
    return this.player.unpause();
  }

  setVolume(percent) {
    const value = Math.max(0, Math.min(100, Number(percent)));
    this.volume = value / 100;

    const resource = this.player.state.resource;
    if (resource?.volume) {
      resource.volume.setVolume(this.volume);
    }

    return value;
  }

  destroy() {
    try {
      this.player.stop(true);
    } catch {
      // ignore
    }
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    guildPlayers.delete(this.guildId);
  }
}

function getGuildMusic(guildId) {
  let music = guildPlayers.get(guildId);
  if (!music) {
    music = new GuildMusic(guildId);
    guildPlayers.set(guildId, music);
  }
  return music;
}

async function resolveTrack(query, requestedBy) {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    throw new Error('اكتب اسم الأغنية أو رابط يوتيوب.');
  }

  let url = trimmed;
  let title = trimmed;

  if (play.yt_validate(trimmed) === 'video') {
    const info = await play.video_info(trimmed);
    title = info.video_details.title;
    url = info.video_details.url;
  } else if (play.yt_validate(trimmed) === 'playlist') {
    throw new Error('حالياً ما ندعم قوائم التشغيل، حط اسم أغنية أو رابط فيديو.');
  } else {
    const results = await play.search(trimmed, { limit: 1, source: { type: 'video' } });
    if (!results.length) {
      throw new Error('ما لقيت نتيجة على يوتيوب.');
    }
    title = results[0].title;
    url = results[0].url;
  }

  return {
    title,
    url,
    requestedBy,
  };
}

module.exports = {
  getGuildMusic,
  resolveTrack,
};
