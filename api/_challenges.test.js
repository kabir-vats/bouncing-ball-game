import { describe, expect, it, vi } from 'vitest'
import { cleanInitials, validateScorePayload, verifyScorePayload } from './_challenges.js'
import { defaultGeneratorConfig, defaultRequiredBounces, generateRandomScene, observeDuration, simulateTrajectory } from '../shared/game.js'

describe('server score verification', () => {
  it('stores the recomputed score instead of the submitted local score', () => {
    const seed = 12345
    const scene = generateRandomScene(defaultGeneratorConfig, defaultRequiredBounces, seed)
    const simulation = simulateTrajectory(scene, 180)
    const openingBounceIndex = Math.max(0, simulation.bounces.findIndex((bounce) => bounce.time > observeDuration))
    const firstTarget = simulation.bounces[openingBounceIndex + 1]
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const verified = verifyScorePayload(
      {
        initials: 'AAA',
        playerId: 'player-1',
        score: 999999,
        maxScore: 999999,
        guesses: [{ x: firstTarget.x, y: firstTarget.y }],
      },
      seed,
      'test',
    )

    expect(verified.score).toBe(verified.maxScore)
    expect(verified.score).toBeLessThan(999999)
    expect(warn).toHaveBeenCalledWith('Score mismatch', expect.objectContaining({ context: 'test' }))

    warn.mockRestore()
  })

  it('allows 1-3 letters and rejects blocked or non-letter initials', () => {
    expect(cleanInitials('a1-b')).toBe('AB')
    expect(validateScorePayload(basePayload({ initials: 'A' }))?.initials).toBe('A')
    expect(validateScorePayload(basePayload({ initials: 'AB' }))?.initials).toBe('AB')
    expect(validateScorePayload(basePayload({ initials: 'ABC' }))?.initials).toBe('ABC')
    expect(validateScorePayload(basePayload({ initials: '123' }))).toBeNull()
    expect(validateScorePayload(basePayload({ initials: 'SEX' }))).toBeNull()
  })
})

function basePayload(overrides = {}) {
  return {
    initials: 'AAA',
    playerId: 'player-1',
    score: 0,
    maxScore: 0,
    guesses: [],
    ...overrides,
  }
}
