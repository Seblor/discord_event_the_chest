import { type AudioPlayer, createAudioPlayer, createAudioResource, getVoiceConnection, joinVoiceChannel } from '@discordjs/voice'
import { type Guild } from 'discord.js'
import { join } from 'path'
import prisma from './prisma'

const audioPlayers: Record<string, AudioPlayer> = {}

export async function connectToVoiceChannel (guild: Guild): Promise<void> {
  const voiceChannelQuery = await prisma.button.findFirst({
    select: {
      voiceChannelId: true
    },
    where: {
      guildId: guild.id
    }
  })
  if (voiceChannelQuery === null) {
    console.error('No voice channel found for guild', guild.id)
    return
  }
  joinVoiceChannel({
    channelId: voiceChannelQuery.voiceChannelId,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator
  })
}

export async function playButtonSound (guild: Guild): Promise<void> {
  // Audio files were originally the Minecraft button's sounds but were changed to the chest's sounds to use a theme more understandable with the bot's concept
  const resources = {
    buttonPress: createAudioResource(join(__dirname, '..', 'assets', 'Chest_open.ogg')),
    buttonRelease: createAudioResource(join(__dirname, '..', 'assets', 'Chest_close.ogg'))
  }
  const voiceConnection = getVoiceConnection(guild.id)
  if (voiceConnection === undefined) {
    console.error('No voice connection found for guild', guild.id)
    return
  }
  if (audioPlayers[guild.id] === undefined) {
    audioPlayers[guild.id] = createAudioPlayer()
    voiceConnection.subscribe(audioPlayers[guild.id])
  }

  audioPlayers[guild.id].play(resources.buttonPress)

  // wait 1 second
  await new Promise(resolve => setTimeout(resolve, 1000))
  audioPlayers[guild.id].play(resources.buttonRelease)
}
