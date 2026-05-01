import {
  boardCollisionInset as sharedBoardCollisionInset,
  createRandomSeed as sharedCreateRandomSeed,
  defaultGeneratorConfig as sharedDefaultGeneratorConfig,
  defaultRequiredBounces as sharedDefaultRequiredBounces,
  finalLoopDuration as sharedFinalLoopDuration,
  generateRandomScene as sharedGenerateRandomScene,
  getBounceMaxScore as sharedGetBounceMaxScore,
  getBouncesAfterTime as sharedGetBouncesAfterTime,
  getNormalizedBounceScore as sharedGetNormalizedBounceScore,
  getPredictionMaxScore as sharedGetPredictionMaxScore,
  getStateAt as sharedGetStateAt,
  getTrajectoryDistance as sharedGetTrajectoryDistance,
  observeDuration as sharedObserveDuration,
  scene as sharedScene,
  scoreRun as sharedScoreRun,
  scoreTurn as sharedScoreTurn,
  simulateTrajectory as sharedSimulateTrajectory,
} from '../shared/game.js'

export type Point = {
  x: number
  y: number
}

export type BallState = Point & {
  vx: number
  vy: number
}

export type CircleObstacle = {
  kind: 'circle'
  x: number
  y: number
  radius: number
}

export type PolygonObstacle = {
  kind: 'platform' | 'triangle' | 'block'
  cornerRadius: number
  collisionPoints: Point[]
  points: Point[]
}

export type Obstacle = CircleObstacle | PolygonObstacle

export type Bounce = Point & {
  time: number
  source: 'wall' | 'obstacle'
}

export type TrajectorySample = BallState & {
  time: number
}

export type GameScene = {
  width: number
  height: number
  ballRadius: number
  start: BallState
  obstacles: Obstacle[]
}

export type Simulation = {
  samples: TrajectorySample[]
  bounces: Bounce[]
}

export type GeneratorConfig = {
  platforms: number
  platformSize: number
  circles: number
  circleSize: number
  triangles: number
  triangleSize: number
  blocks: number
  blockSize: number
  speed: number
}

export type RunGuess = Point | null

export type ScoredTurn = {
  guess: Point | null
  target: Bounce
  distance: number
  pathLength: number
  maxPoints: number
  points: number
  timedOut: boolean
}

export type SerializedTurn = {
  guess: Point | null
  target: Bounce
  points: number
  maxPoints: number
}

export type ScoreRunResult = {
  seed: number
  score: number
  maxScore: number
  turns: SerializedTurn[]
}

export const observeDuration: number = sharedObserveDuration
export const defaultRequiredBounces: number = sharedDefaultRequiredBounces
export const boardCollisionInset: number = sharedBoardCollisionInset
export const finalLoopDuration: number = sharedFinalLoopDuration
export const defaultGeneratorConfig: GeneratorConfig = sharedDefaultGeneratorConfig as GeneratorConfig
export const scene: GameScene = sharedScene as GameScene

export const generateRandomScene = sharedGenerateRandomScene as (
  config: GeneratorConfig,
  requiredBounces?: number,
  seed?: number,
) => GameScene
export const createRandomSeed = sharedCreateRandomSeed as () => number
export const simulateTrajectory = sharedSimulateTrajectory as (
  gameScene: GameScene,
  duration?: number,
  dt?: number,
) => Simulation
export const getStateAt = sharedGetStateAt as (samples: TrajectorySample[], time: number) => TrajectorySample
export const getBouncesAfterTime = sharedGetBouncesAfterTime as (
  bounces: Bounce[],
  afterTime: number,
  count?: number,
) => Bounce[]
export const scoreRun = sharedScoreRun as (seed: number, guesses: RunGuess[]) => ScoreRunResult
export const scoreTurn = sharedScoreTurn as (
  guess: Point | null,
  target: Bounce,
  timedOut: boolean,
  pathLength: number,
) => ScoredTurn
export const getNormalizedBounceScore = sharedGetNormalizedBounceScore as (
  distance: number,
  pathLength: number,
  maxPoints: number,
) => number
export const getBounceMaxScore = sharedGetBounceMaxScore as (pathLength: number) => number
export const getPredictionMaxScore = sharedGetPredictionMaxScore as (results: ScoredTurn[]) => number
export const getTrajectoryDistance = sharedGetTrajectoryDistance as (
  samples: TrajectorySample[],
  fromTime: number,
  toTime: number,
) => number
