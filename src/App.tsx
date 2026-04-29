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

type GameMode = 'classic' | 'one-bounce'
type Phase = 'preview' | 'guessing' | 'replay' | 'scored' | 'ready' | 'opening' | 'turn-reveal' | 'finished'
type TurnResult = {
  guess: Point | null
  target: Bounce
  distance: number
  points: number
  timedOut: boolean
}

const replayDuration = 7.2
const boardAccent = '#67e8f9'
const rippleSettleDuration = 2.45
const defaultTurnCount = 5
const maximumTurnCount = 12
const defaultGuessSeconds = 10

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const lastSoundBounceRef = useRef(-1)
  const replayStartedAt = useRef<number | null>(null)
  const stepAnimationStartedAt = useRef<number | null>(null)
  const stepAnimationFromTime = useRef(0)
  const stepAnimationToTime = useRef(0)
  const guessTimerStartedAt = useRef<number | null>(null)
  const [currentScene, setCurrentScene] = useState(scene)
  const [generatorConfig, setGeneratorConfig] = useState(defaultGeneratorConfig)
  const [mode, setMode] = useState<GameMode>('one-bounce')
  const [phase, setPhase] = useState<Phase>('ready')
  const [previewTime, setPreviewTime] = useState(0)
  const [replayTime, setReplayTime] = useState(0)
  const [stepTime, setStepTime] = useState(0)
  const [bounceLimit, setBounceLimit] = useState(defaultPredictionCount)
  const [turnCount, setTurnCount] = useState(defaultTurnCount)
  const [guessSeconds, setGuessSeconds] = useState(defaultGuessSeconds)
  const [timerRemaining, setTimerRemaining] = useState(defaultGuessSeconds)
  const [activeGuess, setActiveGuess] = useState<Point | null>(null)
  const [turnIndex, setTurnIndex] = useState(0)
  const [pauseBounceIndex, setPauseBounceIndex] = useState(0)
  const [turnResults, setTurnResults] = useState<TurnResult[]>([])
  const [guesses, setGuesses] = useState<Point[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [renderRevision, setRenderRevision] = useState(0)

  const simulation = useMemo(() => simulateTrajectory(currentScene), [currentScene])
  const openingBounceIndex = useMemo(
    () => Math.max(0, simulation.bounces.findIndex((bounce) => bounce.time > observeDuration)),
    [simulation.bounces],
  )
  const targetBounces = useMemo(
    () => getUpcomingBounces(simulation.bounces, observeDuration, bounceLimit),
    [bounceLimit, simulation],
  )
  const oneBounceTarget = simulation.bounces[pauseBounceIndex + 1]
  const oneBouncePauseTime = simulation.bounces[pauseBounceIndex]?.time ?? 0
  const oneBounceScore = turnResults.reduce((total, result) => total + result.points, 0)
  const oneBounceMaxScore = turnCount * 100
  const finalTarget = targetBounces[targetBounces.length - 1]
  const revealedTime =
    mode === 'one-bounce'
      ? getOneBounceVisibleTime(phase, stepTime, oneBouncePauseTime)
      : phase === 'preview'
        ? previewTime
        : phase === 'replay' || phase === 'scored'
          ? Math.min(replayTime, finalTarget?.time ?? replayTime)
          : observeDuration
  const rippleAge =
    mode === 'classic' && (phase === 'replay' || phase === 'scored') && finalTarget && replayTime >= finalTarget.time
      ? replayTime - finalTarget.time
      : null
  const score = mode === 'classic' && phase === 'scored' ? getTotalScore(guesses, targetBounces) : null
  const scoringRows = mode === 'classic' && phase === 'scored' ? scoreGuesses(guesses, targetBounces) : []
  const maxScore = mode === 'one-bounce' ? oneBounceMaxScore : targetBounces.length * 100
  const displayScore = mode === 'one-bounce' ? oneBounceScore : score
  const visibleGuesses = mode === 'one-bounce' ? getOneBounceGuesses(turnResults, activeGuess) : guesses
  const visibleTargets = mode === 'one-bounce' ? getOneBounceTargets(turnResults, phase, revealedTime) : targetBounces

  const resetRound = useCallback(() => {
    replayStartedAt.current = null
    stepAnimationStartedAt.current = null
    guessTimerStartedAt.current = null
    setActiveGuess(null)
    setTurnIndex(0)
    setTurnResults([])
    setTimerRemaining(guessSeconds)
    setPauseBounceIndex(openingBounceIndex)
    setStepTime(0)
    setGuesses([])
    setReplayTime(0)
    setPreviewTime(0)
    setPhase(mode === 'one-bounce' ? 'ready' : 'preview')
  }, [guessSeconds, mode, openingBounceIndex])

  const randomizeRound = useCallback(() => {
    replayStartedAt.current = null
    stepAnimationStartedAt.current = null
    guessTimerStartedAt.current = null
    const requiredBounces = mode === 'one-bounce' ? turnCount + 1 : bounceLimit
    setCurrentScene(generateRandomScene(generatorConfig, requiredBounces))
    setActiveGuess(null)
    setTurnIndex(0)
    setTurnResults([])
    setTimerRemaining(guessSeconds)
    setPauseBounceIndex(0)
    setStepTime(0)
    setGuesses([])
    setReplayTime(0)
    setPreviewTime(0)
    setPhase(mode === 'one-bounce' ? 'ready' : 'preview')
  }, [bounceLimit, generatorConfig, guessSeconds, mode, turnCount])

  const updateGeneratorConfig = useCallback((key: keyof GeneratorConfig, value: number) => {
    setGeneratorConfig((current) => ({
      ...current,
      [key]: value,
    }))
  }, [])

  const enableAudio = useCallback(() => {
    audioContextRef.current ??= new AudioContext()

    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume()
    }
  }, [])

  const lockIn = useCallback(() => {
    if (mode === 'one-bounce') {
      if (phase !== 'guessing' || !activeGuess || !oneBounceTarget) {
        return
      }

      setTurnResults((current) => [...current, scoreOneBounceTurn(activeGuess, oneBounceTarget, false)])
      setActiveGuess(null)
      stepAnimationStartedAt.current = null
      stepAnimationFromTime.current = oneBouncePauseTime
      stepAnimationToTime.current = oneBounceTarget.time
      guessTimerStartedAt.current = null
      setStepTime(oneBouncePauseTime)
      setPhase('turn-reveal')
      return
    }

    if (guesses.length === 0) {
      return
    }

    replayStartedAt.current = null
    setReplayTime(0)
    setPhase('replay')
  }, [activeGuess, guesses.length, mode, oneBouncePauseTime, oneBounceTarget, phase])

  const startOneBounceGame = useCallback(() => {
    if (!simulation.bounces[openingBounceIndex]) {
      return
    }

    enableAudio()
    setActiveGuess(null)
    setTurnIndex(0)
    setTurnResults([])
    setTimerRemaining(guessSeconds)
    setPauseBounceIndex(openingBounceIndex)
    stepAnimationStartedAt.current = null
    stepAnimationFromTime.current = 0
    stepAnimationToTime.current = simulation.bounces[openingBounceIndex].time
    setStepTime(0)
    setPhase('opening')
  }, [enableAudio, guessSeconds, openingBounceIndex, simulation.bounces])

  const finishOneBounceTimeout = useCallback(() => {
    if (mode !== 'one-bounce' || phase !== 'guessing' || !oneBounceTarget) {
      return
    }

    setTurnResults((current) => [...current, scoreOneBounceTurn(null, oneBounceTarget, true)])
    setActiveGuess(null)
    stepAnimationStartedAt.current = null
    stepAnimationFromTime.current = oneBouncePauseTime
    stepAnimationToTime.current = oneBounceTarget.time
    guessTimerStartedAt.current = null
    setStepTime(oneBouncePauseTime)
    setPhase('turn-reveal')
  }, [mode, oneBouncePauseTime, oneBounceTarget, phase])

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

  const handleModeChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextMode = event.target.value as GameMode
      setMode(nextMode)
      replayStartedAt.current = null
      stepAnimationStartedAt.current = null
      guessTimerStartedAt.current = null
      setActiveGuess(null)
      setTurnIndex(0)
      setTurnResults([])
      setTimerRemaining(guessSeconds)
      setPauseBounceIndex(openingBounceIndex)
      setStepTime(0)
      setGuesses([])
      setReplayTime(0)
      setPreviewTime(0)
      setPhase(nextMode === 'one-bounce' ? 'ready' : 'preview')
    },
    [guessSeconds, openingBounceIndex],
  )

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (phase !== 'guessing') {
        return
      }

      const canvas = event.currentTarget
      const rect = canvas.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * currentScene.width
      const y = ((event.clientY - rect.top) / rect.height) * currentScene.height

      if (mode === 'one-bounce') {
        setActiveGuess({ x, y })
        return
      }

      if (guesses.length >= targetBounces.length) {
        return
      }

      setGuesses((current) => [...current, { x, y }])
    },
    [currentScene.height, currentScene.width, guesses.length, mode, phase, targetBounces.length],
  )

  const undoGuess = useCallback(() => {
    if (mode === 'one-bounce') {
      setActiveGuess(null)
      return
    }

    setGuesses((current) => current.slice(0, -1))
  }, [mode])

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

    if (mode === 'classic' && phase === 'preview') {
      lastSoundBounceRef.current = -1
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

    if (mode === 'classic' && phase === 'replay') {
      lastSoundBounceRef.current = -1
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

    if (mode === 'one-bounce' && (phase === 'opening' || phase === 'turn-reveal')) {
      lastSoundBounceRef.current = phase === 'opening' ? -1 : pauseBounceIndex

      const tick = (now: number) => {
        stepAnimationStartedAt.current ??= now
        const elapsed = (now - stepAnimationStartedAt.current) / 1000
        const fromTime = stepAnimationFromTime.current
        const toTime = stepAnimationToTime.current
        const nextTime = Math.min(toTime, fromTime + elapsed)
        setStepTime(nextTime)

        if (nextTime >= toTime) {
          stepAnimationStartedAt.current = null

          if (phase === 'opening') {
            setPauseBounceIndex(openingBounceIndex)
            setTimerRemaining(guessSeconds)
            guessTimerStartedAt.current = null
            setPhase('guessing')
          } else {
            const nextPauseIndex = pauseBounceIndex + 1
            const completedTurns = turnIndex + 1
            setPauseBounceIndex(nextPauseIndex)
            setActiveGuess(null)

            if (completedTurns >= turnCount || !simulation.bounces[nextPauseIndex + 1]) {
              setPhase('finished')
            } else {
              setTurnIndex(completedTurns)
              setTimerRemaining(guessSeconds)
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

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [guessSeconds, mode, openingBounceIndex, pauseBounceIndex, phase, simulation.bounces, targetBounces, turnCount, turnIndex])

  useEffect(() => {
    if (phase !== 'preview' && phase !== 'replay' && phase !== 'opening' && phase !== 'turn-reveal') {
      return
    }

    const currentBounceIndex = simulation.bounces.findLastIndex((bounce) => bounce.time <= revealedTime)
    if (currentBounceIndex > lastSoundBounceRef.current) {
      const bounce = simulation.bounces[currentBounceIndex]
      lastSoundBounceRef.current = currentBounceIndex

      if (bounce && revealedTime - bounce.time < 0.05) {
        playBounceSound(audioContextRef.current, bounce.source)
      }
    }
  }, [phase, revealedTime, simulation.bounces])

  useEffect(() => {
    if (mode !== 'one-bounce' || phase !== 'guessing') {
      return
    }

    let timerFrame = 0
    guessTimerStartedAt.current = performance.now()

    const tick = (now: number) => {
      const startedAt = guessTimerStartedAt.current ?? now
      const remaining = Math.max(0, guessSeconds - (now - startedAt) / 1000)
      setTimerRemaining(remaining)

      if (remaining <= 0) {
        finishOneBounceTimeout()
        return
      }

      timerFrame = requestAnimationFrame(tick)
    }

    timerFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(timerFrame)
  }, [finishOneBounceTimeout, guessSeconds, mode, phase, turnIndex])

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
            {mode === 'one-bounce' ? `Turn ${Math.min(turnIndex + 1, turnCount)}/${turnCount}` : `${guesses.length}/${targetBounces.length}`}
          </strong>
          {mode === 'one-bounce' && phase === 'guessing' && <span>{timerRemaining.toFixed(1)}s</span>}
          {displayScore !== null && <span>{displayScore}/{maxScore}</span>}
        </div>

        {mode === 'one-bounce' && phase === 'ready' && (
          <div className="play-overlay">
            <button type="button" onClick={startOneBounceGame}>
              Play
            </button>
          </div>
        )}

        <label className="mode-select-shell">
          <span>Mode</span>
          <select value={mode} onChange={handleModeChange} disabled={phase === 'replay' || phase === 'opening' || phase === 'turn-reveal'}>
            <option value="one-bounce">One Bounce Ahead</option>
            <option value="classic">Classic</option>
          </select>
        </label>

        <div className="action-bar">
          <button
            type="button"
            onClick={() => {
              enableAudio()
              lockIn()
            }}
            disabled={phase !== 'guessing' || (mode === 'one-bounce' ? !activeGuess : guesses.length === 0)}
          >
            {mode === 'one-bounce' ? 'Lock guess' : 'Lock guesses'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={undoGuess}
            disabled={phase !== 'guessing' || (mode === 'one-bounce' ? !activeGuess : guesses.length === 0)}
          >
            Undo
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
          {helpOpen && (
            <div className="help-popover">
              Watch the ball and predict its next {mode === 'one-bounce' ? 1 : targetBounces.length} bounces.
              Customize your game in settings. Beta / demo version.
            </div>
          )}
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
                <span>{mode === 'one-bounce' ? 'Turn' : 'Markers'}</span>
                <strong>
                  {mode === 'one-bounce' ? `${Math.min(turnIndex + 1, turnCount)}/${turnCount}` : `${guesses.length}/${targetBounces.length}`}
                </strong>
              </div>

              {mode === 'classic' ? (
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
              ) : (
                <div className="settings-grid">
                  <label className="select-field">
                    <span>Turns</span>
                    <select
                      value={turnCount}
                      onChange={(event) => {
                        setTurnCount(Number(event.target.value))
                        resetRound()
                      }}
                      disabled={phase === 'opening' || phase === 'turn-reveal'}
                    >
                      {Array.from({ length: maximumTurnCount }, (_, index) => index + 1).map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="select-field">
                    <span>Timer</span>
                    <select
                      value={guessSeconds}
                      onChange={(event) => {
                        setGuessSeconds(Number(event.target.value))
                        setTimerRemaining(Number(event.target.value))
                        resetRound()
                      }}
                      disabled={phase === 'opening' || phase === 'turn-reveal'}
                    >
                      {[3, 5, 8, 10, 12, 15, 20, 30].map((seconds) => (
                        <option key={seconds} value={seconds}>
                          {seconds}s
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

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

              {mode === 'one-bounce' && (
                <div className="score-card">
                  <p className="eyebrow">score</p>
                  <strong>
                    {oneBounceScore}/{oneBounceMaxScore}
                  </strong>
                  {turnResults.map((result, index) => (
                    <span key={`${result.target.time}-${index}`}>
                      Turn {index + 1}: {result.timedOut ? 'timeout' : `${Math.round(result.distance)}px`} · {result.points} pts
                    </span>
                  ))}
                </div>
              )}

              {mode === 'classic' && score !== null && (
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
  if (phase === 'ready') return 'ready'
  if (phase === 'opening') return 'watching'
  if (phase === 'turn-reveal') return 'revealing'
  if (phase === 'finished') return 'results'
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

function getOneBounceVisibleTime(phase: Phase, stepTime: number, pauseTime: number) {
  if (phase === 'ready') {
    return 0
  }

  if (phase === 'opening' || phase === 'turn-reveal') {
    return stepTime
  }

  return pauseTime
}

function scoreOneBounceTurn(guess: Point | null, target: Bounce, timedOut: boolean): TurnResult {
  if (!guess || timedOut) {
    return {
      guess,
      target,
      distance: Infinity,
      points: 0,
      timedOut,
    }
  }

  const distance = getDistance(guess, target)
  return {
    guess,
    target,
    distance,
    points: Math.max(0, Math.round(100 - distance * 0.85)),
    timedOut,
  }
}

function getOneBounceGuesses(results: TurnResult[], activeGuess: Point | null) {
  const resultGuesses = results.flatMap((result) => (result.guess ? [result.guess] : []))
  return activeGuess ? [...resultGuesses, activeGuess] : resultGuesses
}

function getOneBounceTargets(results: TurnResult[], phase: Phase, visibleTime: number) {
  return results
    .filter((result) => phase === 'finished' || result.target.time <= visibleTime)
    .map((result) => result.target)
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
  if (!audioContext || audioContext.state !== 'running') {
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

function getDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

export default App


