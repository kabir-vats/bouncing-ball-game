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

type ObstacleBounds = {
  x: number
  y: number
  radius: number
}

export const observeDuration = 1.15
export const defaultRequiredBounces = 18
export const boardCollisionInset = 1.5

export const defaultGeneratorConfig: GeneratorConfig = {
  platforms: 7,
  platformSize: 140,
  circles: 3,
  circleSize: 30,
  triangles: 3,
  triangleSize: 64,
  blocks: 2,
  blockSize: 46,
  speed: 385,
}

export const scene: GameScene = {
  width: 960,
  height: 600,
  ballRadius: 12,
  start: {
    x: 480,
    y: 300,
    vx: 350,
    vy: -128,
  },
  obstacles: [
    makePlatform(552, 336, 176, -90),
    makePlatform(467, 115, 190, 0),
    makePlatform(247, 384, 160, -90),
    makePlatform(700, 185, 138, -90),
    makePlatform(783, 441, 158, 0),
    makePlatform(425, 474, 112, -90),
    makePlatform(224, 157, 136, 0),
    makeCircle(796, 298, 30),
    makeCircle(470, 232, 26),
    makeTriangle(642, 318, 68, 24),
    makeBlock(344, 404, 48, 28),
  ],
}

const restitution = 1
const sampleRate = 1 / 180
const minimumBounceGap = 0.025
const minimumBounceDistance = 12
const boardMargin = 44
const obstaclePadding = 18

export function generateRandomScene(
  config: GeneratorConfig,
  requiredBounces = defaultRequiredBounces,
  seed = crypto.getRandomValues(new Uint32Array(1))[0],
): GameScene {
  const random = createRandom(seed)
  let fallback = scene

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const candidate = buildRandomScene(config, random)
    const simulation = simulateTrajectory(candidate)
    const upcoming = getBouncesAfterTime(simulation.bounces, observeDuration, requiredBounces)
    const obstacleBounces = upcoming.filter((bounce) => bounce.source === 'obstacle').length

    fallback = candidate

    if (upcoming.length >= requiredBounces && obstacleBounces >= Math.min(2, requiredBounces)) {
      return candidate
    }
  }

  return fallback
}

export function simulateTrajectory(gameScene: GameScene, duration = 10, dt = sampleRate): Simulation {
  const ball = { ...gameScene.start }
  const samples: TrajectorySample[] = [{ ...ball, time: 0 }]
  const bounces: Bounce[] = []
  let lastBounceAt = -Infinity
  let lastBouncePoint: Point | null = null

  for (let time = dt; time <= duration + Number.EPSILON; time += dt) {
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt

    const wallBounce = resolveWallCollision(ball, gameScene)
    let obstacleBounce = false

    for (const obstacle of gameScene.obstacles) {
      const bounced =
        obstacle.kind === 'circle'
          ? resolveCircleCollision(ball, obstacle, gameScene.ballRadius)
          : resolvePolygonCollision(ball, obstacle, gameScene.ballRadius)

      obstacleBounce ||= bounced
    }

    if (wallBounce || obstacleBounce) {
      const bouncePoint = {
        x: ball.x,
        y: ball.y,
      }
      const farEnough = !lastBouncePoint || getDistance(bouncePoint, lastBouncePoint) > minimumBounceDistance
      const longEnough = time - lastBounceAt > minimumBounceGap
      const source = wallBounce ? 'wall' : 'obstacle'

      if (longEnough || farEnough || wallBounce) {
        bounces.push({
          ...bouncePoint,
          time,
          source,
        })
        lastBounceAt = time
        lastBouncePoint = bouncePoint
      }
    }

    samples.push({ ...ball, time })
  }

  return { samples, bounces }
}

export function getStateAt(samples: TrajectorySample[], time: number): TrajectorySample {
  if (time <= samples[0].time) {
    return samples[0]
  }

  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index]
    if (current.time >= time) {
      const previous = samples[index - 1]
      const progress = (time - previous.time) / (current.time - previous.time)

      return {
        time,
        x: interpolate(previous.x, current.x, progress),
        y: interpolate(previous.y, current.y, progress),
        vx: interpolate(previous.vx, current.vx, progress),
        vy: interpolate(previous.vy, current.vy, progress),
      }
    }
  }

  return samples[samples.length - 1]
}

export function getBouncesAfterTime(bounces: Bounce[], afterTime: number, count = defaultRequiredBounces) {
  return bounces.filter((bounce) => bounce.time > afterTime).slice(0, count)
}

function buildRandomScene(config: GeneratorConfig, random: () => number): GameScene {
  const width = scene.width
  const height = scene.height
  const obstacles: Obstacle[] = []
  const bounds: ObstacleBounds[] = []
  const start = makeCenterStart(width, height, config.speed, random)
  const startBounds = {
    x: start.x,
    y: start.y,
    radius: scene.ballRadius + 54,
  }

  addObstacles(config.platforms, () => {
    const length = randomAround(config.platformSize, 0.42, random)
    return makePlatform(
      randomRange(boardMargin, width - boardMargin, random),
      randomRange(boardMargin, height - boardMargin, random),
      length,
      randomRange(0, 180, random),
    )
  })

  addObstacles(config.circles, () =>
    makeCircle(
      randomRange(boardMargin, width - boardMargin, random),
      randomRange(boardMargin, height - boardMargin, random),
      randomAround(config.circleSize, 0.35, random),
    ),
  )

  addObstacles(config.triangles, () =>
    makeTriangle(
      randomRange(boardMargin, width - boardMargin, random),
      randomRange(boardMargin, height - boardMargin, random),
      randomAround(config.triangleSize, 0.35, random),
      randomRange(0, 360, random),
    ),
  )

  addObstacles(config.blocks, () =>
    makeBlock(
      randomRange(boardMargin, width - boardMargin, random),
      randomRange(boardMargin, height - boardMargin, random),
      randomAround(config.blockSize, 0.35, random),
      randomRange(0, 360, random),
    ),
  )

  return {
    width,
    height,
    ballRadius: scene.ballRadius,
    start,
    obstacles,
  }

  function addObstacles(count: number, createObstacle: () => Obstacle) {
    for (let index = 0; index < count; index += 1) {
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const obstacle = createObstacle()
        const obstacleBounds = getObstacleBounds(obstacle)

        if (
          !isInsideBoard(obstacleBounds, width, height) ||
          boundsOverlap(obstacleBounds, startBounds) ||
          bounds.some((bound) => boundsOverlap(bound, obstacleBounds))
        ) {
          continue
        }

        obstacles.push(obstacle)
        bounds.push(obstacleBounds)
        break
      }
    }
  }
}

function makeCenterStart(width: number, height: number, speed: number, random: () => number): BallState {
  const angle = randomRange(0, Math.PI * 2, random)

  return {
    x: width / 2,
    y: height / 2,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  }
}

function makeCircle(x: number, y: number, radius: number): CircleObstacle {
  return {
    kind: 'circle',
    x,
    y,
    radius: Math.max(12, radius),
  }
}

function makePlatform(x: number, y: number, length: number, angleDegrees: number): PolygonObstacle {
  const width = Math.max(32, length)
  const height = 16
  const points = makeRotatedRectangle(x, y, width, height, angleDegrees)
  const cornerRadius = height / 2

  return {
    kind: 'platform',
    cornerRadius,
    collisionPoints: getRoundedPolygonPoints(points, cornerRadius, 5),
    points,
  }
}

function makeBlock(x: number, y: number, size: number, angleDegrees: number): PolygonObstacle {
  const width = Math.max(22, size)
  const points = makeRotatedRectangle(x, y, width, width * randomBlockAspect(angleDegrees), angleDegrees)
  const cornerRadius = Math.min(14, width * 0.22)

  return {
    kind: 'block',
    cornerRadius,
    collisionPoints: getRoundedPolygonPoints(points, cornerRadius, 5),
    points,
  }
}

function makeTriangle(x: number, y: number, size: number, angleDegrees: number): PolygonObstacle {
  const radius = Math.max(24, size)
  const angle = degreesToRadians(angleDegrees)
  const points = [0, 1, 2].map((index) => ({
    x: x + Math.cos(angle + index * ((Math.PI * 2) / 3)) * radius,
    y: y + Math.sin(angle + index * ((Math.PI * 2) / 3)) * radius,
  }))
  const cornerRadius = Math.min(18, radius * 0.18)

  return {
    kind: 'triangle',
    cornerRadius,
    collisionPoints: getRoundedPolygonPoints(points, cornerRadius, 7),
    points,
  }
}

function makeRotatedRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  angleDegrees: number,
): Point[] {
  const angle = degreesToRadians(angleDegrees)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const halfWidth = width / 2
  const halfHeight = height / 2

  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => ({
    x: x + point.x * cos - point.y * sin,
    y: y + point.x * sin + point.y * cos,
  }))
}

function getRoundedPolygonPoints(points: Point[], radius: number, curveSegments: number) {
  if (points.length < 3 || radius <= 0) {
    return points
  }

  const roundedPoints: Point[] = []

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index + points.length - 1) % points.length]
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const previousLength = getDistance(current, previous)
    const nextLength = getDistance(current, next)
    const trim = Math.min(radius, previousLength * 0.5, nextLength * 0.5)
    const start = getPointToward(current, previous, trim)
    const end = getPointToward(current, next, trim)

    roundedPoints.push(start)
    for (let segment = 1; segment <= curveSegments; segment += 1) {
      const progress = segment / curveSegments
      roundedPoints.push(getQuadraticPoint(start, current, end, progress))
    }
  }

  return roundedPoints
}

function getPointToward(from: Point, to: Point, distance: number) {
  const totalDistance = getDistance(from, to)

  if (totalDistance === 0) {
    return from
  }

  const progress = distance / totalDistance
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  }
}

function getQuadraticPoint(start: Point, control: Point, end: Point, progress: number) {
  const inverse = 1 - progress

  return {
    x: inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x,
    y: inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y,
  }
}

function resolveWallCollision(ball: BallState, gameScene: GameScene) {
  let bounced = false
  const radius = gameScene.ballRadius + boardCollisionInset

  if (ball.x < radius) {
    ball.x = radius
    ball.vx = Math.abs(ball.vx) * restitution
    bounced = true
  } else if (ball.x > gameScene.width - radius) {
    ball.x = gameScene.width - radius
    ball.vx = -Math.abs(ball.vx) * restitution
    bounced = true
  }

  if (ball.y < radius) {
    ball.y = radius
    ball.vy = Math.abs(ball.vy) * restitution
    bounced = true
  } else if (ball.y > gameScene.height - radius) {
    ball.y = gameScene.height - radius
    ball.vy = -Math.abs(ball.vy) * restitution
    bounced = true
  }

  return bounced
}

function resolveCircleCollision(ball: BallState, circle: CircleObstacle, radius: number) {
  const dx = ball.x - circle.x
  const dy = ball.y - circle.y
  const distance = Math.hypot(dx, dy)
  const minimumDistance = radius + circle.radius

  if (distance >= minimumDistance || distance === 0) {
    return false
  }

  const nx = dx / distance
  const ny = dy / distance
  const velocityAlongNormal = ball.vx * nx + ball.vy * ny

  if (velocityAlongNormal >= 0) {
    return false
  }

  ball.x = circle.x + nx * minimumDistance
  ball.y = circle.y + ny * minimumDistance
  ball.vx -= 2 * velocityAlongNormal * nx * restitution
  ball.vy -= 2 * velocityAlongNormal * ny * restitution

  return true
}

function resolvePolygonCollision(ball: BallState, obstacle: PolygonObstacle, radius: number) {
  const polygon = obstacle.collisionPoints
  const closest = getClosestPolygonPoint(ball, polygon)
  const inside = isPointInPolygon(ball, polygon)

  if (!inside && closest.distance > radius) {
    return false
  }

  const centroid = getCentroid(polygon)
  let nx = ball.x - closest.point.x
  let ny = ball.y - closest.point.y
  let normalLength = Math.hypot(nx, ny)

  if (inside || normalLength === 0) {
    nx = ball.x - centroid.x
    ny = ball.y - centroid.y
    normalLength = Math.hypot(nx, ny) || 1
  }

  nx /= normalLength
  ny /= normalLength

  const velocityAlongNormal = ball.vx * nx + ball.vy * ny
  if (velocityAlongNormal >= 0) {
    return false
  }

  const pushOut = inside ? radius + 2 : radius - closest.distance + 1
  ball.x += nx * pushOut
  ball.y += ny * pushOut
  ball.vx -= 2 * velocityAlongNormal * nx * restitution
  ball.vy -= 2 * velocityAlongNormal * ny * restitution

  return true
}

function getClosestPolygonPoint(point: Point, polygon: Point[]) {
  let closestPoint = polygon[0]
  let closestDistance = Infinity

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const candidate = getClosestPointOnSegment(point, start, end)
    const distance = getDistance(point, candidate)

    if (distance < closestDistance) {
      closestDistance = distance
      closestPoint = candidate
    }
  }

  return {
    point: closestPoint,
    distance: closestDistance,
  }
}

function getClosestPointOnSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const progress = lengthSquared === 0 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)

  return {
    x: start.x + dx * progress,
    y: start.y + dy * progress,
  }
}

function isPointInPolygon(point: Point, polygon: Point[]) {
  let inside = false

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function getCentroid(points: Point[]) {
  return points.reduce(
    (total, point) => ({
      x: total.x + point.x / points.length,
      y: total.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  )
}

function getObstacleBounds(obstacle: Obstacle): ObstacleBounds {
  if (obstacle.kind === 'circle') {
    return {
      x: obstacle.x,
      y: obstacle.y,
      radius: obstacle.radius,
    }
  }

  const center = getCentroid(obstacle.points)
  const radius = Math.max(...obstacle.points.map((point) => getDistance(point, center)))

  return {
    ...center,
    radius,
  }
}

function isInsideBoard(bounds: ObstacleBounds, width: number, height: number) {
  return (
    bounds.x - bounds.radius > boardMargin / 2 &&
    bounds.x + bounds.radius < width - boardMargin / 2 &&
    bounds.y - bounds.radius > boardMargin / 2 &&
    bounds.y + bounds.radius < height - boardMargin / 2
  )
}

function boundsOverlap(first: ObstacleBounds, second: ObstacleBounds) {
  return getDistance(first, second) < first.radius + second.radius + obstaclePadding
}

function createRandom(seed: number) {
  let state = seed || 1

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function randomRange(minimum: number, maximum: number, random: () => number) {
  return minimum + (maximum - minimum) * random()
}

function randomAround(average: number, spread: number, random: () => number) {
  return Math.max(8, average * (1 - spread + random() * spread * 2))
}

function randomBlockAspect(angleDegrees: number) {
  return 0.72 + (Math.sin(angleDegrees) + 1) * 0.28
}

function degreesToRadians(degrees: number) {
  return (degrees / 180) * Math.PI
}

function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * progress
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function getDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}
