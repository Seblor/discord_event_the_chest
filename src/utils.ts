/**
 * Returns the time in human readable format
 * @example millisecondsToStr(158000) // returns "2 minutes, 38 secondes"
 * @param milliseconds
 */
export function millisecondsToStr (milliseconds: number): string {
  const roundTowardsZero = milliseconds > 0 ? Math.floor : Math.ceil
  function numberEnding (number: number): string {
    return (number > 1) ? 's' : ''
  }

  let temp = Math.abs(milliseconds)
  const days = roundTowardsZero(temp / 86400000)
  const hours = roundTowardsZero((temp %= 86400000) / 3600000)
  const minutes = roundTowardsZero((temp %= 3600000) / 60000)
  const seconds = roundTowardsZero((temp %= 60000) / 1000)

  return [
    days !== 0 ? `${days} jour${numberEnding(days)}` : '',
    hours !== 0 ? `${hours} heure${numberEnding(hours)}` : '',
    minutes !== 0 ? `${minutes} minute${numberEnding(minutes)}` : '',
    seconds !== 0 ? `${seconds} seconde${numberEnding(seconds)}` : ''
  ].filter(Boolean).join(', ')
}

export function secondsToStr (seconds: number): string {
  if (seconds === 0) {
    return '0 seconde'
  }

  return millisecondsToStr(seconds * 1000)
}

export function formatScore (score: number): string {
  return `${String(score)} diamant${score > 1 ? 's' : ''}`
}

export function rankToString (rank: number): string {
  return rank === 0 || Number.isNaN(rank) ? 'Premier' : rank === 1 ? 'Second' : rank === 2 ? 'Troisième' : `${rank + 1}ème`
}

export function replaceNumbers (score: string, antibot = 0): string {
  return score.replace(/\d/g, number => NUMBERS_MAPPING[number as ('0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9')][antibot])
}

const NUMBERS_MAPPING = {
  0: ['𝟎', '𝟢', '𝟬', '𝟶'],
  1: ['𝟏', '𝟣', '𝟭', '𝟷'],
  2: ['𝟐', '𝟤', '𝟮', '𝟸'],
  3: ['𝟑', '𝟥', '𝟯', '𝟹'],
  4: ['𝟒', '𝟦', '𝟰', '𝟺'],
  5: ['𝟓', '𝟧', '𝟱', '𝟻'],
  6: ['𝟔', '𝟨', '𝟲', '𝟼'],
  7: ['𝟕', '𝟩', '𝟳', '𝟽'],
  8: ['𝟖', '𝟪', '𝟴', '𝟾'],
  9: ['𝟗', '𝟫', '𝟵', '𝟿']
}
