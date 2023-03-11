// Connect to Discord
import { Client, IntentsBitField, OAuth2Scopes, type Interaction } from 'discord.js'
import { onInitInteraction, onResendButtonMessageInteraction, registerSlashCommand } from './commands'
import { onButtonInteraction, onReadMyScoreInteraction } from './buttons'
import { startTicks } from './tick'
import { connectToVoiceChannel } from './voice'
import { INTERACTIONS } from './ids'

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildIntegrations,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildVoiceStates
  ]
})

// client
//   .on('error', console.log)
//   .on('debug', console.log)
//   .on('warn', console.log)

client.on('ready', async () => {
  const guilds = await client.guilds.fetch()
  // fetch all channel
  console.log('Fetching channels...')
  await Promise.all(guilds.map(async guild => { await (await guild.fetch()).channels.fetch() }))
  // fetch all members
  console.log('Fetching members...')
  await Promise.all(guilds.map(async guild => { await (await guild.fetch()).members.fetch() }))

  console.log('Bot is ready!')
  console.log(client.generateInvite({
    scopes: [
      OAuth2Scopes.Bot
    ],
    permissions: [
      'ReadMessageHistory',
      'SendMessages',
      'ManageChannels',
      'ManageRoles',
      'UseApplicationCommands',
      'ViewChannel'
    ]
  }))
  registerSlashCommand(client)
  await Promise.all(guilds.map(async guild => { await connectToVoiceChannel(await guild.fetch()) }))

  // setInterval(() => {
  //   void tick(client)
  // }, 2e3)

  const startTime = process.env.START_TIMESTAMP
  if (startTime != null) {
    const start = new Date(parseInt(startTime))
    const now = new Date()
    const diff = start.getTime() - now.getTime()
    console.log(`Starting in ${diff}ms`)

    setTimeout(() => {
      void startTicks(client)
    }, diff)
  }
})

client.on('interactionCreate', (interaction: Interaction) => {
  if (interaction.isCommand()) {
    switch (interaction.commandName) {
      case INTERACTIONS.SLASH_COMMANDS.INIT:
        void onInitInteraction(interaction)
        break
      case INTERACTIONS.SLASH_COMMANDS.RESENT_BUTTON_MESSAGE:
        void onResendButtonMessageInteraction(interaction)
        break

      default:
        break
    }
  } else if (interaction.isButton()) {
    switch (interaction.customId) {
      case INTERACTIONS.BUTTONS.THE_BUTTON:
        void onButtonInteraction(interaction)
        break
      case INTERACTIONS.BUTTONS.READ_MY_SCORE:
        void onReadMyScoreInteraction(interaction)
        break

      default:
        break
    }
  }
})

// Path: src/app.ts
// Login to Discord with your client's token
void client.login(process.env.DISCORD_TOKEN)
