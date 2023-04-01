import { type ButtonInteraction } from 'discord.js'
import prisma from './prisma'
import { formatScore, rankToString } from './utils'
import { playButtonSound } from './voice'

export async function onButtonInteraction (interaction: ButtonInteraction): Promise<void> {
  const member = interaction.member
  if (member === null) {
    console.error('No member found for interaction', interaction.id)
    return
  }
  const fetchedMember = await interaction.guild?.members.fetch(member.user.id)
  if (fetchedMember == null) {
    console.error('Failed to fetch member', member.user.username)
    return
  }
  // If member joined less that 2 days ago
  if (fetchedMember.joinedTimestamp !== null && fetchedMember.joinedTimestamp > Date.now() - 1000 * 60 * 60 * 24 * 2) {
    void interaction.reply({
      content: 'Vous avez rejoint le serveur il y a moins de 2 jours, vous ne pouvez pas encore utiliser le bouton',
      ephemeral: true
    })
    return
  }
  const guild = interaction.guild
  if (guild === null) {
    console.error('No guild found for interaction', interaction.id)
    return
  }

  const result = await prisma.button.findFirst({
    select: {
      seconds: true
    },
    where: {
      guildId: guild.id
    }
  })

  if (result === null) {
    console.error('No button found for guild', guild.id)
    return
  }

  const currentUserScores = await prisma.userScore.findMany({
    select: {
      score: true
    },
    where: {
      guildId: guild.id,
      userId: member.user.id
    }
  })

  const totalUserScore = currentUserScores.reduce((acc, score) => acc + score.score, 0)

  if (currentUserScores.length === (fetchedMember.premiumSince === null ? 3 : 4)) {
    void interaction.reply({
      content: `Vous avez déjà cliqué ${fetchedMember.premiumSince === null ? 3 : 4} fois`,
      ephemeral: true
    })
  } else if (result.seconds <= 2) {
    void interaction.reply({
      content: 'Tu clique à moins de 2 secondes ? On va dire que tu as fait une erreur, retente ta chance !',
      ephemeral: true
    })
  } else {
    await prisma.$transaction([
      prisma.userScore.create({
        data: {
          guildId: guild.id,
          userId: member.user.id,
          score: result.seconds
        }
      }),
      prisma.button.update({
        where: {
          guildId: guild.id
        },
        data: {
          seconds: 0
        }
      })
    ])

    void interaction.reply({
      content: `Votre venez de récupérer ${formatScore(result.seconds)} pour un total de ${formatScore(Number(result.seconds) + totalUserScore)} !`,
      ephemeral: true
    })

    void playButtonSound(guild)
  }
}

export async function onReadMyScoreInteraction (interaction: ButtonInteraction): Promise<void> {
  const member = interaction.member
  if (member === null) {
    console.error('No member found for interaction', interaction.id)
    return
  }
  const fetchedMember = await interaction.guild?.members.fetch(member.user.id)
  if (fetchedMember == null) {
    console.error('Failed to fetch member', member.user.username)
    return
  }
  const guild = interaction.guild
  if (guild === null) {
    console.error('No guild found for interaction', interaction.id)
    return
  }

  const currentUserScores = await prisma.userScore.findMany({
    select: {
      score: true
    },
    where: {
      guildId: guild.id,
      userId: member.user.id
    }
  })

  const totalUserScore: number = currentUserScores.reduce((acc, score) => acc + score.score, 0)

  if (totalUserScore === 0) {
    void interaction.reply({
      content: 'Vous n\'avez pas encore pris de diamants !',
      ephemeral: true
    })
  } else {
    const [userRank, totalPlayers] = await prisma.$transaction([
      // Query all players with a total (sum) score higher than the current player
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) FROM (
          SELECT SUM("score") AS "totalScore" FROM "userScore"
          WHERE "guildId" = ${guild.id}
          GROUP BY "userId"
          HAVING SUM("score") > ${totalUserScore}
        ) AS t
      `,
      prisma.userScore.groupBy({
        where: {
          guildId: guild.id
        },
        by: ['userId'],
        orderBy: {
          userId: 'desc'
        }
      })
    ])

    const rankingString = `Vous avez récupéré un total de ${totalUserScore} diamant${totalUserScore > 1 ? 's' : ''} !
Vous êtes actuellement classé **${rankToString(Number(userRank[0]?.count))}** sur ${totalPlayers.length} joueurs`

    void interaction.reply({
      content: `${rankingString}
Voici vos scores :
1 - ${currentUserScores[0] !== undefined ? formatScore(currentUserScores[0].score) : 'N/A'}
2 - ${currentUserScores[1] !== undefined ? formatScore(currentUserScores[1].score) : 'N/A'}
3 - ${currentUserScores[2] !== undefined ? formatScore(currentUserScores[2].score) : 'N/A'}` +
        (fetchedMember.premiumSince !== null
          ? `
4 - ${currentUserScores[3] !== undefined ? formatScore(currentUserScores[3].score) : 'N/A'}`
          : ''),
      ephemeral: true
    })
  }
}
