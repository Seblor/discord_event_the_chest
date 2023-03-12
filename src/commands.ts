import { ChannelType, type Client, SlashCommandBuilder, PermissionFlagsBits, type CommandInteraction, type Emoji, type Role, type CategoryChannel } from 'discord.js'
import Game from './Game'
import { INTERACTIONS } from './ids'

export function registerSlashCommand (client: Client): void {
  void client.application?.commands.set([
    new SlashCommandBuilder()
      .setName(INTERACTIONS.SLASH_COMMANDS.INIT)
      .setDescription('Initialize the event')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addChannelOption(option =>
        option
          .addChannelTypes(ChannelType.GuildCategory)
          .setName('category')
          .setDescription('Category to create the event in')
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName('mute_role')
          .setDescription('Role used to mute people (for channel permissions)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('diamond_emoji')
          .setDescription('The diamond emoji to use in the button message')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('start_timestamp')
          .setDescription('The start timestamp of the event')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('end_timestamp')
          .setDescription('The end timestamp of the event')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName(INTERACTIONS.SLASH_COMMANDS.RESENT_BUTTON_MESSAGE)
      .setDescription('Resends the button message')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
      .setName(INTERACTIONS.SLASH_COMMANDS.SCOREBOARD)
      .setDescription('Affiche le tableau des scores')
      .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  ])
}

export async function onInitInteraction (interaction: CommandInteraction): Promise<void> {
  if (interaction.guild == null) {
    void interaction.reply('This command can only be used in a guild')
    return
  }
  const categoryChannelId = interaction.options.get('category', true).value as string
  if (categoryChannelId === null) {
    void interaction.reply('No category provided')
    return
  }
  const categoryChannel = await interaction.guild.channels.fetch(categoryChannelId) as CategoryChannel
  const muteRoleId = interaction.options.get('mute_role', true).value as string
  if (muteRoleId === null) {
    void interaction.reply('No mute role provided')
    return
  }
  const muteRole = await interaction.guild.roles.fetch(muteRoleId) as Role
  if (muteRole == null) {
    void interaction.reply('Mute role not found')
    return
  }
  if ((await categoryChannel.fetch()).children.cache.size > 0) {
    void interaction.reply('Category is not empty')
    return
  }
  const emojiString = interaction.options.get('diamond_emoji', true).value as string
  if (emojiString === null) {
    void interaction.reply('No mute role provided')
    return
  }
  const emojiId = emojiString.match(/:(\d+)/)?.[1]
  if (emojiId == null) {
    void interaction.reply('Emoji not valid')
    return
  }
  const emoji = await interaction.guild.emojis.fetch(emojiId) as Emoji
  if (emoji == null) {
    void interaction.reply('Emoji not found')
    return
  }

  void interaction.reply({
    content: 'Initializing...',
    ephemeral: true
  })

  await Game.initGame(interaction.guild, {
    category: categoryChannel,
    muteRole,
    diamondEmoji: emoji,
    startTimestamp: new Date(interaction.options.get('start_timestamp', true).value as number),
    endTimestamp: new Date(interaction.options.get('end_timestamp', true).value as number)
  })

  void interaction.editReply({
    content: 'Finished initializing!'
  })
}

export async function onResendButtonMessageInteraction (interaction: CommandInteraction): Promise<void> {
  if (interaction.guild == null) {
    void interaction.reply('This command can only be used in a guild')
    return
  }
  const game = await Game.getGame(interaction.guild)
  void game?.resendButtonMessage()
}

const scoreboardLastCalls = new Map<string, number>()

export async function onScoreboardCommand (interaction: CommandInteraction): Promise<void> {
  if (interaction.guild == null) {
    void interaction.reply('This command can only be used in a guild')
    return
  }

  // Check if the command has been called recently
  if (scoreboardLastCalls.has(interaction.guild.id)) {
    const lastCall = scoreboardLastCalls.get(interaction.guild.id)
    if (lastCall != null && Date.now() - lastCall < 60e3) {
      void interaction.reply('Merci d\'attendre 1 minute avant de réutiliser cette commande')
      return
    }
  }
  scoreboardLastCalls.set(interaction.guild.id, Date.now())

  // Get game and send scoreboard as text file
  const game = await Game.getGame(interaction.guild)
  if (game == null) {
    void interaction.reply('La commande n\'a pas fonctionée, merci de réessayer un peu plus tard')
    return
  }
  const scoreboardAttachment = await game.generateFullScoreboardAsAttachment()
  void interaction.reply({
    content: 'Voici le tableau des scores :',
    files: [scoreboardAttachment]
  })
}
