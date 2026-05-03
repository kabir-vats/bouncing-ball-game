import { supabase } from './_supabase.js'
import { fetchPlayerScoreRank } from './_challenges.js'

const dailyTimeZone = 'America/Los_Angeles'

export function cleanDate(value) {
  const date = String(value ?? '')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getTodayKey()
}

export function getTodayKey() {
  return getDateKeyInTimeZone(new Date(), dailyTimeZone)
}

export function createDailySeed(date) {
  let hash = 2166136261
  for (let index = 0; index < date.length; index += 1) {
    hash ^= date.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export async function ensureDaily(date) {
  const clean = cleanDate(date)
  const existing = await supabase(`daily_boards?date=eq.${encodeURIComponent(clean)}&select=date,seed`)
  if (existing[0]) {
    return existing[0]
  }

  const seed = createDailySeed(clean)
  await supabase('daily_boards', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { date: clean, seed },
  })

  return { date: clean, seed }
}

export async function fetchDaily(date, playerId = '') {
  const daily = await ensureDaily(date)
  const scores = await supabase(
    `daily_scores?daily_date=eq.${encodeURIComponent(daily.date)}&select=id,player_id,initials,score,max_score,created_at&order=score.desc,created_at.asc&limit=100`,
  )

  return {
    date: daily.date,
    seed: daily.seed,
    leaderboard: scores.map((score) => ({
      id: score.id,
      initials: score.initials,
      playerId: score.player_id,
      score: score.score,
      maxScore: score.max_score,
      createdAt: score.created_at,
    })),
    playerRank: await fetchPlayerScoreRank('daily_scores', 'daily_date', daily.date, playerId),
  }
}

function getDateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
