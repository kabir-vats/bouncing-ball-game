import { describe, expect, it } from 'vitest'
import {
  defaultPredictionCount,
  defaultGeneratorConfig,
  generateRandomScene,
  getTotalScore,
  getUpcomingBounces,
  observeDuration,
  scene,
  simulateTrajectory,
} from './game'

describe('bouncy physics', () => {
  it('finds configurable prediction targets after the observation window', () => {
    const simulation = simulateTrajectory(scene)
    const upcoming = getUpcomingBounces(simulation.bounces, observeDuration, defaultPredictionCount)

    expect(upcoming).toHaveLength(defaultPredictionCount)
    expect(upcoming[0].time).toBeGreaterThan(observeDuration)
  })

  it('includes obstacle bounces in the demo round', () => {
    const simulation = simulateTrajectory(scene)
    const upcoming = getUpcomingBounces(simulation.bounces, observeDuration, defaultPredictionCount)

    expect(upcoming.some((bounce) => bounce.source === 'obstacle')).toBe(true)
  })

  it('generates custom random scenes with requested obstacle counts', () => {
    const generated = generateRandomScene(defaultGeneratorConfig, defaultPredictionCount, 12345)
    const simulation = simulateTrajectory(generated)
    const upcoming = getUpcomingBounces(simulation.bounces, observeDuration, defaultPredictionCount)

    expect(generated.obstacles).toHaveLength(
      defaultGeneratorConfig.platforms +
        defaultGeneratorConfig.circles +
        defaultGeneratorConfig.triangles +
        defaultGeneratorConfig.blocks,
    )
    expect(upcoming).toHaveLength(defaultPredictionCount)
  })

  it('starts generated rounds from the board center', () => {
    const generated = generateRandomScene(defaultGeneratorConfig, defaultPredictionCount, 6789)

    expect(generated.start.x).toBe(generated.width / 2)
    expect(generated.start.y).toBe(generated.height / 2)
  })

  it('awards a perfect score for exact bounce guesses', () => {
    const simulation = simulateTrajectory(scene)
    const targets = getUpcomingBounces(simulation.bounces, observeDuration, defaultPredictionCount)

    expect(getTotalScore(targets, targets)).toBe(defaultPredictionCount * 100)
  })
})
