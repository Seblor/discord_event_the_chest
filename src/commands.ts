import { ChannelType, type Client, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, type TextChannel, type CommandInteraction, ButtonStyle, type Emoji, type Role, type CategoryChannel } from 'discord.js'
import { INTERACTIONS } from './ids'
import prisma from './prisma'
import { clearTickCache } from './tick'
import { connectToVoiceChannel } from './voice'

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
      ),
    new SlashCommandBuilder()
      .setName(INTERACTIONS.SLASH_COMMANDS.RESENT_BUTTON_MESSAGE)
      .setDescription('Resends the button message')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  ])
}

export async function onInitInteraction (interaction: CommandInteraction): Promise<void> {
  const categoryChannelId = interaction.options.get('category', true).value as string
  if (categoryChannelId === null) {
    void interaction.reply('No category provided')
    return
  }
  const categoryChannel = await interaction.guild?.channels.fetch(categoryChannelId) as CategoryChannel
  const muteRoleId = interaction.options.get('mute_role', true).value as string
  if (muteRoleId === null) {
    void interaction.reply('No mute role provided')
    return
  }
  const muteRole = await interaction.guild?.roles.fetch(muteRoleId) as Role
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
  const emoji = await interaction.guild?.emojis.fetch(emojiId) as Emoji
  if (emoji == null) {
    void interaction.reply('Emoji not found')
    return
  }

  await categoryChannel.permissionOverwrites.set([
    {
      id: muteRole.id,
      deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads', 'CreatePrivateThreads', 'Speak']
    }
  ])

  void interaction.reply({
    content: 'Creating channels...',
    ephemeral: true
  })

  // Create channels "The Button" and "The Button - Discussion"
  const [buttonChannel, discussionChannel, voiceChannel] = await Promise.all([
    categoryChannel.guild.channels.create({
      name: 'The Button',
      type: ChannelType.GuildText,
      parent: categoryChannel.id,
      position: 1,
      permissionOverwrites: [
        {
          id: categoryChannel.guild.roles.everyone.id,
          deny: ['SendMessages', 'AddReactions', 'CreatePublicThreads', 'CreatePrivateThreads'],
          allow: ['UseApplicationCommands']
        },
        {
          id: interaction.client.user?.id,
          allow: ['SendMessages']
        }
      ]
    }),
    categoryChannel.guild.channels.create({
      name: 'The Button - Discussion',
      type: ChannelType.GuildText,
      parent: categoryChannel.id,
      position: 2
    }),
    categoryChannel.guild.channels.create({
      name: 'The Button - Discussion',
      type: ChannelType.GuildVoice,
      parent: categoryChannel.id,
      position: 3
    })
  ])

  void interaction.editReply({
    content: 'Creating button message...'
  })

  // Create button message
  const buttonMessage = await buttonChannel.send({
    content: 'The Button',
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(INTERACTIONS.BUTTONS.THE_BUTTON)
          .setEmoji(emojiId)
          .setLabel('0 secondes')
          .setDisabled(true)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(INTERACTIONS.BUTTONS.READ_MY_SCORE)
          .setLabel('Voir mes scores')
          .setDisabled(true)
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  })

  await prisma.button.upsert({
    create: {
      guildId: categoryChannel.guild.id,
      categoryId: categoryChannel.id,
      buttonChannelId: buttonChannel.id,
      messageId: buttonMessage.id,
      discussionChannelId: discussionChannel.id,
      voiceChannelId: voiceChannel.id,
      emojiId,
      seconds: 0
    },
    update: {
      guildId: categoryChannel.guild.id,
      categoryId: categoryChannel.id,
      buttonChannelId: buttonChannel.id,
      messageId: buttonMessage.id,
      discussionChannelId: discussionChannel.id,
      voiceChannelId: voiceChannel.id
    },
    where: {
      guildId: categoryChannel.guild.id
    }
  })

  await connectToVoiceChannel(categoryChannel.guild)

  void interaction.editReply({
    content: 'Finished initializing!'
  })
}

export async function onResendButtonMessageInteraction (interaction: CommandInteraction): Promise<void> {
  await resendButtonMessage(interaction.client)
  void interaction.reply({
    content: 'Resent button message',
    ephemeral: true
  })
}

export async function resendButtonMessage (client: Client): Promise<void> {
  await Promise.all(
    client.guilds.cache.map(async guild => {
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
        content: 'The Button',
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(INTERACTIONS.BUTTONS.THE_BUTTON)
              .setLabel('0 secondes')
              .setEmoji(buttonChannelQuery.emojiId)
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(INTERACTIONS.BUTTONS.READ_MY_SCORE)
              .setLabel('Voir mon score')
              .setStyle(ButtonStyle.Secondary)
          )
        ]
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
      clearTickCache(guild)
    })
  )
}
