import type { ChallengeTurn } from './challenges'

export type RandomScoreRank = {
  id: string
  rank: number
  total: number
  score: number
  maxScore: number
}

export type SubmitRandomScoreInput = {
  guesses: (ChallengeTurn['guess'])[]
  maxScore: number
  playerId: string
  score: number
  seed: number
  turns: ChallengeTurn[]
}

export async function submitRandomScore(input: SubmitRandomScoreInput): Promise<RandomScoreRank> {
  const response = await fetch('/api/random-scores', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error('Failed to connect to server')
  }

  return await response.json() as RandomScoreRank
}
