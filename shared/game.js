export const observeDuration = 1.15;
export const defaultRequiredBounces = 18;
export const boardCollisionInset = 1.5;
export const finalLoopDuration = 180;
export const endlessLives = 3;
export const scoreDistanceFactor = 0.18;
export const minimumScoreTolerance = 28;
export const maximumScoreTolerance = 120;
export const minimumBounceMaxScore = 25;
export const maximumBounceMaxScore = 200;
export const maxScoreLogScale = 420;
export const defaultGeneratorConfig = {
    platforms: 7,
    platformSize: 130,
    circles: 3,
    circleSize: 45,
    triangles: 3,
    triangleSize: 100,
    blocks: 3,
    blockSize: 80,
    speed: 385,
};
export const scene = {
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
};
const restitution = 1;
const sampleRate = 1 / 180;
const minimumBounceGap = 0.025;
const minimumBounceDistance = 12;
const boardMargin = 44;
const obstaclePadding = 18;
export function generateRandomScene(config, requiredBounces = defaultRequiredBounces, seed = createRandomSeed()) {
    const random = createRandom(seed);
    let fallback = scene;
    for (let attempt = 0; attempt < 90; attempt += 1) {
        const candidate = buildRandomScene(config, random);
        const simulation = simulateTrajectory(candidate);
        const upcoming = getBouncesAfterTime(simulation.bounces, observeDuration, requiredBounces);
        const obstacleBounces = upcoming.filter((bounce) => bounce.source === 'obstacle').length;
        fallback = candidate;
        if (upcoming.length >= requiredBounces && obstacleBounces >= Math.min(2, requiredBounces)) {
            return candidate;
        }
    }
    return fallback;
}
export function createRandomSeed() {
    return crypto.getRandomValues(new Uint32Array(1))[0];
}
export function simulateTrajectory(gameScene, duration = 10, dt = sampleRate) {
    const ball = { ...gameScene.start };
    const samples = [{ ...ball, time: 0 }];
    const bounces = [];
    let lastBounceAt = -Infinity;
    let lastBouncePoint = null;
    for (let time = dt; time <= duration + Number.EPSILON; time += dt) {
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        const wallBounce = resolveWallCollision(ball, gameScene);
        let obstacleBounce = false;
        for (const obstacle of gameScene.obstacles) {
            const bounced = obstacle.kind === 'circle'
                ? resolveCircleCollision(ball, obstacle, gameScene.ballRadius)
                : resolvePolygonCollision(ball, obstacle, gameScene.ballRadius);
            obstacleBounce ||= bounced;
        }
        if (wallBounce || obstacleBounce) {
            const bouncePoint = {
                x: ball.x,
                y: ball.y,
            };
            const farEnough = !lastBouncePoint || getDistance(bouncePoint, lastBouncePoint) > minimumBounceDistance;
            const longEnough = time - lastBounceAt > minimumBounceGap;
            const source = wallBounce ? 'wall' : 'obstacle';
            if (longEnough || farEnough || wallBounce) {
                bounces.push({
                    ...bouncePoint,
                    time,
                    source,
                });
                lastBounceAt = time;
                lastBouncePoint = bouncePoint;
            }
        }
        samples.push({ ...ball, time });
    }
    return { samples, bounces };
}
export function getStateAt(samples, time) {
    if (time <= samples[0].time) {
        return samples[0];
    }
    for (let index = 1; index < samples.length; index += 1) {
        const current = samples[index];
        if (current.time >= time) {
            const previous = samples[index - 1];
            const progress = (time - previous.time) / (current.time - previous.time);
            return {
                time,
                x: interpolate(previous.x, current.x, progress),
                y: interpolate(previous.y, current.y, progress),
                vx: interpolate(previous.vx, current.vx, progress),
                vy: interpolate(previous.vy, current.vy, progress),
            };
        }
    }
    return samples[samples.length - 1];
}
export function getBouncesAfterTime(bounces, afterTime, count = defaultRequiredBounces) {
    return bounces.filter((bounce) => bounce.time > afterTime).slice(0, count);
}
export function scoreRun(seed, guesses, options = {}) {
    const gameScene = generateRandomScene(defaultGeneratorConfig, defaultRequiredBounces, seed);
    const simulation = simulateTrajectory(gameScene, options.duration ?? finalLoopDuration);
    const openingBounceIndex = Math.max(0, simulation.bounces.findIndex((bounce) => bounce.time > observeDuration));
    const turns = [];
    for (let index = 0; index < Math.min(64, guesses.length); index += 1) {
        const pauseIndex = openingBounceIndex + index;
        const target = simulation.bounces[pauseIndex + 1];
        const pauseTime = simulation.bounces[pauseIndex]?.time ?? 0;
        if (!target) {
            break;
        }
        const guess = cleanGuess(guesses[index], gameScene);
        const pathLength = getTrajectoryDistance(simulation.samples, pauseTime, target.time);
        const turn = scoreTurn(guess, target, !guess, pathLength);
        turns.push(turn);
        const misses = turns.filter((result) => result.points <= 0).length;
        if (misses >= endlessLives || !simulation.bounces[pauseIndex + 2]) {
            break;
        }
    }
    return {
        seed,
        score: turns.reduce((total, turn) => total + turn.points, 0),
        maxScore: turns.reduce((total, turn) => total + turn.maxPoints, 0),
        turns: turns.map(serializeTurn),
    };
}
export function scoreTurn(guess, target, timedOut, pathLength) {
    const maxPoints = getBounceMaxScore(pathLength);
    if (!guess) {
        return {
            guess,
            target,
            distance: Infinity,
            pathLength,
            maxPoints,
            points: 0,
            timedOut,
        };
    }
    const distance = getDistance(guess, target);
    return {
        guess,
        target,
        distance,
        pathLength,
        maxPoints,
        points: getNormalizedBounceScore(distance, pathLength, maxPoints),
        timedOut,
    };
}
export function getNormalizedBounceScore(distance, pathLength, maxPoints) {
    if (!Number.isFinite(distance)) {
        return 0;
    }
    const tolerance = clamp(pathLength * scoreDistanceFactor, minimumScoreTolerance, maximumScoreTolerance);
    return Math.round(maxPoints * Math.exp(-((distance / tolerance) ** 2)));
}
export function getBounceMaxScore(pathLength) {
    const progress = Math.log1p(Math.max(0, pathLength) / maxScoreLogScale) / Math.log1p(4);
    return Math.round(minimumBounceMaxScore + (maximumBounceMaxScore - minimumBounceMaxScore) * clamp(progress, 0, 1));
}
export function getPredictionMaxScore(results) {
    return results.reduce((total, result) => total + result.maxPoints, 0);
}
export function getTrajectoryDistance(samples, fromTime, toTime) {
    if (toTime <= fromTime) {
        return 0;
    }
    const fromState = getStateAtFast(samples, fromTime);
    const toState = getStateAtFast(samples, toTime);
    const startIndex = getSampleIndexAtOrAfter(samples, fromTime);
    const endIndex = getSampleIndexAtOrBefore(samples, toTime);
    let distance = 0;
    let previous = fromState;
    for (let index = startIndex; index <= endIndex; index += 1) {
        distance += getDistance(previous, samples[index]);
        previous = samples[index];
    }
    return distance + getDistance(previous, toState);
}
function buildRandomScene(config, random) {
    const width = scene.width;
    const height = scene.height;
    const obstacles = [];
    const bounds = [];
    const start = makeCenterStart(width, height, config.speed, random);
    const startBounds = {
        x: start.x,
        y: start.y,
        radius: scene.ballRadius + 54,
    };
    addObstacles(config.platforms, () => {
        const length = randomAround(config.platformSize, 0.42, random);
        return makePlatform(randomRange(boardMargin, width - boardMargin, random), randomRange(boardMargin, height - boardMargin, random), length, randomRange(0, 180, random));
    });
    addObstacles(config.circles, () => makeCircle(randomRange(boardMargin, width - boardMargin, random), randomRange(boardMargin, height - boardMargin, random), randomAround(config.circleSize, 0.35, random)));
    addObstacles(config.triangles, () => makeTriangle(randomRange(boardMargin, width - boardMargin, random), randomRange(boardMargin, height - boardMargin, random), randomAround(config.triangleSize, 0.35, random), randomRange(0, 360, random)));
    addObstacles(config.blocks, () => makeBlock(randomRange(boardMargin, width - boardMargin, random), randomRange(boardMargin, height - boardMargin, random), randomAround(config.blockSize, 0.35, random), randomRange(0, 360, random)));
    return {
        width,
        height,
        ballRadius: scene.ballRadius,
        start,
        obstacles,
    };
    function addObstacles(count, createObstacle) {
        for (let index = 0; index < count; index += 1) {
            for (let attempt = 0; attempt < 600; attempt += 1) {
                const obstacle = createObstacle();
                const obstacleBounds = getObstacleBounds(obstacle);
                if (!isInsideBoard(obstacleBounds, width, height) ||
                    boundsOverlap(obstacleBounds, startBounds) ||
                    bounds.some((bound) => boundsOverlap(bound, obstacleBounds))) {
                    continue;
                }
                obstacles.push(obstacle);
                bounds.push(obstacleBounds);
                break;
            }
        }
    }
}
function makeCenterStart(width, height, speed, random) {
    const angle = randomRange(0, Math.PI * 2, random);
    return {
        x: width / 2,
        y: height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
    };
}
function makeCircle(x, y, radius) {
    return {
        kind: 'circle',
        x,
        y,
        radius: Math.max(12, radius),
    };
}
function makePlatform(x, y, length, angleDegrees) {
    const width = Math.max(32, length);
    const height = 16;
    const points = makeRotatedRectangle(x, y, width, height, angleDegrees);
    const cornerRadius = height / 2;
    return {
        kind: 'platform',
        cornerRadius,
        collisionPoints: getRoundedPolygonPoints(points, cornerRadius, 5),
        points,
    };
}
function makeBlock(x, y, size, angleDegrees) {
    const width = Math.max(22, size);
    const points = makeRotatedRectangle(x, y, width, width * randomBlockAspect(angleDegrees), angleDegrees);
    const cornerRadius = Math.min(14, width * 0.22);
    return {
        kind: 'block',
        cornerRadius,
        collisionPoints: getRoundedPolygonPoints(points, cornerRadius, 5),
        points,
    };
}
function makeTriangle(x, y, size, angleDegrees) {
    const radius = Math.max(24, size);
    const angle = degreesToRadians(angleDegrees);
    const points = [0, 1, 2].map((index) => ({
        x: x + Math.cos(angle + index * ((Math.PI * 2) / 3)) * radius,
        y: y + Math.sin(angle + index * ((Math.PI * 2) / 3)) * radius,
    }));
    const cornerRadius = Math.min(18, radius * 0.18);
    return {
        kind: 'triangle',
        cornerRadius,
        collisionPoints: getRoundedPolygonPoints(points, cornerRadius, 7),
        points,
    };
}
function makeRotatedRectangle(x, y, width, height, angleDegrees) {
    const angle = degreesToRadians(angleDegrees);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    return [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
    ].map((point) => ({
        x: x + point.x * cos - point.y * sin,
        y: y + point.x * sin + point.y * cos,
    }));
}
function getRoundedPolygonPoints(points, radius, curveSegments) {
    if (points.length < 3 || radius <= 0) {
        return points;
    }
    const roundedPoints = [];
    for (let index = 0; index < points.length; index += 1) {
        const previous = points[(index + points.length - 1) % points.length];
        const current = points[index];
        const next = points[(index + 1) % points.length];
        const previousLength = getDistance(current, previous);
        const nextLength = getDistance(current, next);
        const trim = Math.min(radius, previousLength * 0.5, nextLength * 0.5);
        const start = getPointToward(current, previous, trim);
        const end = getPointToward(current, next, trim);
        roundedPoints.push(start);
        for (let segment = 1; segment <= curveSegments; segment += 1) {
            const progress = segment / curveSegments;
            roundedPoints.push(getQuadraticPoint(start, current, end, progress));
        }
    }
    return roundedPoints;
}
function getPointToward(from, to, distance) {
    const totalDistance = getDistance(from, to);
    if (totalDistance === 0) {
        return from;
    }
    const progress = distance / totalDistance;
    return {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
    };
}
function getQuadraticPoint(start, control, end, progress) {
    const inverse = 1 - progress;
    return {
        x: inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x,
        y: inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y,
    };
}
function resolveWallCollision(ball, gameScene) {
    let bounced = false;
    const radius = gameScene.ballRadius + boardCollisionInset;
    if (ball.x < radius) {
        ball.x = radius;
        ball.vx = Math.abs(ball.vx) * restitution;
        bounced = true;
    }
    else if (ball.x > gameScene.width - radius) {
        ball.x = gameScene.width - radius;
        ball.vx = -Math.abs(ball.vx) * restitution;
        bounced = true;
    }
    if (ball.y < radius) {
        ball.y = radius;
        ball.vy = Math.abs(ball.vy) * restitution;
        bounced = true;
    }
    else if (ball.y > gameScene.height - radius) {
        ball.y = gameScene.height - radius;
        ball.vy = -Math.abs(ball.vy) * restitution;
        bounced = true;
    }
    return bounced;
}
function resolveCircleCollision(ball, circle, radius) {
    const dx = ball.x - circle.x;
    const dy = ball.y - circle.y;
    const distance = Math.hypot(dx, dy);
    const minimumDistance = radius + circle.radius;
    if (distance >= minimumDistance || distance === 0) {
        return false;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    const velocityAlongNormal = ball.vx * nx + ball.vy * ny;
    if (velocityAlongNormal >= 0) {
        return false;
    }
    ball.x = circle.x + nx * minimumDistance;
    ball.y = circle.y + ny * minimumDistance;
    ball.vx -= 2 * velocityAlongNormal * nx * restitution;
    ball.vy -= 2 * velocityAlongNormal * ny * restitution;
    return true;
}
function resolvePolygonCollision(ball, obstacle, radius) {
    const polygon = obstacle.collisionPoints;
    const closest = getClosestPolygonPoint(ball, polygon);
    const inside = isPointInPolygon(ball, polygon);
    if (!inside && closest.distance > radius) {
        return false;
    }
    const centroid = getCentroid(polygon);
    let nx = ball.x - closest.point.x;
    let ny = ball.y - closest.point.y;
    let normalLength = Math.hypot(nx, ny);
    if (inside || normalLength === 0) {
        nx = ball.x - centroid.x;
        ny = ball.y - centroid.y;
        normalLength = Math.hypot(nx, ny) || 1;
    }
    nx /= normalLength;
    ny /= normalLength;
    const velocityAlongNormal = ball.vx * nx + ball.vy * ny;
    if (velocityAlongNormal >= 0) {
        return false;
    }
    const pushOut = inside ? radius + 2 : radius - closest.distance + 1;
    ball.x += nx * pushOut;
    ball.y += ny * pushOut;
    ball.vx -= 2 * velocityAlongNormal * nx * restitution;
    ball.vy -= 2 * velocityAlongNormal * ny * restitution;
    return true;
}
function getClosestPolygonPoint(point, polygon) {
    let closestPoint = polygon[0];
    let closestDistance = Infinity;
    for (let index = 0; index < polygon.length; index += 1) {
        const start = polygon[index];
        const end = polygon[(index + 1) % polygon.length];
        const candidate = getClosestPointOnSegment(point, start, end);
        const distance = getDistance(point, candidate);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestPoint = candidate;
        }
    }
    return {
        point: closestPoint,
        distance: closestDistance,
    };
}
function getClosestPointOnSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared === 0 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
    return {
        x: start.x + dx * progress,
        y: start.y + dy * progress,
    };
}
function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
        const currentPoint = polygon[index];
        const previousPoint = polygon[previous];
        const intersects = currentPoint.y > point.y !== previousPoint.y > point.y &&
            point.x <
                ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
                    (previousPoint.y - currentPoint.y) +
                    currentPoint.x;
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}
function getCentroid(points) {
    return points.reduce((total, point) => ({
        x: total.x + point.x / points.length,
        y: total.y + point.y / points.length,
    }), { x: 0, y: 0 });
}
function getObstacleBounds(obstacle) {
    if (obstacle.kind === 'circle') {
        return {
            x: obstacle.x,
            y: obstacle.y,
            radius: obstacle.radius,
        };
    }
    const center = getCentroid(obstacle.points);
    const radius = Math.max(...obstacle.points.map((point) => getDistance(point, center)));
    return {
        ...center,
        radius,
    };
}
function isInsideBoard(bounds, width, height) {
    return (bounds.x - bounds.radius > boardMargin / 2 &&
        bounds.x + bounds.radius < width - boardMargin / 2 &&
        bounds.y - bounds.radius > boardMargin / 2 &&
        bounds.y + bounds.radius < height - boardMargin / 2);
}
function boundsOverlap(first, second) {
    return getDistance(first, second) < first.radius + second.radius + obstaclePadding;
}
function createRandom(seed) {
    let state = seed || 1;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}
function randomRange(minimum, maximum, random) {
    return minimum + (maximum - minimum) * random();
}
function randomAround(average, spread, random) {
    return Math.max(8, average * (1 - spread + random() * spread * 2));
}
function randomBlockAspect(angleDegrees) {
    return 0.72 + (Math.sin(angleDegrees) + 1) * 0.28;
}
function degreesToRadians(degrees) {
    return (degrees / 180) * Math.PI;
}
function interpolate(start, end, progress) {
    return start + (end - start) * progress;
}
function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}
function getDistance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
}
function cleanGuess(value, gameScene) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const x = Number(value.x);
    const y = Number(value.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }
    return {
        x: clamp(x, 0, gameScene.width),
        y: clamp(y, 0, gameScene.height),
    };
}
function serializeTurn(turn) {
    return {
        guess: turn.guess ? { x: turn.guess.x, y: turn.guess.y } : null,
        target: {
            x: turn.target.x,
            y: turn.target.y,
            time: turn.target.time,
            source: turn.target.source,
        },
        points: turn.points,
        maxPoints: turn.maxPoints,
    };
}
function getStateAtFast(samples, time) {
    if (time <= samples[0].time) {
        return samples[0];
    }
    const index = getSampleIndexAtOrAfter(samples, time);
    const current = samples[index];
    const previous = samples[Math.max(0, index - 1)];
    if (!current || current.time === previous.time) {
        return samples[samples.length - 1];
    }
    const progress = (time - previous.time) / (current.time - previous.time);
    return {
        time,
        x: previous.x + (current.x - previous.x) * progress,
        y: previous.y + (current.y - previous.y) * progress,
        vx: previous.vx + (current.vx - previous.vx) * progress,
        vy: previous.vy + (current.vy - previous.vy) * progress,
    };
}
function getSampleIndexAtOrBefore(samples, time) {
    let low = 0;
    let high = samples.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (samples[mid].time <= time) {
            low = mid + 1;
        }
        else {
            high = mid - 1;
        }
    }
    return Math.max(0, high);
}
function getSampleIndexAtOrAfter(samples, time) {
    let low = 0;
    let high = samples.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (samples[mid].time < time) {
            low = mid + 1;
        }
        else {
            high = mid - 1;
        }
    }
    return Math.min(samples.length - 1, low);
}
