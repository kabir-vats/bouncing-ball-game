import type { ChallengeEntry, ChallengeTurn, ScoreRank, SubmitChallengeScoreInput } from './challenges'

export type DailyRecord = {
  date: string
  seed: number
  leaderboard: ChallengeEntry[]
  playerRank?: ScoreRank | null
}

export type SubmitDailyScoreInput = SubmitChallengeScoreInput

const dailyStorageKey = 'bounce-call.local-dailies'
const dailyTimeZone = 'America/Los_Angeles'

export async function getDaily(date = getDailyDateKey()): Promise<DailyRecord> {
  const response = await getApi<DailyRecord>(`/api/dailies/${encodeURIComponent(date)}`)
  if (response) {
    return response
  }

  return readLocalDailies()[date] ?? createLocalDaily(date)
}

export async function submitDailyScore(date: string, input: SubmitDailyScoreInput): Promise<DailyRecord> {
  const response = await postApi<DailyRecord>(`/api/dailies/${encodeURIComponent(date)}/scores`, input)
  if (response) {
    return response
  }

  return submitLocalDailyScore(date, input)
}

export function getDailyDateKey(date = new Date()) {
  return getDateKeyInTimeZone(date, dailyTimeZone)
}

export function getDailyUrl(date: string) {
  return `${window.location.origin}/d/${date}`
}

function createLocalDaily(date: string) {
  const daily: DailyRecord = {
    date,
    seed: createDailySeed(date),
    leaderboard: [],
  }
  const dailies = readLocalDailies()
  dailies[date] = daily
  writeLocalDailies(dailies)
  return daily
}

function submitLocalDailyScore(date: string, input: SubmitDailyScoreInput) {
  const dailies = readLocalDailies()
  const daily = dailies[date] ?? createLocalDaily(date)
  const entryId = `player:${input.playerId}`

  if (daily.leaderboard.some((entry) => entry.id === entryId)) {
    return daily
  }

  daily.leaderboard = [
    ...daily.leaderboard,
    {
      id: entryId,
      initials: input.initials,
      playerId: input.playerId,
      score: input.score,
      maxScore: input.maxScore,
      createdAt: new Date().toISOString(),
    },
  ].sort(compareEntries)

  dailies[date] = daily
  writeLocalDailies(dailies)
  return daily
}

async function getApi<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    return response.ok ? await response.json() as T : null
  } catch {
    return null
  }
}

async function postApi<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    return response.ok ? await response.json() as T : null
  } catch {
    return null
  }
}

function readLocalDailies() {
  try {
    const stored = window.localStorage.getItem(dailyStorageKey)
    return stored ? JSON.parse(stored) as Record<string, DailyRecord> : {}
  } catch {
    return {}
  }
}

function writeLocalDailies(dailies: Record<string, DailyRecord>) {
  try {
    window.localStorage.setItem(dailyStorageKey, JSON.stringify(dailies))
  } catch {
    // Development fallback only.
  }
}

function createDailySeed(date: string) {
  let hash = 2166136261
  for (let index = 0; index < date.length; index += 1) {
    hash ^= date.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function compareEntries(first: ChallengeEntry, second: ChallengeEntry) {
  if (second.score !== first.score) {
    return second.score - first.score
  }

  return first.createdAt.localeCompare(second.createdAt)
}

export function serializeDailyTurns(turns: ChallengeTurn[]) {
  return turns
}
