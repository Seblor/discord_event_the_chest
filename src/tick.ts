import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client, type Message, type TextChannel, type Guild, AttachmentBuilder } from 'discord.js'
import { INTERACTIONS } from './ids'
import prisma from './prisma'
import { formatScore, rankToString } from './utils'

let cache: Record<string, {
  buttonChannel: TextChannel
  buttonMessage: Message
}> = {}

let hasGameEnded = false

export function clearTickCache (guild: Guild | undefined): void {
  if (guild != null) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete cache[guild.id]
    return
  }
  cache = {}
}

export async function tick (): Promise<void> {
  await prisma.button.updateMany({
    data: {
      seconds: {
        increment: 1
      }
    }
  })
}

async function updateButtons (client: Client): Promise<void> {
  await Promise.all(
    client.guilds.cache.map(async (guild): Promise<void> => {
      const guildButton = await prisma.button.findFirst({
        select: {
          seconds: true,
          emojiId: true,
          guildId: true,
          buttonChannelId: true,
          messageId: true
        },
        where: {
          guildId: guild.id
        }
      })

      if (guildButton === null) {
        console.error('No button found for guild', guild.id)
        return
      }

      if (cache[guild.id] === undefined) {
        const buttonChannel = await guild.channels.fetch(guildButton.buttonChannelId)
        cache[guild.id] = {
          buttonChannel: buttonChannel as TextChannel,
          buttonMessage: await (buttonChannel as TextChannel).messages.fetch(guildButton.messageId)
        }
      }

      const sendStart = Date.now()
      await cache[guild.id].buttonMessage.edit({
        content: await generateMessageForGuild(guild.id),
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(INTERACTIONS.BUTTONS.THE_BUTTON)
              .setLabel(formatScore(guildButton.seconds))
              .setEmoji(guildButton.emojiId)
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(INTERACTIONS.BUTTONS.READ_MY_SCORE)
              .setLabel('Voir mes scores')
              .setStyle(ButtonStyle.Secondary)
          )
        ],
        allowedMentions: {
          users: []
        }
      })
      const sendEnd = Date.now()
      const delta = sendEnd - sendStart
      console.log(`Updated button message for guild ${guild.name} in ${delta}ms`)
      if (delta > 3e3) {
        console.log('Button message took too long to update, resending a new message')
        await resendButtonMessage(client)
      }
    })
  )
}

// Generate the message for the button, which includes a scoreboard of the 10 first players
async function generateMessageForGuild (guildId: string): Promise<string> {
  const lastClick = await prisma.userScore.findFirst({
    select: {
      userId: true,
      score: true
    },
    where: {
      guildId
    },
    orderBy: {
      attemptDate: 'desc'
    }
  })

  const scores = await prisma.userScore.groupBy({
    by: ['userId'],
    _sum: {
      score: true
    },
    where: {
      guildId
    },
    orderBy: {
      _sum: {
        score: 'desc'
      }
    },
    take: 10
  })
  let message = 'Tableau des scores:\n'
  if (scores.length === 0) {
    message += 'Aucun score pour le moment'
  } else {
    for (const score of scores) {
      message += `<@${score.userId}> - ${formatScore(score._sum?.score ?? 0)}\n`
    }
  }
  if (lastClick != null) {
    message += `\n\nDernier clic: <@${lastClick.userId}> - ${formatScore(lastClick.score)}`
  }
  return message
}

// Calls the "tick" function in a loop but waits 1 second after the function ends before restarting it
export async function startTicks (client: Client): Promise<void> {
  const tickLoop = async (): Promise<void> => {
    if (hasGameEnded) {
      return
    }
    try {
      await updateButtons(client)
    } catch (e) {
      console.error('Error while ticking', e)
    }
    setTimeout(tickLoop, 1e3)
  }
  void tickLoop()

  const incrementInterval = setInterval(tick, 1e3)

  const endTime = process.env.END_TIMESTAMP
  if (endTime != null) {
    const endTimestamp = parseInt(endTime)
    setTimeout(() => {
      console.log('Stopping ticks')
      clearInterval(incrementInterval)
      void endGame(client)
    }, endTimestamp - Date.now())
  }
}

async function endGame (client: Client): Promise<void> {
  await Promise.all(
    client.guilds.cache.map(async (guild): Promise<void> => {
      const guildButton = await prisma.button.findFirst({
        select: {
          seconds: true,
          emojiId: true,
          guildId: true,
          buttonChannelId: true,
          messageId: true
        },
        where: {
          guildId: guild.id
        }
      })

      if (guildButton === null) {
        console.error('No button found for guild', guild.id)
        return
      }

      if (cache[guild.id] === undefined) {
        const buttonChannel = await guild.channels.fetch(guildButton.buttonChannelId)
        cache[guild.id] = {
          buttonChannel: buttonChannel as TextChannel,
          buttonMessage: await (buttonChannel as TextChannel).messages.fetch(guildButton.messageId)
        }
      }
      await cache[guild.id].buttonMessage.edit({
        content: await generateMessageForGuild(guild.id),
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(INTERACTIONS.BUTTONS.THE_BUTTON)
              .setLabel(formatScore(guildButton.seconds))
              .setDisabled(true)
              .setEmoji(guildButton.emojiId)
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(INTERACTIONS.BUTTONS.READ_MY_SCORE)
              .setLabel('Voir mes scores')
              .setStyle(ButtonStyle.Secondary)
          )
        ],
        allowedMentions: {
          users: []
        }
      })

      const scoreboardFile = await generateFullScoreboardAsAttachment(guild)
      await cache[guild.id].buttonChannel.send({
        content: 'Voici le classement final:',
        files: [scoreboardFile]
      })
    })
  )
  hasGameEnded = true
}

export async function generateFullScoreboardAsAttachment (guild: Guild): Promise<AttachmentBuilder> {
  const scores = await prisma.userScore.groupBy({
    by: ['userId'],
    _sum: {
      score: true
    },
    where: {
      guildId: guild.id
    },
    orderBy: {
      _sum: {
        score: 'desc'
      }
    }
  })

  return new AttachmentBuilder(Buffer.from(scores.map((score, index) => `${rankToString(index)}: ${guild.members.cache.get(score.userId)?.displayName ?? score.userId} - ${formatScore(score._sum?.score ?? 0)}`).join('\n')))
    .setName('scoreboard.txt')
}
