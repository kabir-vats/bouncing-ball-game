export const observeDuration: number
export const defaultRequiredBounces: number
export const boardCollisionInset: number
export const finalLoopDuration: number
export const defaultGeneratorConfig: unknown
export const scene: unknown
export function generateRandomScene(config: unknown, requiredBounces?: number, seed?: number): unknown
export function createRandomSeed(): number
export function simulateTrajectory(gameScene: unknown, duration?: number, dt?: number): unknown
export function getStateAt(samples: unknown[], time: number): unknown
export function getBouncesAfterTime(bounces: unknown[], afterTime: number, count?: number): unknown[]
export function scoreRun(seed: number, guesses: unknown[]): unknown
export function scoreTurn(guess: unknown, target: unknown, timedOut: boolean, pathLength: number): unknown
export function getNormalizedBounceScore(distance: number, pathLength: number, maxPoints: number): number
export function getBounceMaxScore(pathLength: number): number
export function getPredictionMaxScore(results: unknown[]): number
export function getTrajectoryDistance(samples: unknown[], fromTime: number, toTime: number): number
