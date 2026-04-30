import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  type Bounce,
  type GameScene,
  type GeneratorConfig,
  type Point,
  defaultGeneratorConfig,
  generateRandomScene,
  observeDuration,
  scene,
  simulateTrajectory,
} from './game'

type Phase =
  | 'guessing'
  | 'ready'
  | 'opening'
  | 'turn-reveal'
  | 'end-ripple'
  | 'score-replay'
  | 'finished'
type TurnResult = {
  guess: Point | null
  target: Bounce
  distance: number
  pathLength: number
  maxPoints: number
  points: number
  timedOut: boolean
}
type LabeledTurnResult = TurnResult & {
  label: number
}
type LabeledPoint = Point & {
  label?: number
  score?: number
  tone?: GuessTone
}
type LabeledBounce = Bounce & {
  label?: number
}
type GuessTone = 'tentative'

const boardAccent = '#67e8f9'
const rippleSettleDuration = 2.45
const endlessStartSeconds = 5
const endlessMinimumSeconds = 2
const endlessTimerDecay = 0.5
const endlessGenerationBounces = 18
const endlessLives = 3
const finalLoopDuration = 180
const scoreDistanceFactor = 0.18
const minimumScoreTolerance = 28
const maximumScoreTolerance = 120
const minimumBounceMaxScore = 25
const maximumBounceMaxScore = 200
const maxScoreLogScale = 420
const maxTrailSegments = 900

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const lastSoundBounceRef = useRef(-1)
  const lastSoundTimeRef = useRef(0)
  const stepAnimationStartedAt = useRef<number | null>(null)
  const stepAnimationFromTime = useRef(0)
  const stepAnimationToTime = useRef(0)
  const finishedLoopStartTime = useRef(0)
  const guessTimerStartedAt = useRef<number | null>(null)
  const activeGuessRef = useRef<Point | null>(null)
  const [currentScene, setCurrentScene] = useState(scene)
  const [generatorConfig, setGeneratorConfig] = useState(defaultGeneratorConfig)
  const [phase, setPhase] = useState<Phase>('ready')
  const [stepTime, setStepTime] = useState(0)
  const [finalTrailTime, setFinalTrailTime] = useState(0)
  const [timerRemaining, setTimerRemaining] = useState(endlessStartSeconds)
  const [activeGuess, setActiveGuess] = useState<Point | null>(null)
  const [turnIndex, setTurnIndex] = useState(0)
  const [pauseBounceIndex, setPauseBounceIndex] = useState(0)
  const [turnResults, setTurnResults] = useState<TurnResult[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [highlightedBounce, setHighlightedBounce] = useState<number | null>(null)
  const [renderRevision, setRenderRevision] = useState(0)

  const simulation = useMemo(() => simulateTrajectory(currentScene, finalLoopDuration), [currentScene])
  const openingBounceIndex = useMemo(
    () => Math.max(0, simulation.bounces.findIndex((bounce) => bounce.time > observeDuration)),
    [simulation.bounces],
  )
  const currentTarget = simulation.bounces[pauseBounceIndex + 1]
  const pauseTime = simulation.bounces[pauseBounceIndex]?.time ?? 0
  const finalPredictionTarget = turnResults[turnResults.length - 1]?.target
  const currentTurnSeconds = getTurnSeconds(turnIndex)
  const totalScore = turnResults.reduce((total, result) => total + result.points, 0)
  const endlessMisses = getEndlessMisses(turnResults)
  const displayScore = phase === 'score-replay' ? getAnimatedReplayScore(turnResults, stepTime) : totalScore
  const visibleScoreResults = getVisibleScoreResults(turnResults, phase, stepTime)
  const maxScore = getPredictionMaxScore(turnResults)
  const revealedTime = getVisibleTime(phase, stepTime, pauseTime, finalPredictionTarget?.time)
  const rippleAge =
    phase === 'end-ripple' && finalPredictionTarget ? Math.max(0, stepTime - finalPredictionTarget.time) : null
  const visibleGuesses = getEndlessGuesses(turnResults, activeGuess, phase, revealedTime)
  const visibleTargets = getEndlessTargets(turnResults, phase, revealedTime)
  const timerProgress = phase === 'guessing' ? Math.max(0, Math.min(1, timerRemaining / currentTurnSeconds)) : null
  const playDueBounceSounds = useCallback(
    (time: number) => {
      if (time < lastSoundTimeRef.current) {
        lastSoundBounceRef.current = -1
      }
      lastSoundTimeRef.current = time

      const currentBounceIndex = getBounceIndexAtOrBefore(simulation.bounces, time)
      for (let index = lastSoundBounceRef.current + 1; index <= currentBounceIndex; index += 1) {
        const bounce = simulation.bounces[index]
        if (bounce) {
          playBounceSound(audioContextRef.current, bounce.source)
        }
      }
      lastSoundBounceRef.current = Math.max(lastSoundBounceRef.current, currentBounceIndex)
    },
    [simulation.bounces],
  )

  const startNewRound = useCallback(() => {
    stepAnimationStartedAt.current = null
    guessTimerStartedAt.current = null
    activeGuessRef.current = null
    finishedLoopStartTime.current = 0
    lastSoundBounceRef.current = -1
    lastSoundTimeRef.current = 0
    setCurrentScene(generateRandomScene(generatorConfig, endlessGenerationBounces))
    setActiveGuess(null)
    setTurnIndex(0)
    setTurnResults([])
    setHighlightedBounce(null)
    setTimerRemaining(endlessStartSeconds)
    setPauseBounceIndex(0)
    setStepTime(0)
    setFinalTrailTime(0)
    setPhase('ready')
  }, [generatorConfig])

  const watchOneBounceReplay = useCallback(() => {
    if (turnResults.length === 0) {
      return
    }

    stepAnimationStartedAt.current = null
    stepAnimationFromTime.current = 0
    stepAnimationToTime.current = turnResults[turnResults.length - 1].target.time + 0.8
    lastSoundBounceRef.current = -1
    lastSoundTimeRef.current = 0
    setStepTime(0)
    setFinalTrailTime(0)
    setPhase('score-replay')
  }, [turnResults])

  const updateGeneratorConfig = useCallback(
    (key: keyof GeneratorConfig, value: number) => {
      const nextConfig = {
        ...generatorConfig,
        [key]: value,
      }
      const requiredBounces = endlessGenerationBounces

      stepAnimationStartedAt.current = null
      guessTimerStartedAt.current = null
      activeGuessRef.current = null
      finishedLoopStartTime.current = 0
      lastSoundBounceRef.current = -1
      lastSoundTimeRef.current = 0
      setGeneratorConfig(nextConfig)
      setCurrentScene(generateRandomScene(nextConfig, requiredBounces))
      setActiveGuess(null)
      setTurnIndex(0)
      setTurnResults([])
      setHighlightedBounce(null)
      setTimerRemaining(endlessStartSeconds)
      setPauseBounceIndex(0)
      setStepTime(0)
      setFinalTrailTime(0)
      setPhase('ready')
    },
    [generatorConfig],
  )

  const enableAudio = useCallback(() => {
    audioContextRef.current ??= new AudioContext()

    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume()
    }
  }, [])

  const startGame = useCallback(() => {
    if (!simulation.bounces[openingBounceIndex]) {
      return
    }

    enableAudio()
    activeGuessRef.current = null
    lastSoundBounceRef.current = -1
    lastSoundTimeRef.current = 0
    setActiveGuess(null)
    setTurnIndex(0)
    setTurnResults([])
    setHighlightedBounce(null)
    setTimerRemaining(endlessStartSeconds)
    setPauseBounceIndex(openingBounceIndex)
    stepAnimationStartedAt.current = null
    stepAnimationFromTime.current = 0
    stepAnimationToTime.current = simulation.bounces[openingBounceIndex].time
    setStepTime(0)
    setFinalTrailTime(0)
    setPhase('opening')
  }, [enableAudio, openingBounceIndex, simulation.bounces])

  const finishTurn = useCallback(() => {
    if (phase !== 'guessing' || !currentTarget) {
      return
    }

    const timeoutGuess = activeGuessRef.current
    const pathLength = getTrajectoryDistance(simulation.samples, pauseTime, currentTarget.time)
    setTurnResults((current) => [...current, scoreTurn(timeoutGuess, currentTarget, !timeoutGuess, pathLength)])
    activeGuessRef.current = null
    setActiveGuess(null)
    stepAnimationStartedAt.current = null
    stepAnimationFromTime.current = pauseTime
    stepAnimationToTime.current = currentTarget.time
    guessTimerStartedAt.current = null
    setStepTime(pauseTime)
    setFinalTrailTime(pauseTime)
    setPhase('turn-reveal')
  }, [currentTarget, pauseTime, phase, simulation.samples])

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (phase !== 'guessing') {
        return
      }

      const canvas = event.currentTarget
      const rect = canvas.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * currentScene.width
      const y = ((event.clientY - rect.top) / rect.height) * currentScene.height
      playPlaceSound(audioContextRef.current)

      const nextGuess = { x, y }
      activeGuessRef.current = nextGuess
      setActiveGuess(nextGuess)
    },
    [currentScene.height, currentScene.width, phase],
  )

  useEffect(() => {
    activeGuessRef.current = activeGuess
  }, [activeGuess])

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

    if (phase === 'opening' || phase === 'turn-reveal' || phase === 'end-ripple' || phase === 'score-replay') {
      lastSoundBounceRef.current =
        phase === 'opening' || phase === 'score-replay' ? -1 : pauseBounceIndex

      const tick = (now: number) => {
        stepAnimationStartedAt.current ??= now
        const elapsed = (now - stepAnimationStartedAt.current) / 1000
        const fromTime = stepAnimationFromTime.current
        const toTime = stepAnimationToTime.current
        const speedMultiplier = phase === 'turn-reveal' ? getRevealSpeedMultiplier(turnIndex) : 1
        const nextTime = Math.min(toTime, fromTime + elapsed * speedMultiplier)
        setStepTime(nextTime)
        setFinalTrailTime(nextTime)
        if (phase !== 'end-ripple') {
          playDueBounceSounds(nextTime)
        }

        if (nextTime >= toTime) {
          stepAnimationStartedAt.current = null

          if (phase === 'score-replay') {
            setStepTime(toTime)
            setFinalTrailTime(toTime)
            finishedLoopStartTime.current = toTime
            setPhase('finished')
          } else if (phase === 'end-ripple') {
            const replayEndTime = turnResults[turnResults.length - 1]?.target.time + 0.8 || toTime
            stepAnimationFromTime.current = 0
            stepAnimationToTime.current = replayEndTime
            setStepTime(0)
            setFinalTrailTime(0)
            lastSoundBounceRef.current = -1
            lastSoundTimeRef.current = 0
            setPhase('score-replay')
          } else if (phase === 'opening') {
            setPauseBounceIndex(openingBounceIndex)
            setTimerRemaining(endlessStartSeconds)
            guessTimerStartedAt.current = null
            setPhase('guessing')
          } else {
            const nextPauseIndex = pauseBounceIndex + 1
            const completedTurns = turnIndex + 1
            const latestResult = turnResults[turnResults.length - 1]
            setPauseBounceIndex(nextPauseIndex)
            activeGuessRef.current = null
            setActiveGuess(null)

            if (shouldEndRun(turnResults, Boolean(simulation.bounces[nextPauseIndex + 1]))) {
              const rippleStartTime = latestResult?.target.time ?? nextTime
              stepAnimationStartedAt.current = null
              stepAnimationFromTime.current = rippleStartTime
              stepAnimationToTime.current = rippleStartTime + rippleSettleDuration
              setStepTime(rippleStartTime)
              setFinalTrailTime(rippleStartTime)
              setPhase('end-ripple')
            } else {
              setTurnIndex(completedTurns)
              setTimerRemaining(getTurnSeconds(completedTurns))
              guessTimerStartedAt.current = null
              setPhase('guessing')
            }
          }
          return
        }

        animationRef.current = requestAnimationFrame(tick)
      }

      animationRef.current = requestAnimationFrame(tick)
    }

    if (phase === 'finished') {
      const simulationDuration = simulation.samples[simulation.samples.length - 1]?.time ?? 10

      const tick = (now: number) => {
        stepAnimationStartedAt.current ??= now
        const elapsed = (now - stepAnimationStartedAt.current) / 1000
        const absoluteTime = finishedLoopStartTime.current + elapsed
        const loopTime = absoluteTime % simulationDuration
        setStepTime(loopTime)
        setFinalTrailTime(Math.min(absoluteTime, simulationDuration))
        playDueBounceSounds(loopTime)
        animationRef.current = requestAnimationFrame(tick)
      }

      animationRef.current = requestAnimationFrame(tick)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [
    openingBounceIndex,
    pauseBounceIndex,
    phase,
    simulation.bounces,
    simulation.samples,
    turnIndex,
    turnResults,
    playDueBounceSounds,
  ])

  useEffect(() => {
    if (phase !== 'guessing') {
      return
    }

    let timerFrame = 0
    guessTimerStartedAt.current = performance.now()

    const tick = (now: number) => {
      const startedAt = guessTimerStartedAt.current ?? now
      const remaining = Math.max(0, currentTurnSeconds - (now - startedAt) / 1000)
      setTimerRemaining(remaining)

      if (remaining <= 0) {
        finishTurn()
        return
      }

      timerFrame = requestAnimationFrame(tick)
    }

    timerFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(timerFrame)
  }, [currentTurnSeconds, finishTurn, phase, turnIndex])

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
      guesses: visibleGuesses,
      phase,
      rippleAge,
      samples: simulation.samples,
      targetBounces: visibleTargets,
      highlightedLabel: highlightedBounce,
      trailTime: phase === 'finished' ? finalTrailTime : revealedTime,
      timerProgress,
      time: revealedTime,
    })
  }, [
    currentScene,
    highlightedBounce,
    finalTrailTime,
    phase,
    renderRevision,
    revealedTime,
    rippleAge,
    simulation.bounces,
    simulation.samples,
    timerProgress,
    visibleGuesses,
    visibleTargets,
  ])

  return (
    <main className="app-shell">
      <section className="game-stage" aria-label="Bouncy game">
        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            aria-label="Bouncy game board"
            height={currentScene.height}
            onClick={(event) => {
              enableAudio()
              handleCanvasClick(event)
            }}
            width={currentScene.width}
          />
        </div>

        <div className="status-strip" aria-live="polite">
          <span>{getPhaseLabel(phase)}</span>
          <strong>
            Lives {Math.max(0, endlessLives - endlessMisses)}/{endlessLives}
          </strong>
          <span className="life-pips" aria-label={`${Math.max(0, endlessLives - endlessMisses)} lives remaining`}>
            {Array.from({ length: endlessLives }, (_, index) => (
              <i className={index < endlessLives - endlessMisses ? 'alive' : ''} key={index} />
            ))}
          </span>
          {displayScore !== null && <span>{formatScore(displayScore, maxScore)}</span>}
        </div>

        {phase === 'ready' && (
          <div className="play-overlay">
            <button type="button" onClick={startGame}>
              Play
            </button>
          </div>
        )}

        {phase === 'score-replay' && (
          <ScorePanel
            label="scoring replay"
            maxScore={maxScore}
            score={displayScore}
            onHover={setHighlightedBounce}
            results={visibleScoreResults}
          />
        )}

        {phase === 'finished' && (
          <div className="final-score-menu">
            <ScorePanel
              label="final score"
              maxScore={null}
              score={displayScore}
              onHover={setHighlightedBounce}
              results={visibleScoreResults}
            />
            <div className="score-actions">
              <button type="button" onClick={startNewRound}>
                New Round
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  enableAudio()
                  watchOneBounceReplay()
                }}
              >
                Watch Replay
              </button>
            </div>
          </div>
        )}

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
                <span>Lives</span>
                <strong>
                  {Math.max(0, endlessLives - endlessMisses)}/{endlessLives}
                </strong>
              </div>

              <div className="score-card">
                <p className="eyebrow">endless rules</p>
                <span>Keep predicting one bounce ahead. Three misses ends the run.</span>
                <span>Timer decays from {endlessStartSeconds}s to {endlessMinimumSeconds}s.</span>
              </div>

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

              <p className="hint">{getHint(phase, turnResults.length)}</p>

              <div className="score-card">
                <p className="eyebrow">score</p>
                <strong>{formatScore(totalScore, maxScore)}</strong>
                {turnResults.map((result, index) => (
                  <span className="score-line" style={getScoreStyle(result.points, result.maxPoints)} key={`${result.target.time}-${index}`}>
                    <span>Bounce {index + 1}</span>
                    <span>{result.points}/{result.maxPoints}</span>
                  </span>
                ))}
              </div>
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
  guesses: LabeledPoint[]
  highlightedLabel: number | null
  phase: Phase
  rippleAge: number | null
  samples: ReturnType<typeof simulateTrajectory>['samples']
  targetBounces: LabeledBounce[]
  trailTime: number
  timerProgress: number | null
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
  const { bounces, gameScene, guesses, highlightedLabel, phase, rippleAge, samples, targetBounces, timerProgress, time, trailTime } = options
  const state = getStateAtFast(samples, time)
  const sampleIndex = getSampleIndexAtOrBefore(samples, trailTime)

  context.clearRect(0, 0, gameScene.width, gameScene.height)
  drawBoard(context, gameScene)
  drawTrail(context, samples, sampleIndex)
  drawObstacles(context, gameScene)

  if (rippleAge !== null && targetBounces.length > 0) {
    drawRipple(context, gameScene, targetBounces[targetBounces.length - 1], rippleAge)
  }

  if (phase === 'score-replay' || phase === 'finished') {
    drawTargets(
      context,
      targetBounces.filter((bounce) => bounce.time <= time || phase === 'finished'),
      highlightedLabel,
    )
  }

  drawGuesses(context, guesses, highlightedLabel)
  drawBall(context, state, gameScene.ballRadius, timerProgress === null ? getImpactAge(bounces, time) : null, timerProgress)
}

function getStateAtFast(samples: DrawOptions['samples'], time: number) {
  if (time <= samples[0].time) {
    return samples[0]
  }

  const index = getSampleIndexAtOrAfter(samples, time)
  const current = samples[index]
  const previous = samples[Math.max(0, index - 1)]

  if (!current || current.time === previous.time) {
    return samples[samples.length - 1]
  }

  const progress = (time - previous.time) / (current.time - previous.time)
  return {
    time,
    x: previous.x + (current.x - previous.x) * progress,
    y: previous.y + (current.y - previous.y) * progress,
    vx: previous.vx + (current.vx - previous.vx) * progress,
    vy: previous.vy + (current.vy - previous.vy) * progress,
  }
}

function getSampleIndexAtOrBefore(samples: DrawOptions['samples'], time: number) {
  let low = 0
  let high = samples.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (samples[mid].time <= time) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return Math.max(0, high)
}

function getSampleIndexAtOrAfter(samples: DrawOptions['samples'], time: number) {
  let low = 0
  let high = samples.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (samples[mid].time < time) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return Math.min(samples.length - 1, low)
}

function getBounceIndexAtOrBefore(bounces: Bounce[], time: number) {
  let low = 0
  let high = bounces.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (bounces[mid].time <= time) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return high
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

function drawTrail(context: CanvasRenderingContext2D, samples: DrawOptions['samples'], endIndex: number) {
  if (samples.length < 2 || endIndex < 1) {
    return
  }

  const startIndex = 0
  const stride = Math.max(1, Math.ceil((endIndex - startIndex) / maxTrailSegments))

  context.beginPath()
  for (let index = startIndex; index <= endIndex; index += stride) {
    const sample = samples[index]
    if (index === startIndex) {
      context.moveTo(sample.x, sample.y)
      continue
    }
    context.lineTo(sample.x, sample.y)
  }
  if ((endIndex - startIndex) % stride !== 0) {
    const finalSample = samples[endIndex]
    context.lineTo(finalSample.x, finalSample.y)
  }
  context.strokeStyle = '#38bdf8'
  context.globalAlpha = 0.42
  context.lineWidth = 3
  context.lineCap = 'round'
  context.stroke()
  context.globalAlpha = 1
}

function drawBall(
  context: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  impactAge: number | null,
  timerProgress: number | null,
) {
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

  if (timerProgress !== null) {
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + Math.PI * 2 * timerProgress

    context.beginPath()
    context.moveTo(point.x, point.y)
    context.arc(point.x, point.y, radius * 0.72, startAngle, endAngle)
    context.closePath()
    context.fillStyle = 'rgba(2, 6, 23, 0.58)'
    context.fill()

    context.beginPath()
    context.arc(point.x, point.y, radius * 0.86, 0, Math.PI * 2)
    context.strokeStyle = 'rgba(103, 232, 249, 0.9)'
    context.lineWidth = 2
    context.stroke()
  }
}

function drawGuesses(context: CanvasRenderingContext2D, guesses: LabeledPoint[], highlightedLabel: number | null) {
  guesses.forEach((guess, index) => {
    const colors = getGuessColors(guess.tone, guess.score)
    const highlighted = highlightedLabel !== null && guess.label === highlightedLabel
    context.beginPath()
    context.arc(guess.x, guess.y, highlighted ? 20 : 15, 0, Math.PI * 2)
    context.strokeStyle = colors.stroke
    context.lineWidth = highlighted ? 5 : 3
    context.shadowColor = highlighted ? colors.stroke : 'transparent'
    context.shadowBlur = highlighted ? 18 : 0
    context.stroke()
    context.shadowBlur = 0

    context.fillStyle = colors.text
    context.font = '700 14px Inter, system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(String(guess.label ?? index + 1), guess.x, guess.y)
  })
}

function drawTargets(context: CanvasRenderingContext2D, bounces: LabeledBounce[], highlightedLabel: number | null) {
  bounces.forEach((bounce, index) => {
    const highlighted = highlightedLabel !== null && bounce.label === highlightedLabel
    context.beginPath()
    context.arc(bounce.x, bounce.y, highlighted ? 25 : 20, 0, Math.PI * 2)
    context.strokeStyle = '#22c55e'
    context.lineWidth = highlighted ? 5 : 3
    context.shadowColor = highlighted ? '#22c55e' : 'transparent'
    context.shadowBlur = highlighted ? 18 : 0
    context.stroke()
    context.shadowBlur = 0

    context.fillStyle = '#bbf7d0'
    context.font = '700 13px Inter, system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(String(bounce.label ?? index + 1), bounce.x, bounce.y)
  })
}

type ScorePanelProps = {
  label: string
  maxScore: number | null
  onHover?: (label: number | null) => void
  score: number
  results: LabeledTurnResult[]
}

function ScorePanel({ label, maxScore, onHover, score, results }: ScorePanelProps) {
  const breakdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const breakdown = breakdownRef.current
    if (!breakdown) {
      return
    }

    breakdown.scrollTop = breakdown.scrollHeight
  }, [results.length, score])

  return (
    <div className="score-panel">
      <p className="eyebrow">{label}</p>
      <strong>
        {formatScore(score, maxScore)}
      </strong>
      <div className="score-breakdown" ref={breakdownRef}>
        {results.map((result, index) => (
          <span
            className="score-line"
            key={`${result.target.time}-${index}`}
            onBlur={() => onHover?.(null)}
            onFocus={() => onHover?.(result.label)}
            onMouseEnter={() => onHover?.(result.label)}
            onMouseLeave={() => onHover?.(null)}
            style={getScoreStyle(result.points, result.maxPoints)}
            tabIndex={0}
          >
            <span>Bounce {result.label}</span>
            <span>{result.points}/{result.maxPoints}</span>
          </span>
        ))}
      </div>
    </div>
  )
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
  if (phase === 'ready') return 'ready'
  if (phase === 'opening') return 'watching'
  if (phase === 'turn-reveal') return 'revealing'
  if (phase === 'end-ripple') return 'impact'
  if (phase === 'score-replay') return 'scoring'
  if (phase === 'finished') return 'results'
  if (phase === 'guessing') return 'place predictions'
  return 'results'
}

function getHint(phase: Phase, completedTurns: number) {
  if (phase === 'guessing') return `Click the board to place marker ${completedTurns + 1}. Click again to move it before time runs out.`
  return 'Yellow is your prediction. Green is the actual bounce point.'
}

function getVisibleTime(phase: Phase, stepTime: number, pauseTime: number, finalTargetTime?: number) {
  if (phase === 'ready') {
    return 0
  }

  if (phase === 'end-ripple') {
    return finalTargetTime ?? pauseTime
  }

  if (phase === 'opening' || phase === 'turn-reveal' || phase === 'score-replay' || phase === 'finished') {
    return stepTime
  }

  return pauseTime
}

function scoreTurn(guess: Point | null, target: Bounce, timedOut: boolean, pathLength: number): TurnResult {
  const maxPoints = getBounceMaxScore(pathLength)

  if (!guess) {
    return {
      guess,
      target,
      distance: Infinity,
      pathLength,
      maxPoints,
      points: 0,
      timedOut,
    }
  }

  const distance = getDistance(guess, target)
  return {
    guess,
    target,
    distance,
    pathLength,
    maxPoints,
    points: getNormalizedBounceScore(distance, pathLength, maxPoints),
    timedOut,
  }
}

function getEndlessGuesses(
  results: TurnResult[],
  activeGuess: Point | null,
  phase: Phase,
  visibleTime: number,
): LabeledPoint[] {
  const resultGuesses = results.flatMap((result, index) => {
    if (!result.guess) {
      return []
    }

    const revealed = phase === 'score-replay' || phase === 'finished' || result.target.time <= visibleTime
    return [
      {
        ...result.guess,
        label: index + 1,
        score: getScoreRatio(result),
        tone: revealed ? undefined : 'tentative' as const,
      },
    ]
  })
  if (phase === 'score-replay' || phase === 'finished') {
    return resultGuesses
  }
  return activeGuess ? [...resultGuesses, { ...activeGuess, label: results.length + 1, tone: 'tentative' }] : resultGuesses
}

function getEndlessTargets(results: TurnResult[], phase: Phase, visibleTime: number) {
  return results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => phase === 'finished' || result.target.time <= visibleTime)
    .map(({ result, index }) => ({
      ...result.target,
      label: index + 1,
    }))
}

function getVisibleScoreResults(results: TurnResult[], phase: Phase, visibleTime: number): LabeledTurnResult[] {
  return results
    .map((result, index) => ({ ...result, label: index + 1 }))
    .filter((result) => phase !== 'score-replay' || result.target.time <= visibleTime)
}

function getAnimatedReplayScore(results: TurnResult[], replayTime: number) {
  return results.reduce((total, result) => {
    if (replayTime < result.target.time) {
      return total
    }

    const countUpProgress = Math.min(1, (replayTime - result.target.time) / 0.45)
    const easedProgress = 1 - Math.pow(1 - countUpProgress, 3)
    return total + Math.round(result.points * easedProgress)
  }, 0)
}

function getNormalizedBounceScore(distance: number, pathLength: number, maxPoints: number) {
  if (!Number.isFinite(distance)) {
    return 0
  }

  const tolerance = clamp(pathLength * scoreDistanceFactor, minimumScoreTolerance, maximumScoreTolerance)
  return Math.round(maxPoints * Math.exp(-((distance / tolerance) ** 2)))
}

function getBounceMaxScore(pathLength: number) {
  const progress = Math.log1p(Math.max(0, pathLength) / maxScoreLogScale) / Math.log1p(4)
  return Math.round(minimumBounceMaxScore + (maximumBounceMaxScore - minimumBounceMaxScore) * clamp(progress, 0, 1))
}

function getGuessColors(tone: GuessTone | undefined, score = 0.65) {
  if (tone === 'tentative') {
    return {
      stroke: '#94a3b8',
      text: '#e2e8f0',
    }
  }

  return {
    stroke: getScoreColor(score),
    text: '#f8fafc',
  }
}

function getTurnSeconds(turnIndex: number) {
  return Math.max(endlessMinimumSeconds, endlessStartSeconds - turnIndex * endlessTimerDecay)
}

function getRevealSpeedMultiplier(turnIndex: number) {
  return 1 + turnIndex * 0.1
}

function shouldEndRun(results: TurnResult[], hasNextBounce: boolean) {
  if (!hasNextBounce) {
    return true
  }

  return getEndlessMisses(results) >= endlessLives
}

function getEndlessMisses(results: TurnResult[]) {
  return results.filter((result) => result.points <= 0).length
}

function formatScore(score: number, maxScore: number | null) {
  return maxScore === null ? String(score) : `${score}/${maxScore}`
}

function getScoreStyle(points: number, maxPoints = 100) {
  return {
    color: getScoreColor(maxPoints > 0 ? points / maxPoints : 0),
  }
}

function getScoreColor(scoreRatio: number) {
  if (scoreRatio <= 0) {
    return '#ff3b5f'
  }

  const progress = clamp(scoreRatio, 0, 1)
  const red = interpolate(250, 34, progress)
  const green = interpolate(204, 211, progress)
  const blue = interpolate(21, 238, progress)
  return `rgb(${red}, ${green}, ${blue})`
}

function getScoreRatio(result: TurnResult) {
  return result.maxPoints > 0 ? result.points / result.maxPoints : 0
}

function getPredictionMaxScore(results: TurnResult[]) {
  return results.reduce((total, result) => total + result.maxPoints, 0)
}

function getTrajectoryDistance(samples: DrawOptions['samples'], fromTime: number, toTime: number) {
  if (toTime <= fromTime) {
    return 0
  }

  const fromState = getStateAtFast(samples, fromTime)
  const toState = getStateAtFast(samples, toTime)
  const startIndex = getSampleIndexAtOrAfter(samples, fromTime)
  const endIndex = getSampleIndexAtOrBefore(samples, toTime)
  let distance = 0
  let previous = fromState

  for (let index = startIndex; index <= endIndex; index += 1) {
    distance += getDistance(previous, samples[index])
    previous = samples[index]
  }

  return distance + getDistance(previous, toState)
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function interpolate(start: number, end: number, progress: number) {
  return Math.round(start + (end - start) * progress)
}

function getImpactAge(bounces: Bounce[], time: number) {
  const recentBounce = bounces.findLast((bounce) => bounce.time <= time)

  if (!recentBounce) {
    return null
  }

  const age = time - recentBounce.time
  return age <= 0.18 ? age : null
}

function playBounceSound(audioContext: AudioContext | null, source: Bounce['source']) {
  if (!audioContext) {
    return
  }

  if (audioContext.state === 'suspended') {
    void audioContext.resume().then(() => playBounceSound(audioContext, source))
    return
  }

  if (audioContext.state !== 'running') {
    return
  }

  const now = audioContext.currentTime
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  const filter = audioContext.createBiquadFilter()
  const startFrequency = source === 'wall' ? 270 : 360

  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(startFrequency, now)
  oscillator.frequency.exponentialRampToValueAtTime(startFrequency * 0.46, now + 0.09)

  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1400, now)
  filter.frequency.exponentialRampToValueAtTime(420, now + 0.11)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)

  oscillator.connect(filter)
  filter.connect(gain)
  gain.connect(audioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.14)
}

function playPlaceSound(audioContext: AudioContext | null) {
  if (!audioContext) {
    return
  }

  if (audioContext.state === 'suspended') {
    void audioContext.resume().then(() => playPlaceSound(audioContext))
    return
  }

  if (audioContext.state !== 'running') {
    return
  }

  const now = audioContext.currentTime
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(660, now)
  oscillator.frequency.exponentialRampToValueAtTime(420, now + 0.045)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.045, now + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)

  oscillator.connect(gain)
  gain.connect(audioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.08)
}

function getDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

export default App


