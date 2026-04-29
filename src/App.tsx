import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  type Bounce,
  type GameScene,
  type GeneratorConfig,
  type Point,
  defaultGeneratorConfig,
  defaultPredictionCount,
  generateRandomScene,
  getStateAt,
  getTotalScore,
  getUpcomingBounces,
  maximumPredictionCount,
  observeDuration,
  scene,
  scoreGuesses,
  simulateTrajectory,
} from './game'

type Phase = 'preview' | 'guessing' | 'replay' | 'scored'

const replayDuration = 7.2
const boardAccent = '#67e8f9'
const rippleSettleDuration = 2.45

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const replayStartedAt = useRef<number | null>(null)
  const [currentScene, setCurrentScene] = useState(scene)
  const [generatorConfig, setGeneratorConfig] = useState(defaultGeneratorConfig)
  const [phase, setPhase] = useState<Phase>('preview')
  const [previewTime, setPreviewTime] = useState(0)
  const [replayTime, setReplayTime] = useState(0)
  const [bounceLimit, setBounceLimit] = useState(defaultPredictionCount)
  const [guesses, setGuesses] = useState<Point[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [renderRevision, setRenderRevision] = useState(0)

  const simulation = useMemo(() => simulateTrajectory(currentScene), [currentScene])
  const targetBounces = useMemo(
    () => getUpcomingBounces(simulation.bounces, observeDuration, bounceLimit),
    [bounceLimit, simulation],
  )
  const finalTarget = targetBounces[targetBounces.length - 1]
  const revealedTime =
    phase === 'preview'
      ? previewTime
      : phase === 'replay' || phase === 'scored'
        ? Math.min(replayTime, finalTarget?.time ?? replayTime)
        : observeDuration
  const rippleAge =
    (phase === 'replay' || phase === 'scored') && finalTarget && replayTime >= finalTarget.time
      ? replayTime - finalTarget.time
      : null
  const score = phase === 'scored' ? getTotalScore(guesses, targetBounces) : null
  const scoringRows = phase === 'scored' ? scoreGuesses(guesses, targetBounces) : []
  const maxScore = targetBounces.length * 100

  const resetRound = useCallback(() => {
    replayStartedAt.current = null
    setGuesses([])
    setReplayTime(0)
    setPreviewTime(0)
    setPhase('preview')
  }, [])

  const randomizeRound = useCallback(() => {
    replayStartedAt.current = null
    setCurrentScene(generateRandomScene(generatorConfig, bounceLimit))
    setGuesses([])
    setReplayTime(0)
    setPreviewTime(0)
    setPhase('preview')
  }, [bounceLimit, generatorConfig])

  const updateGeneratorConfig = useCallback((key: keyof GeneratorConfig, value: number) => {
    setGeneratorConfig((current) => ({
      ...current,
      [key]: value,
    }))
  }, [])

  const lockIn = useCallback(() => {
    if (guesses.length === 0) {
      return
    }

    replayStartedAt.current = null
    setReplayTime(0)
    setPhase('replay')
  }, [guesses.length])

  const handleBounceLimitChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setBounceLimit(Number(event.target.value))
      setGuesses([])

      if (phase === 'scored') {
        setReplayTime(0)
        setPhase('guessing')
      }
    },
    [phase],
  )

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (phase !== 'guessing' || guesses.length >= targetBounces.length) {
        return
      }

      const canvas = event.currentTarget
      const rect = canvas.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * currentScene.width
      const y = ((event.clientY - rect.top) / rect.height) * currentScene.height

      setGuesses((current) => [...current, { x, y }])
    },
    [currentScene.height, currentScene.width, guesses.length, phase, targetBounces.length],
  )

  const undoGuess = useCallback(() => {
    setGuesses((current) => current.slice(0, -1))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = canvas?.parentElement

    if (!container) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setRenderRevision((revision) => revision + 1)
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    if (phase === 'preview') {
      const startedAt = performance.now()

      const tick = (now: number) => {
        const elapsed = Math.min((now - startedAt) / 1000, observeDuration)
        setPreviewTime(elapsed)

        if (elapsed >= observeDuration) {
          setPhase('guessing')
          return
        }

        animationRef.current = requestAnimationFrame(tick)
      }

      animationRef.current = requestAnimationFrame(tick)
    }

    if (phase === 'replay') {
      const tick = (now: number) => {
        replayStartedAt.current ??= now
        const elapsed = Math.min((now - replayStartedAt.current) / 1000, replayDuration)
        setReplayTime(elapsed)

        if (elapsed >= replayDuration || elapsed > targetBounces[targetBounces.length - 1]?.time + rippleSettleDuration) {
          setPhase('scored')
          return
        }

        animationRef.current = requestAnimationFrame(tick)
      }

      animationRef.current = requestAnimationFrame(tick)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [phase, targetBounces])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')

    if (!canvas || !context) {
      return
    }

    prepareCanvas(canvas, context, currentScene)
    drawScene(context, {
      gameScene: currentScene,
      bounces: simulation.bounces,
      guesses,
      phase,
      rippleAge,
      samples: simulation.samples,
      targetBounces,
      time: revealedTime,
    })
  }, [
    currentScene,
    guesses,
    phase,
    renderRevision,
    revealedTime,
    rippleAge,
    simulation.bounces,
    simulation.samples,
    targetBounces,
  ])

  return (
    <main className="app-shell">
      <section className="game-stage" aria-label="Bouncy game">
        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            aria-label="Bouncy game board"
            height={currentScene.height}
            onClick={handleCanvasClick}
            width={currentScene.width}
          />
        </div>

        <div className="status-strip" aria-live="polite">
          <span>{getPhaseLabel(phase)}</span>
          <strong>
            {guesses.length}/{targetBounces.length}
          </strong>
          {score !== null && <span>{score}/{maxScore}</span>}
        </div>

        <div className="action-bar">
          <button type="button" onClick={lockIn} disabled={phase !== 'guessing' || guesses.length === 0}>
            Lock guesses
          </button>
          <button type="button" className="secondary" onClick={randomizeRound} disabled={phase === 'replay'}>
            Randomize
          </button>
          <button type="button" className="ghost" onClick={resetRound}>
            Restart
          </button>
        </div>

        <div className="help-shell">
          <button
            type="button"
            className="icon-button"
            aria-expanded={helpOpen}
            aria-label="Show instructions"
            onClick={() => setHelpOpen((open) => !open)}
          >
            ?
          </button>
          {helpOpen && <div className="help-popover">Instructions placeholder: watch, predict, lock in, then score.</div>}
        </div>

        <div className="menu-shell">
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            Settings
          </button>

          {settingsOpen && (
            <aside className="hud" aria-label="Game settings">
              <div className="hud-heading">
                <div>
                  <p className="eyebrow">phase</p>
                  <h2>{getPhaseLabel(phase)}</h2>
                </div>
                <button type="button" className="icon-button small" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>
                  ×
                </button>
              </div>

              <div className="meter">
                <span>Markers</span>
                <strong>
                  {guesses.length}/{targetBounces.length}
                </strong>
              </div>

              <label className="select-field">
                <span>Stop after</span>
                <select value={bounceLimit} onChange={handleBounceLimitChange} disabled={phase === 'replay'}>
                  {Array.from({ length: maximumPredictionCount }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>
                      {count} {count === 1 ? 'bounce' : 'bounces'}
                    </option>
                  ))}
                </select>
              </label>

              <section className="generator-panel">
                <div className="generator-heading">
                  <p className="eyebrow">generator</p>
                </div>

                <ObstacleControls
                  countKey="platforms"
                  label="Platforms"
                  maxCount={12}
                  maxSize={220}
                  minSize={40}
                  sizeKey="platformSize"
                  value={generatorConfig}
                  onChange={updateGeneratorConfig}
                />
                <ObstacleControls
                  countKey="circles"
                  label="Circles"
                  maxCount={8}
                  maxSize={80}
                  minSize={14}
                  sizeKey="circleSize"
                  value={generatorConfig}
                  onChange={updateGeneratorConfig}
                />
                <ObstacleControls
                  countKey="triangles"
                  label="Triangles"
                  maxCount={8}
                  maxSize={110}
                  minSize={28}
                  sizeKey="triangleSize"
                  value={generatorConfig}
                  onChange={updateGeneratorConfig}
                />
                <ObstacleControls
                  countKey="blocks"
                  label="Blocks"
                  maxCount={8}
                  maxSize={100}
                  minSize={22}
                  sizeKey="blockSize"
                  value={generatorConfig}
                  onChange={updateGeneratorConfig}
                />

                <label className="range-field">
                  <span>Ball speed</span>
                  <strong>{generatorConfig.speed}</strong>
                  <input
                    max="620"
                    min="180"
                    step="5"
                    type="range"
                    value={generatorConfig.speed}
                    onChange={(event) => updateGeneratorConfig('speed', Number(event.target.value))}
                  />
                </label>
              </section>

              <p className="hint">{getHint(phase, guesses.length, targetBounces.length)}</p>

              <div className="controls">
                <button
                  type="button"
                  className="secondary"
                  onClick={undoGuess}
                  disabled={phase !== 'guessing' || guesses.length === 0}
                >
                  Undo
                </button>
              </div>

              {score !== null && (
                <div className="score-card">
                  <p className="eyebrow">score</p>
                  <strong>
                    {score}/{maxScore}
                  </strong>
                  {scoringRows.map((row) => (
                    <span key={row.index}>
                      Bounce {row.index + 1}:{' '}
                      {Number.isFinite(row.distance) ? `${Math.round(row.distance)}px` : 'miss'} · {row.points} pts
                    </span>
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>
      </section>
    </main>
  )
}

type DrawOptions = {
  bounces: Bounce[]
  gameScene: GameScene
  guesses: Point[]
  phase: Phase
  rippleAge: number | null
  samples: ReturnType<typeof simulateTrajectory>['samples']
  targetBounces: Bounce[]
  time: number
}

function prepareCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, gameScene: GameScene) {
  const rect = canvas.getBoundingClientRect()
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 3)
  const pixelWidth = Math.max(1, Math.round(rect.width * pixelRatio))
  const pixelHeight = Math.max(1, Math.round(rect.height * pixelRatio))

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }

  context.setTransform(pixelWidth / gameScene.width, 0, 0, pixelHeight / gameScene.height, 0, 0)
}

function drawScene(context: CanvasRenderingContext2D, options: DrawOptions) {
  const { bounces, gameScene, guesses, phase, rippleAge, samples, targetBounces, time } = options
  const state = getStateAt(samples, time)
  const visibleSamples = samples.filter((sample) => sample.time <= time)

  context.clearRect(0, 0, gameScene.width, gameScene.height)
  drawBoard(context, gameScene)
  drawTrail(context, visibleSamples)
  drawObstacles(context, gameScene)

  if (rippleAge !== null && targetBounces.length > 0) {
    drawRipple(context, gameScene, targetBounces[targetBounces.length - 1], rippleAge)
  }

  if (phase === 'scored' || phase === 'replay') {
    drawTargets(context, targetBounces.filter((bounce) => bounce.time <= time || phase === 'scored'))
  }

  drawGuesses(context, guesses)
  drawBall(context, state, gameScene.ballRadius, getImpactAge(bounces, time))
}

function drawBoard(context: CanvasRenderingContext2D, gameScene: GameScene) {
  const gradient = context.createLinearGradient(0, 0, gameScene.width, gameScene.height)
  gradient.addColorStop(0, '#111827')
  gradient.addColorStop(1, '#0a0f1e')
  context.fillStyle = gradient
  context.fillRect(0, 0, gameScene.width, gameScene.height)

  context.strokeStyle = boardAccent
  context.lineWidth = 1.5
  context.strokeRect(0.75, 0.75, gameScene.width - 1.5, gameScene.height - 1.5)

  context.globalAlpha = 0.12
  context.strokeStyle = '#334155'
  context.lineWidth = 1
  for (let x = 80; x < gameScene.width; x += 80) {
    context.beginPath()
    context.moveTo(x, 10)
    context.lineTo(x, gameScene.height - 10)
    context.stroke()
  }
  for (let y = 80; y < gameScene.height; y += 80) {
    context.beginPath()
    context.moveTo(10, y)
    context.lineTo(gameScene.width - 10, y)
    context.stroke()
  }
  context.globalAlpha = 1
}

function drawObstacles(context: CanvasRenderingContext2D, gameScene: GameScene) {
  context.strokeStyle = '#020617'
  context.lineWidth = 2

  for (const obstacle of gameScene.obstacles) {
    context.beginPath()
    context.fillStyle = getObstacleFill(obstacle.kind)

    if (obstacle.kind === 'circle') {
      context.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2)
    } else {
      obstacle.points.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y)
          return
        }

        context.lineTo(point.x, point.y)
      })
      context.closePath()
    }

    context.fill()
    context.stroke()
  }
}

function drawRipple(context: CanvasRenderingContext2D, gameScene: GameScene, origin: Point, age: number) {
  const maxRadius = Math.hypot(gameScene.width, gameScene.height)
  const waveRadius = age * 560

  context.save()
  context.lineCap = 'round'

  for (let index = 0; index < 5; index += 1) {
    const radius = waveRadius - index * 46
    if (radius <= 0) {
      continue
    }

    const alpha = Math.max(0, 0.58 - radius / maxRadius) * Math.max(0, 1 - age / rippleSettleDuration) * (1 - index * 0.1)
    context.beginPath()
    context.arc(origin.x, origin.y, radius, 0, Math.PI * 2)
    context.strokeStyle = `rgba(103, 232, 249, ${alpha})`
    context.lineWidth = 2.8 - index * 0.25
    context.stroke()
  }

  for (const obstacle of gameScene.obstacles) {
    const center = getObstacleCenter(obstacle)
    const radius = getObstacleRadius(obstacle, center)
    const arrival = waveRadius - (getDistance(origin, center) - radius)

    if (arrival < 0 || arrival > 180) {
      continue
    }

    const echoProgress = arrival / 180
    context.beginPath()
    context.arc(center.x, center.y, radius + echoProgress * 42, 0, Math.PI * 2)
    context.strokeStyle = `rgba(103, 232, 249, ${0.36 * (1 - echoProgress)})`
    context.lineWidth = 2
    context.stroke()
  }

  context.restore()
}

function drawTrail(context: CanvasRenderingContext2D, samples: DrawOptions['samples']) {
  if (samples.length < 2) {
    return
  }

  context.beginPath()
  samples.forEach((sample, index) => {
    if (index === 0) {
      context.moveTo(sample.x, sample.y)
      return
    }
    context.lineTo(sample.x, sample.y)
  })
  context.strokeStyle = '#38bdf8'
  context.globalAlpha = 0.42
  context.lineWidth = 3
  context.lineCap = 'round'
  context.stroke()
  context.globalAlpha = 1
}

function drawBall(context: CanvasRenderingContext2D, point: Point, radius: number, impactAge: number | null) {
  const age = impactAge ?? 0
  const impact = impactAge === null ? 0 : Math.max(0, 1 - age / 0.18)
  const flicker = impact > 0 ? 0.5 + Math.sin(age * 90) * 0.5 : 0
  const flash = impact * flicker

  if (impact > 0) {
    context.beginPath()
    context.arc(point.x, point.y, radius + 8 + impact * 14, 0, Math.PI * 2)
    context.strokeStyle = `rgba(255, 247, 237, ${0.5 * impact})`
    context.lineWidth = 2
    context.stroke()
  }

  context.beginPath()
  context.arc(point.x, point.y, radius + flash * 3, 0, Math.PI * 2)
  context.fillStyle = flash > 0.45 ? '#fff7ed' : '#f97316'
  context.shadowColor = '#fb923c'
  context.shadowBlur = 18 + flash * 18
  context.fill()
  context.shadowBlur = 0
}

function drawGuesses(context: CanvasRenderingContext2D, guesses: Point[]) {
  guesses.forEach((guess, index) => {
    context.beginPath()
    context.arc(guess.x, guess.y, 15, 0, Math.PI * 2)
    context.strokeStyle = '#facc15'
    context.lineWidth = 3
    context.stroke()

    context.fillStyle = '#fef3c7'
    context.font = '700 14px Inter, system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(String(index + 1), guess.x, guess.y)
  })
}

function drawTargets(context: CanvasRenderingContext2D, bounces: Bounce[]) {
  bounces.forEach((bounce, index) => {
    context.beginPath()
    context.arc(bounce.x, bounce.y, 20, 0, Math.PI * 2)
    context.strokeStyle = '#22c55e'
    context.lineWidth = 3
    context.stroke()

    context.fillStyle = '#bbf7d0'
    context.font = '700 13px Inter, system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(String(index + 1), bounce.x, bounce.y)
  })
}

type ObstacleControlsProps = {
  countKey: keyof Pick<GeneratorConfig, 'blocks' | 'circles' | 'platforms' | 'triangles'>
  label: string
  maxCount: number
  maxSize: number
  minSize: number
  sizeKey: keyof Pick<GeneratorConfig, 'blockSize' | 'circleSize' | 'platformSize' | 'triangleSize'>
  value: GeneratorConfig
  onChange: (key: keyof GeneratorConfig, value: number) => void
}

function ObstacleControls({
  countKey,
  label,
  maxCount,
  maxSize,
  minSize,
  sizeKey,
  value,
  onChange,
}: ObstacleControlsProps) {
  return (
    <div className="obstacle-row">
      <span>{label}</span>
      <label>
        Count
        <input
          max={maxCount}
          min="0"
          type="number"
          value={value[countKey]}
          onChange={(event) => onChange(countKey, Number(event.target.value))}
        />
      </label>
      <label>
        Avg size
        <input
          max={maxSize}
          min={minSize}
          step="2"
          type="number"
          value={value[sizeKey]}
          onChange={(event) => onChange(sizeKey, Number(event.target.value))}
        />
      </label>
    </div>
  )
}

function getObstacleFill(kind: GameScene['obstacles'][number]['kind']) {
  if (kind === 'circle') return '#bfdbfe'
  if (kind === 'triangle') return '#ddd6fe'
  if (kind === 'block') return '#fecdd3'
  return '#dbeafe'
}

function getObstacleCenter(obstacle: GameScene['obstacles'][number]) {
  if (obstacle.kind === 'circle') {
    return { x: obstacle.x, y: obstacle.y }
  }

  return obstacle.points.reduce(
    (total, point) => ({
      x: total.x + point.x / obstacle.points.length,
      y: total.y + point.y / obstacle.points.length,
    }),
    { x: 0, y: 0 },
  )
}

function getObstacleRadius(obstacle: GameScene['obstacles'][number], center: Point) {
  if (obstacle.kind === 'circle') {
    return obstacle.radius
  }

  return Math.max(...obstacle.points.map((point) => getDistance(point, center)))
}

function getPhaseLabel(phase: Phase) {
  if (phase === 'preview') return 'watching'
  if (phase === 'guessing') return 'place predictions'
  if (phase === 'replay') return 'revealing'
  return 'results'
}

function getHint(phase: Phase, guessCount: number, targetCount: number) {
  if (phase === 'preview') return 'Track the angle, speed, and likely collision surfaces.'
  if (phase === 'guessing') return `Click the board to place marker ${Math.min(guessCount + 1, targetCount)}, or lock in early.`
  if (phase === 'replay') return 'Actual bounce points appear in green as the replay reaches them.'
  return 'Yellow is your prediction. Green is the actual bounce point.'
}

function getImpactAge(bounces: Bounce[], time: number) {
  const recentBounce = bounces.findLast((bounce) => bounce.time <= time)

  if (!recentBounce) {
    return null
  }

  const age = time - recentBounce.time
  return age <= 0.18 ? age : null
}

function getDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

export default App


