import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type TextChannel, type Client, type Guild, type CategoryChannel, type Role, type Emoji, AttachmentBuilder, ChannelType } from 'discord.js'
import { INTERACTIONS } from './ids'
import prisma from './prisma'
import { formatScore, rankToString, replaceNumbers } from './utils'
import { connectToVoiceChannel } from './voice'

const DEFAULT_EMOJI = '💎'

enum GAME_STATE {
  WAITING,
  STARTED,
  ENDED
}

export default class Game {
  client: Client
  guild: Guild
  state: GAME_STATE = GAME_STATE.WAITING
  categoryChannel: CategoryChannel
  diamondEmoji: Emoji | null
  startTimestamp: Date
  endTimestamp: Date
  tickInterval: NodeJS.Timer | undefined

  // Random between 0 and 3
  antibot = Math.floor(Math.random() * 4)

  constructor (guild: Guild, {
    category,
    diamondEmoji,
    startTimestamp,
    endTimestamp
  }: {
    category: CategoryChannel
    diamondEmoji: Emoji | null
    startTimestamp: Date
    endTimestamp: Date
  }) {
    this.guild = guild
    this.client = guild.client
    this.categoryChannel = category
    this.diamondEmoji = diamondEmoji
    this.startTimestamp = startTimestamp
    this.endTimestamp = endTimestamp

    this.addGameStateChangeTimers()

    const now = new Date()
    if (now > startTimestamp) {
      this.state = GAME_STATE.STARTED
    }

    if (now > endTimestamp) {
      this.state = GAME_STATE.ENDED
    }

    Game.games.set(guild.id, this)
    void connectToVoiceChannel(guild)

    setInterval(() => {
      // Random between 0 and 3
      this.antibot = Math.floor(Math.random() * 4)
    }, 60e3)
  }

  async init (muteRole: Role): Promise<void> {
    const buttonChannelQuery = await prisma.button.findFirst({
      select: {
        buttonChannelId: true
      },
      where: {
        guildId: this.guild.id
      }
    })
    if (buttonChannelQuery === null) {
      await this.categoryChannel.permissionOverwrites.set([
        {
          id: muteRole.id,
          deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads', 'CreatePrivateThreads', 'Speak']
        }
      ])

      // Create channels "The Button" and "The Button - Discussion"
      const [buttonChannel, discussionChannel, voiceChannel] = await Promise.all([
        this.categoryChannel.guild.channels.create({
          name: 'Le Bouton',
          type: ChannelType.GuildText,
          parent: this.categoryChannel.id,
          position: 1,
          permissionOverwrites: [
            {
              id: this.categoryChannel.guild.roles.everyone.id,
              deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads', 'CreatePrivateThreads'],
              allow: ['UseApplicationCommands']
            },
            {
              id: this.client.user?.id ?? '1082801315832406016',
              allow: ['SendMessages']
            }
          ]
        }),
        this.categoryChannel.guild.channels.create({
          name: 'Le Bouton - Discussion',
          type: ChannelType.GuildText,
          parent: this.categoryChannel.id,
          position: 2
        }),
        this.categoryChannel.guild.channels.create({
          name: 'Le Bouton - Discussion',
          type: ChannelType.GuildVoice,
          parent: this.categoryChannel.id,
          position: 3
        })
      ])

      // Send event rules
      await buttonChannel.send({
        content: `
**lisez attentivement !**
En dessous de ce message se trouve un bouton avec un nombre de diamants qui augmente au fil du temps. Ces diamants sont stockés dans un coffre commun qui est partagé avec tout le monde sur le serveur.
Lorsqu'une personne clique sur ce bouton, il prends tous les diamants, et le coffre est vidé.
Votre score utilisé pour le classement est le total des diamants que vous avez récupéré.
**Vous avez un nombre de clics limité** : 3 clics par personne (ou 4 pour les membres qui boostent le serveur, merci à vous <:merci:885221354834636810>)
L'évènement commence à <t:${Math.floor(this.startTimestamp.getTime() / 1000)}> et fini à <t:${Math.floor(this.endTimestamp.getTime() / 1000)}> (pour un total de 36 heures).
Bien évidemment, ça serait moins intéressant sans un prix à la clé, c'est pourquoi **le gagnant recevra un compte Minecraft !**
De plus, un rôle commémoratif sera attribué aux 100 premiers du classement.

Vous avez à votre disposition un channel de discussion textuel et vocal. Je serait présent dans le channel vocal pour vous jouer un petit bruit lorsque quelqu'un cliquera sur le bouton ;)
Merci de ne pas en abuser <:top:844994232691195944>

Petits détails :
- À cause des limitations de Discord, il est possible que le bouton saute des nombres (par exemple passe de 7 à 9), c'est normal et ça n'est que visuel, j'ai bien la bonne valeur enregistrée de mon côté.
- Il est probable que je recrée un message avec le bouton toutes les heures, c'est encore une limitation de Discord.
`
      })

      // Create button message
      const buttonMessage = await buttonChannel.send({
        content: `Le jeu n'a pas encore commencé, revenez <t:${Math.floor(this.startTimestamp.getTime() / 1000)}:R> :)`,
        components: [
          this.generateButtons()
        ]
      })

      await prisma.button.upsert({
        create: {
          guildId: this.guild.id,
          categoryId: this.categoryChannel.id,
          buttonChannelId: buttonChannel.id,
          messageId: buttonMessage.id,
          discussionChannelId: discussionChannel.id,
          voiceChannelId: voiceChannel.id,
          endTimestamp: new Date(this.endTimestamp),
          startTimestamp: new Date(this.startTimestamp),
          emojiId: this.diamondEmoji?.id ?? DEFAULT_EMOJI,
          seconds: 0
        },
        update: {
          guildId: this.guild.id,
          categoryId: this.categoryChannel.id,
          buttonChannelId: buttonChannel.id,
          messageId: buttonMessage.id,
          discussionChannelId: discussionChannel.id,
          voiceChannelId: voiceChannel.id
        },
        where: {
          guildId: this.guild.id
        }
      })
    }
    void connectToVoiceChannel(this.guild)
  }

  addGameStateChangeTimers (): void {
    const now = Date.now()

    const startDelay = this.startTimestamp.getTime() - now
    const endDelay = this.endTimestamp.getTime() - now

    console.log(`Starting game in ${startDelay}ms`)
    console.log(`Ending game in ${endDelay}ms`)

    if (endDelay > 0) {
      setTimeout(() => {
        this.startGame()
      }, startDelay)

      setTimeout(() => {
        void this.endGame()
      }, endDelay)
    }
  }

  async tick (): Promise<void> {
    // Increment button's seconds
    await prisma.button.updateMany({
      data: {
        seconds: {
          increment: 1
        }
      },
      where: {
        guildId: this.guild.id
      }
    })
  }

  async buttonMessageUpdateLoop (): Promise<void> {
    if (this.state !== GAME_STATE.STARTED) {
      return
    }
    await this.updateButtonMessage()
    // wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000))
    // update again
    void this.buttonMessageUpdateLoop()
  }

  startGame (): void {
    this.state = GAME_STATE.STARTED

    this.tickInterval = setInterval(() => {
      void this.tick()
    }, 1000)

    void this.buttonMessageUpdateLoop()
  }

  async endGame (): Promise<void> {
    this.state = GAME_STATE.ENDED
    await this.updateButtonMessage()

    clearInterval(this.tickInterval)

    const scoreboardFile = await this.generateFullScoreboardAsAttachment()
    const buttonChannelQuery = await prisma.button.findFirst({
      select: {
        buttonChannelId: true
      },
      where: {
        guildId: this.guild.id
      }
    })
    if (buttonChannelQuery === null) {
      console.error('No button found for guild', this.guild.id)
      return
    }

    const buttonChannel = this.guild.channels.cache.get(buttonChannelQuery.buttonChannelId) as TextChannel
    void buttonChannel.send({
      content: 'Voici le classement final:',
      files: [scoreboardFile]
    })
  }

  async updateButtonMessage (): Promise<void> {
    const guildButton = await prisma.button.findFirst({
      select: {
        seconds: true,
        emojiId: true,
        guildId: true,
        buttonChannelId: true,
        messageId: true
      },
      where: {
        guildId: this.guild.id
      }
    })

    if (guildButton === null) {
      console.error('No button found for guild', this.guild.id)
      return
    }

    const buttonChannel = await this.guild.channels.fetch(guildButton.buttonChannelId)
    const buttonMessage = await (buttonChannel as TextChannel).messages.fetch(guildButton.messageId)

    const sendStart = Date.now()
    await buttonMessage.edit({
      content: await this.generateButtonMessageContent(),
      components: [
        this.generateButtons(guildButton.seconds)
      ],
      allowedMentions: {
        users: []
      }
    }).catch(console.log)
    const sendEnd = Date.now()
    const delta = sendEnd - sendStart
    if (delta > 1e3) {
      console.log(`Updated button message for guild ${this.guild.name} in ${delta}ms`)
    }
    if (delta > 3e3) {
      console.log('Button message took too long to update, resending a new message')
      await this.resendButtonMessage()
    }
  }

  generateButtons (value: number = 0): ActionRowBuilder<ButtonBuilder> {
    const disabled = this.state !== GAME_STATE.STARTED // Disable button if game is not ongoing
    const buttons = [
      new ButtonBuilder()
        .setCustomId(this.antibot === 0 ? INTERACTIONS.BUTTONS.THE_BUTTON : INTERACTIONS.BUTTONS.THE_BUTTON_ANTIBOT_0)
        .setLabel(replaceNumbers(formatScore(value), this.antibot))
        .setDisabled(disabled || this.antibot !== 0)
        .setEmoji(this.diamondEmoji?.id ?? DEFAULT_EMOJI)
        .setStyle(getStyleFromAntibot(this.antibot)),
      new ButtonBuilder()
        .setCustomId(this.antibot === 1 ? INTERACTIONS.BUTTONS.THE_BUTTON : INTERACTIONS.BUTTONS.THE_BUTTON_ANTIBOT_1)
        .setLabel(replaceNumbers(formatScore(value), this.antibot))
        .setDisabled(disabled || this.antibot !== 1)
        .setEmoji(this.diamondEmoji?.id ?? DEFAULT_EMOJI)
        .setStyle(getStyleFromAntibot(this.antibot)),
      new ButtonBuilder()
        .setCustomId(this.antibot === 2 ? INTERACTIONS.BUTTONS.THE_BUTTON : INTERACTIONS.BUTTONS.THE_BUTTON_ANTIBOT_2)
        .setLabel(replaceNumbers(formatScore(value), this.antibot))
        .setDisabled(disabled || this.antibot !== 2)
        .setEmoji(this.diamondEmoji?.id ?? DEFAULT_EMOJI)
        .setStyle(getStyleFromAntibot(this.antibot)),
      new ButtonBuilder()
        .setCustomId(this.antibot === 3 ? INTERACTIONS.BUTTONS.THE_BUTTON : INTERACTIONS.BUTTONS.THE_BUTTON_ANTIBOT_3)
        .setLabel(replaceNumbers(formatScore(value), this.antibot))
        .setDisabled(disabled || this.antibot !== 3)
        .setEmoji(this.diamondEmoji?.id ?? DEFAULT_EMOJI)
        .setStyle(getStyleFromAntibot(this.antibot))
    ]

    const countButton = new ButtonBuilder()
      .setCustomId(INTERACTIONS.BUTTONS.READ_MY_SCORE)
      .setDisabled(this.state === GAME_STATE.WAITING) // Disable button if game never started
      .setLabel('Compter mes diamants')
      .setStyle(ButtonStyle.Secondary)

    // insert count button at random position using this.antibot
    buttons.splice(this.antibot, 0, countButton)

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...buttons
    )
  }

  async resendButtonMessage (): Promise<void> {
    this.client.guilds.cache.map(async guild => {
      const buttonChannelQuery = await prisma.button.findFirst({
        select: {
          buttonChannelId: true,
          emojiId: true,
          messageId: true
        },
        where: {
          guildId: guild.id
        }
      })
      if (buttonChannelQuery === null) {
        return
      }
      const buttonChannel = await guild.channels.fetch(buttonChannelQuery.buttonChannelId) as TextChannel
      // Create button message
      const buttonMessage = await buttonChannel.send({
        content: await this.generateButtonMessageContent(),
        components: [
          this.generateButtons()
        ],
        allowedMentions: {
          users: []
        }
      })
      const oldMessage = await buttonChannel.messages.fetch(buttonChannelQuery.messageId)
      await oldMessage.delete()
      await prisma.button.update({
        where: {
          guildId: guild.id
        },
        data: {
          messageId: buttonMessage.id
        }
      })
    })
  }

  async generateButtonMessageContent (): Promise<string> {
    const [lastClick, scores] = await prisma.$transaction([
      prisma.userScore.findFirst({
        select: {
          userId: true,
          score: true
        },
        where: {
          guildId: this.guild.id
        },
        orderBy: {
          attemptDate: 'desc'
        }
      }),

      prisma.userScore.groupBy({
        by: ['userId'],
        _sum: {
          score: true
        },
        where: {
          guildId: this.guild.id
        },
        orderBy: {
          _sum: {
            score: 'desc'
          }
        },
        take: 10
      })
    ])

    let message = 'Tableau des scores (10 premiers):\n'
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

  async generateFullScoreboardAsAttachment (): Promise<AttachmentBuilder> {
    const scores = await prisma.userScore.groupBy({
      by: ['userId'],
      _sum: {
        score: true
      },
      where: {
        guildId: this.guild.id
      },
      orderBy: {
        _sum: {
          score: 'desc'
        }
      }
    })

    return new AttachmentBuilder(Buffer.from(scores.map((score, index) => `${rankToString(index)}: ${this.guild.members.cache.get(score.userId)?.displayName ?? score.userId} - ${formatScore(score._sum?.score ?? 0)}`).join('\n')))
      .setName('scoreboard.txt')
  }

  static games = new Map<string, Game>()

  static async getGame (guild: Guild): Promise<Game | null> {
    if (Game.games.has(guild.id)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return Game.games.get(guild.id)!
    }
    const buttonQuery = await prisma.button.findFirst({
      where: {
        guildId: guild.id
      }
    })
    if (buttonQuery === null) {
      return null
    }
    const game = new Game(guild, {
      category: guild.channels.cache.get(buttonQuery.categoryId) as CategoryChannel,
      diamondEmoji: guild.emojis.cache.get(buttonQuery.emojiId) ?? null,
      startTimestamp: buttonQuery.startTimestamp,
      endTimestamp: buttonQuery.endTimestamp
    })

    Game.games.set(guild.id, game)
    return game
  }

  static async initGame (guild: Guild, {
    category,
    muteRole,
    diamondEmoji,
    startTimestamp,
    endTimestamp
  }: {
    category: CategoryChannel
    muteRole: Role
    diamondEmoji: Emoji | null
    startTimestamp: Date
    endTimestamp: Date
  }): Promise<Game> {
    const existingGame = await Game.getGame(guild)
    if (existingGame !== null) {
      return existingGame
    }

    const game = new Game(guild, {
      category,
      diamondEmoji,
      startTimestamp,
      endTimestamp
    })
    await game.init(muteRole)

    return game
  }
}

function getStyleFromAntibot (antibot: number): ButtonStyle {
  switch (antibot) {
    case 1:
      return ButtonStyle.Primary
    case 2:
      return ButtonStyle.Secondary
    case 3:
      return ButtonStyle.Success
    default:
      return ButtonStyle.Danger
  }
}
