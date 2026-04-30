export type ChallengeTurn = {
  guess: { x: number; y: number } | null
  target: { x: number; y: number; time: number; source: 'wall' | 'obstacle' }
  points: number
  maxPoints: number
}

export type ChallengeEntry = {
  id: string
  initials: string
  score: number
  maxScore: number
  createdAt: string
}

export type ChallengeRecord = {
  slug: string
  seed: number
  createdAt: string
  creatorInitials: string
  creatorScore: number
  leaderboard: ChallengeEntry[]
}

export type CreateChallengeInput = {
  creatorInitials: string
  maxScore: number
  playerId: string
  score: number
  seed: number
  turns: ChallengeTurn[]
}

export type SubmitChallengeScoreInput = {
  initials: string
  maxScore: number
  playerId: string
  score: number
  turns: ChallengeTurn[]
}

const challengeStorageKey = 'bounce-call.local-challenges'

export async function createChallenge(input: CreateChallengeInput): Promise<ChallengeRecord> {
  const response = await postApi<ChallengeRecord>('/api/challenges', input)
  if (response) {
    return response
  }

  return createLocalChallenge(input)
}

export async function getChallenge(slug: string): Promise<ChallengeRecord> {
  const response = await getApi<ChallengeRecord>(`/api/challenges/${encodeURIComponent(slug)}`)
  if (response) {
    return response
  }

  const challenge = readLocalChallenges()[slug]
  if (!challenge) {
    throw new Error('Challenge not found.')
  }

  return challenge
}

export async function submitChallengeScore(
  slug: string,
  input: SubmitChallengeScoreInput,
): Promise<ChallengeRecord> {
  const response = await postApi<ChallengeRecord>(`/api/challenges/${encodeURIComponent(slug)}/scores`, input)
  if (response) {
    return response
  }

  return submitLocalChallengeScore(slug, input)
}

export function getChallengeUrl(slug: string) {
  return `${window.location.origin}/c/${slug}`
}

function createLocalChallenge(input: CreateChallengeInput) {
  const slug = createSlug()
  const now = new Date().toISOString()
  const challenge: ChallengeRecord = {
    slug,
    seed: input.seed,
    createdAt: now,
    creatorInitials: input.creatorInitials,
    creatorScore: input.score,
    leaderboard: [
      {
        id: createEntryId(input.playerId),
        initials: input.creatorInitials,
        score: input.score,
        maxScore: input.maxScore,
        createdAt: now,
      },
    ],
  }

  const challenges = readLocalChallenges()
  challenges[slug] = challenge
  writeLocalChallenges(challenges)
  return challenge
}

function submitLocalChallengeScore(slug: string, input: SubmitChallengeScoreInput) {
  const challenges = readLocalChallenges()
  const challenge = challenges[slug]
  if (!challenge) {
    throw new Error('Challenge not found.')
  }

  const entryId = createEntryId(input.playerId)
  if (challenge.leaderboard.some((entry) => entry.id === entryId)) {
    return challenge
  }

  challenge.leaderboard = [
    ...challenge.leaderboard,
    {
      id: entryId,
      initials: input.initials,
      score: input.score,
      maxScore: input.maxScore,
      createdAt: new Date().toISOString(),
    },
  ].sort(compareEntries)

  challenges[slug] = challenge
  writeLocalChallenges(challenges)
  return challenge
}

async function getApi<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      return null
    }

    return await response.json() as T
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

    if (!response.ok) {
      return null
    }

    return await response.json() as T
  } catch {
    return null
  }
}

function readLocalChallenges() {
  try {
    const stored = window.localStorage.getItem(challengeStorageKey)
    return stored ? JSON.parse(stored) as Record<string, ChallengeRecord> : {}
  } catch {
    return {}
  }
}

function writeLocalChallenges(challenges: Record<string, ChallengeRecord>) {
  try {
    window.localStorage.setItem(challengeStorageKey, JSON.stringify(challenges))
  } catch {
    // Local fallback is best-effort; production should use the API database.
  }
}

function createSlug() {
  const bytes = crypto.getRandomValues(new Uint8Array(5))
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 8)
}

function createEntryId(playerId: string) {
  return `player:${playerId}`
}

function compareEntries(first: ChallengeEntry, second: ChallengeEntry) {
  if (second.score !== first.score) {
    return second.score - first.score
  }

  return first.createdAt.localeCompare(second.createdAt)
}
