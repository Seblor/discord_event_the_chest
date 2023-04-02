// Connect to Discord
import { Client, IntentsBitField, OAuth2Scopes, type Interaction } from 'discord.js'
import { onInitInteraction, onResendButtonMessageInteraction, onScoreboardCommand, registerSlashCommand } from './commands'
import { onButtonInteraction, onReadMyScoreInteraction } from './buttons'
import { INTERACTIONS } from './ids'
import Game from './Game'

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
  await Promise.all(guilds.map(async guild => {
    void Game.getGame(await guild.fetch())
  }))
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
      case INTERACTIONS.SLASH_COMMANDS.SCOREBOARD:
        void onScoreboardCommand(interaction)
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

void client.login(process.env.DISCORD_TOKEN)
