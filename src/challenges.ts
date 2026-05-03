export type ChallengeTurn = {
  guess: { x: number; y: number } | null
  target: { x: number; y: number; time: number; source: 'wall' | 'obstacle' }
  points: number
  maxPoints: number
}

export type ChallengeEntry = {
  id: string
  initials: string
  playerId?: string
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
  guesses: (ChallengeTurn['guess'])[]
  maxScore: number
  playerId: string
  score: number
  seed: number
  turns: ChallengeTurn[]
}

export type SubmitChallengeScoreInput = {
  guesses: (ChallengeTurn['guess'])[]
  initials: string
  maxScore: number
  playerId: string
  score: number
  seed?: number
  turns: ChallengeTurn[]
}

export class ChallengeApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ChallengeApiError'
    this.status = status
  }
}

export async function createChallenge(input: CreateChallengeInput): Promise<ChallengeRecord> {
  return postApi<ChallengeRecord>('/api/challenges', input)
}

export async function getChallenge(slug: string): Promise<ChallengeRecord> {
  return getApi<ChallengeRecord>(`/api/challenges/${encodeURIComponent(slug)}`)
}

export async function submitChallengeScore(
  slug: string,
  input: SubmitChallengeScoreInput,
): Promise<ChallengeRecord> {
  return postApi<ChallengeRecord>(`/api/challenges/${encodeURIComponent(slug)}/scores`, input)
}

export function getChallengeUrl(slug: string) {
  return `${window.location.origin}/c/${slug}`
}

async function getApi<T>(url: string): Promise<T> {
  const response = await fetchApi(url, {
    headers: { Accept: 'application/json' },
  })

  return readApiResponse<T>(response)
}

async function postApi<T>(url: string, body: unknown): Promise<T> {
  const response = await fetchApi(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return readApiResponse<T>(response)
}

async function fetchApi(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new ChallengeApiError('Challenge service is unavailable. Try again.', 0)
  }
}

async function readApiResponse<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Challenge service is unavailable.'
    throw new ChallengeApiError(message, response.status)
  }

  return body as T
}
