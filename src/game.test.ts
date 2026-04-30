import { describe, expect, it } from 'vitest'
import {
  defaultGeneratorConfig,
  getBouncesAfterTime,
  generateRandomScene,
  observeDuration,
  scene,
  simulateTrajectory,
} from './game'

const testRequiredBounces = 5

describe('bouncy physics', () => {
  it('finds configurable prediction targets after the observation window', () => {
    const simulation = simulateTrajectory(scene)
    const upcoming = getBouncesAfterTime(simulation.bounces, observeDuration, testRequiredBounces)

    expect(upcoming).toHaveLength(testRequiredBounces)
    expect(upcoming[0].time).toBeGreaterThan(observeDuration)
  })

  it('includes obstacle bounces in the demo round', () => {
    const simulation = simulateTrajectory(scene)
    const upcoming = getBouncesAfterTime(simulation.bounces, observeDuration, testRequiredBounces)

    expect(upcoming.some((bounce) => bounce.source === 'obstacle')).toBe(true)
  })

  it('generates custom random scenes with requested obstacle counts', () => {
    const generated = generateRandomScene(defaultGeneratorConfig, testRequiredBounces, 12345)
    const simulation = simulateTrajectory(generated)
    const upcoming = getBouncesAfterTime(simulation.bounces, observeDuration, testRequiredBounces)

    expect(generated.obstacles).toHaveLength(
      defaultGeneratorConfig.platforms +
        defaultGeneratorConfig.circles +
        defaultGeneratorConfig.triangles +
        defaultGeneratorConfig.blocks,
    )
    expect(upcoming).toHaveLength(testRequiredBounces)
  })

  it('starts generated rounds from the board center', () => {
    const generated = generateRandomScene(defaultGeneratorConfig, testRequiredBounces, 6789)

    expect(generated.start.x).toBe(generated.width / 2)
    expect(generated.start.y).toBe(generated.height / 2)
  })
})
