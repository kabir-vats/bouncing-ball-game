import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { Analytics } from '@vercel/analytics/react'
import {
  type ChallengeRecord,
  createChallenge,
  getChallenge,
  getChallengeUrl,
  submitChallengeScore,
} from './challenges'
import { type DailyRecord, getDaily, getDailyDateKey, getDailyUrl, submitDailyScore } from './dailies'
import {
  type Bounce,
  type GameScene,
  type Point,
  boardCollisionInset,
  createRandomSeed,
  defaultGeneratorConfig,
  generateRandomScene,
  observeDuration,
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
type Theme = 'sky' | 'night'
type TrailSegment = {
  from: Point
  to: Point
  startTime: number
  endTime: number
}
type ThemePalette = {
  backgroundTop: string
  backgroundBottom: string
  border: string
  grid: string
  trail: string
  ripple: string
  obstacleStroke: string
  ball: string
  ballFlash: string
  ballGlow: string
  timerFill: string
  timerStroke: string
}
type DragState = {
  origin: Point
  pointerId: number
  start: Point
}
type BoardState = {
  scene: GameScene
  seed: number
  source: 'challenge' | 'daily' | 'random' | 'url'
}
type ChallengeAttemptStatus = 'fresh' | 'started' | 'submitted'
type DailyAttemptStatus = ChallengeAttemptStatus
type TutorialTipKey = 'firstPrediction' | 'firstScore' | 'longPath' | 'firstMiss' | 'finishedRun'
type TutorialTip = {
  key: TutorialTipKey
  text: string
}

const rippleSettleDuration = 2.45
const endlessStartSeconds = 5
const endlessMinimumSeconds = 1
const endlessGenerationBounces = 18
const endlessLives = 3
const finalLoopDuration = 180
const scoreDistanceFactor = 0.18
const minimumScoreTolerance = 28
const maximumScoreTolerance = 120
const minimumBounceMaxScore = 25
const maximumBounceMaxScore = 200
const maxScoreLogScale = 420
const localHighScoreKey = 'bounce-call.local-best'
const playerIdKey = 'bounce-call.player-id'
const playerInitialsKey = 'bounce-call.player-initials'
const challengeAttemptPrefix = 'bounce-call.challenge-attempt.'
const dailyAttemptPrefix = 'bounce-call.daily-attempt.'
const dailyStreakKey = 'bounce-call.daily-streak'
const tutorialStoragePrefix = 'bounce-call.tutorial.'
const seedQueryParam = 'seed'
const challengeQueryParam = 'challenge'
const dailyQueryParam = 'daily'
const initialsPlaceholder = 'YOU'
const gameOverMessages = [
  'Boing Boing Boing Boing Boing',
  'Accurate Physics Verified™',
  "Those corners don't seem fair, do they?",
  "Keep going. You can do it. Don't quit... Inspired?",
  'For Sale. Bouncing Ball. Unpredictable.',
  'Did you remember to bring your protractor?',
  "Hey, it's me. I'm the ball! They told me if you score higher than 1000 they'll let me out of here.",
  "Frankly, my ball, I don't give a bounce",
  "After all, what's a life, anyway? We're born, we bounce for a little while, we die",
  "Chaos isn't a pit. Chaos is a ladder",
  "I could die for you. But I couldn't, and wouldn't, bounce for you.",
  'It was the best of spheres, it was the worst of spheres.',
  'To bounce or not to bounce...',
  'This is the way the world ends. Not with a bang, but with a "BOING"',
  "Three lives isn't enough? Please file a petition at your local office, we hope to respond within 40 business days.",
  'We are all in the gutter, but some of us are looking at the balls.',
  "Here's to the fools who bounce.",
  'City of balls, are you bouncing just for me?',
  'Elite Ball Knowledge',
]

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
  const timerRemainingRef = useRef(endlessStartSeconds)
  const finishedLoopAbsoluteTimeRef = useRef(0)
  const finalScoreDragRef = useRef<DragState | null>(null)
  const runBestBeforeRef = useRef(0)
  const recordedFinishedScoreRef = useRef<string | null>(null)
  const autoSubmittedChallengeRef = useRef<string | null>(null)
  const autoSubmittedDailyRef = useRef<string | null>(null)
  const [board, setBoard] = useState<BoardState>(() => createInitialBoard())
  const currentScene = board.scene
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
  const [paused, setPaused] = useState(document.hidden)
  const [theme, setTheme] = useState<Theme>('night')
  const [muted, setMuted] = useState(false)
  const [finalScoreOffset, setFinalScoreOffset] = useState<Point>({ x: 0, y: 0 })
  const [renderRevision, setRenderRevision] = useState(0)
  const [boardRotated, setBoardRotated] = useState(() => isPortraitBoardLayout())
  const [localHighScore, setLocalHighScore] = useState(() => readLocalHighScore())
  const [finalMessage, setFinalMessage] = useState('')
  const [activeTip, setActiveTip] = useState<TutorialTip | null>(null)
  const [playerId] = useState(() => readPlayerId())
  const [playerInitials, setPlayerInitials] = useState(() => readPlayerInitials())
  const [activeChallengeSlug, setActiveChallengeSlug] = useState(() => getChallengeSlugFromAddress())
  const [challenge, setChallenge] = useState<ChallengeRecord | null>(null)
  const [challengeLoading, setChallengeLoading] = useState(() => Boolean(getChallengeSlugFromAddress()))
  const [challengeError, setChallengeError] = useState('')
  const [challengeActionBusy, setChallengeActionBusy] = useState(false)
  const [challengeCopied, setChallengeCopied] = useState(false)
  const [challengePanelOpen, setChallengePanelOpen] = useState(false)
  const [challengeAttemptStatus, setChallengeAttemptStatus] = useState<ChallengeAttemptStatus>(() =>
    getChallengeSlugFromAddress() ? readChallengeAttemptStatus(getChallengeSlugFromAddress() ?? '') : 'fresh',
  )
  const [daily, setDaily] = useState<DailyRecord | null>(null)
  const [activeDailyDate, setActiveDailyDate] = useState<string | null>(() => getDailyDateFromAddress())
  const [dailyLoading, setDailyLoading] = useState(() => Boolean(getDailyDateFromAddress()))
  const [dailyError, setDailyError] = useState('')
  const [dailyActionBusy, setDailyActionBusy] = useState(false)
  const [dailyCopied, setDailyCopied] = useState(false)
  const [dailyAttemptStatus, setDailyAttemptStatus] = useState<DailyAttemptStatus>(() =>
    getDailyDateFromAddress() ? readDailyAttemptStatus(getDailyDateFromAddress() ?? '') : 'fresh',
  )
  const [dailyStreak, setDailyStreak] = useState(() => readDailyStreak())

  const simulation = useMemo(() => simulateTrajectory(currentScene, finalLoopDuration), [currentScene])
  const trailSegments = useMemo(() => getTrailSegments(simulation.samples), [simulation.samples])
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
  const challengeShareUrl = challenge ? getChallengeUrl(challenge.slug) : ''
  const dailyShareUrl = activeDailyDate ? getDailyUrl(activeDailyDate) : ''
  const playDueBounceSounds = useCallback(
    (time: number) => {
      if (time < lastSoundTimeRef.current) {
        lastSoundBounceRef.current = -1
      }
      lastSoundTimeRef.current = time

      const currentBounceIndex = getBounceIndexAtOrBefore(simulation.bounces, time)
      for (let index = lastSoundBounceRef.current + 1; index <= currentBounceIndex; index += 1) {
        const bounce = simulation.bounces[index]
        if (bounce && !muted) {
          playBounceSound(audioContextRef.current, bounce.source)
        }
      }
      lastSoundBounceRef.current = Math.max(lastSoundBounceRef.current, currentBounceIndex)
    },
    [muted, simulation.bounces],
  )

  const startNewRound = useCallback(() => {
    const nextSeed = createRandomSeed()
    stepAnimationStartedAt.current = null
    guessTimerStartedAt.current = null
    activeGuessRef.current = null
    finishedLoopStartTime.current = 0
    finishedLoopAbsoluteTimeRef.current = 0
    lastSoundBounceRef.current = -1
    lastSoundTimeRef.current = 0
    recordedFinishedScoreRef.current = null
    autoSubmittedChallengeRef.current = null
    autoSubmittedDailyRef.current = null
    setBoard({
      scene: generateRandomScene(defaultGeneratorConfig, endlessGenerationBounces, nextSeed),
      seed: nextSeed,
      source: 'random',
    })
    setActiveGuess(null)
    setTurnIndex(0)
    setTurnResults([])
    setHighlightedBounce(null)
    setTimerRemaining(endlessStartSeconds)
    setPauseBounceIndex(0)
    setStepTime(0)
    setFinalTrailTime(0)
    setFinalScoreOffset({ x: 0, y: 0 })
    setFinalMessage('')
    setActiveChallengeSlug(null)
    setChallenge(null)
    setChallengeError('')
    setChallengeCopied(false)
    setChallengePanelOpen(false)
    setChallengeAttemptStatus('fresh')
    setDaily(null)
    setActiveDailyDate(null)
    setDailyError('')
    setDailyActionBusy(false)
    setDailyCopied(false)
    setDailyAttemptStatus('fresh')
    setPhase('ready')
    clearSeedFromAddress()
    clearChallengeFromAddress()
    clearDailyFromAddress()
  }, [])

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

  const skipScoringReplay = useCallback(() => {
    const finishedAt = turnResults[turnResults.length - 1]?.target.time + 0.8 || stepAnimationToTime.current

    stepAnimationStartedAt.current = null
    finishedLoopStartTime.current = finishedAt
    finishedLoopAbsoluteTimeRef.current = finishedAt
    setStepTime(finishedAt)
    setFinalTrailTime(finishedAt)
    setPhase('finished')
  }, [turnResults])

  const handleFinalScorePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest('button, .score-breakdown, .score-line')) {
        return
      }

      finalScoreDragRef.current = {
        origin: finalScoreOffset,
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [finalScoreOffset],
  )

  const handleFinalScorePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = finalScoreDragRef.current

    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    setFinalScoreOffset({
      x: drag.origin.x + event.clientX - drag.start.x,
      y: drag.origin.y + event.clientY - drag.start.y,
    })
  }, [])

  const handleFinalScorePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (finalScoreDragRef.current?.pointerId === event.pointerId) {
      finalScoreDragRef.current = null
    }
  }, [])

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

    if (activeChallengeSlug) {
      const initials = normalizeInitials(playerInitials)
      if (!isAllowedInitials(initials)) {
        setChallengeError(getInitialsError(initials))
        return
      }

      if (challengeAttemptStatus !== 'fresh') {
        return
      }

      writePlayerInitials(initials)
      setPlayerInitials(initials)
      setChallengeError('')
      writeChallengeAttemptStatus(activeChallengeSlug, 'started')
      setChallengeAttemptStatus('started')
    }

    if (activeDailyDate) {
      const initials = normalizeInitials(playerInitials)
      if (!isAllowedInitials(initials)) {
        setDailyError(getInitialsError(initials))
        return
      }

      if (dailyAttemptStatus !== 'fresh') {
        return
      }

      writePlayerInitials(initials)
      setPlayerInitials(initials)
      setDailyError('')
      writeDailyAttemptStatus(activeDailyDate, 'started')
      setDailyAttemptStatus('started')
    }

    enableAudio()
    runBestBeforeRef.current = localHighScore
    recordedFinishedScoreRef.current = null
    autoSubmittedChallengeRef.current = null
    autoSubmittedDailyRef.current = null
    activeGuessRef.current = null
    finishedLoopAbsoluteTimeRef.current = 0
    lastSoundBounceRef.current = -1
    lastSoundTimeRef.current = 0
    setActiveGuess(null)
    setTurnIndex(0)
    setTurnResults([])
    setHighlightedBounce(null)
    setTimerRemaining(endlessStartSeconds)
    setPauseBounceIndex(openingBounceIndex)
    setFinalMessage('')
    setChallengePanelOpen(false)
    stepAnimationStartedAt.current = null
    stepAnimationFromTime.current = 0
    stepAnimationToTime.current = simulation.bounces[openingBounceIndex].time
    setStepTime(0)
    setFinalTrailTime(0)
    setPhase('opening')
  }, [
    activeChallengeSlug,
    challengeAttemptStatus,
    activeDailyDate,
    dailyAttemptStatus,
    enableAudio,
    localHighScore,
    openingBounceIndex,
    playerInitials,
    simulation.bounces,
  ])

  const createChallengeFromRun = useCallback(() => {
    const initials = normalizeInitials(playerInitials)
    if (!isAllowedInitials(initials)) {
      setChallengeError(getInitialsError(initials))
      return
    }

    setChallengeActionBusy(true)
    setChallengeError('')
    writePlayerInitials(initials)
    setPlayerInitials(initials)

    void createChallenge({
      creatorInitials: initials,
      maxScore,
      playerId,
      score: totalScore,
      seed: board.seed,
      turns: serializeTurns(turnResults),
    }).then((nextChallenge) => {
      setChallenge(nextChallenge)
      setActiveChallengeSlug(nextChallenge.slug)
      setBoard((current) => ({ ...current, source: 'challenge' }))
      writeChallengeAttemptStatus(nextChallenge.slug, 'submitted')
      setChallengeAttemptStatus('submitted')
      const url = getChallengeUrl(nextChallenge.slug)
      void copyText(url, 'Challenge link')
      setChallengeCopied(true)
      window.setTimeout(() => setChallengeCopied(false), 1800)
      setChallengeActionBusy(false)
      pushChallengeAddress(nextChallenge.slug)
    }).catch((error: unknown) => {
      setChallengeError(error instanceof Error ? error.message : 'Could not create challenge.')
      setChallengeActionBusy(false)
    })
  }, [board.seed, maxScore, playerId, playerInitials, totalScore, turnResults])

  const openDailyChallenge = useCallback(() => {
    const date = getDailyDateKey()
    setActiveChallengeSlug(null)
    setChallenge(null)
    setChallengeError('')
    setChallengePanelOpen(false)
    setChallengeAttemptStatus('fresh')
    setActiveDailyDate(date)
    setDailyLoading(true)
    setDailyError('')
    clearChallengeFromAddress()
    clearSeedFromAddress()
    pushDailyAddress(date)
  }, [])

  const submitCurrentChallengeScore = useCallback(() => {
    if (!activeChallengeSlug) {
      return
    }

    if (challengeActionBusy || challengeAttemptStatus === 'submitted') {
      return
    }

    const initials = normalizeInitials(playerInitials)
    if (!isAllowedInitials(initials)) {
      setChallengeError(getInitialsError(initials))
      return
    }

    setChallengeActionBusy(true)
    setChallengeError('')
    writePlayerInitials(initials)
    setPlayerInitials(initials)

    void submitChallengeScore(activeChallengeSlug, {
      initials,
      maxScore,
      playerId,
      score: totalScore,
      turns: serializeTurns(turnResults),
    }).then((nextChallenge) => {
      setChallenge(nextChallenge)
      writeChallengeAttemptStatus(activeChallengeSlug, 'submitted')
      setChallengeAttemptStatus('submitted')
      setChallengeActionBusy(false)
    }).catch((error: unknown) => {
      setChallengeError(error instanceof Error ? error.message : 'Could not submit score.')
      setChallengeActionBusy(false)
    })
  }, [
    activeChallengeSlug,
    challengeActionBusy,
    challengeAttemptStatus,
    maxScore,
    playerId,
    playerInitials,
    totalScore,
    turnResults,
  ])

  const submitCurrentDailyScore = useCallback(() => {
    if (!activeDailyDate) {
      return
    }

    if (dailyActionBusy || dailyAttemptStatus === 'submitted') {
      return
    }

    const initials = normalizeInitials(playerInitials)
    if (!isAllowedInitials(initials)) {
      setDailyError(getInitialsError(initials))
      return
    }

    setDailyActionBusy(true)
    setDailyError('')
    writePlayerInitials(initials)
    setPlayerInitials(initials)

    void submitDailyScore(activeDailyDate, {
      initials,
      maxScore,
      playerId,
      score: totalScore,
      turns: serializeTurns(turnResults),
    }).then((nextDaily) => {
      setDaily(nextDaily)
      writeDailyAttemptStatus(activeDailyDate, 'submitted')
      setDailyAttemptStatus('submitted')
      setDailyStreak(updateDailyStreak(activeDailyDate))
      setDailyActionBusy(false)
    }).catch((error: unknown) => {
      setDailyError(error instanceof Error ? error.message : 'Could not submit daily score.')
      setDailyActionBusy(false)
    })
  }, [activeDailyDate, dailyActionBusy, dailyAttemptStatus, maxScore, playerId, playerInitials, totalScore, turnResults])

  const copyChallengeLink = useCallback(() => {
    if (!challenge) {
      return
    }

    void copyText(getChallengeUrl(challenge.slug), 'Challenge link')
    setChallengeCopied(true)
    window.setTimeout(() => setChallengeCopied(false), 1800)
  }, [challenge])

  const copyDailyLink = useCallback(() => {
    if (!activeDailyDate) {
      return
    }

    void copyText(getDailyUrl(activeDailyDate), 'Daily challenge link')
    setDailyCopied(true)
    window.setTimeout(() => setDailyCopied(false), 1800)
  }, [activeDailyDate])

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
      const pointerX = (event.clientX - rect.left) / rect.width
      const pointerY = (event.clientY - rect.top) / rect.height
      const x = (boardRotated ? pointerY : pointerX) * currentScene.width
      const y = (boardRotated ? 1 - pointerX : pointerY) * currentScene.height
      if (!muted) {
        playPlaceSound(audioContextRef.current)
      }

      const nextGuess = { x, y }
      activeGuessRef.current = nextGuess
      setActiveGuess(nextGuess)
    },
    [boardRotated, currentScene.height, currentScene.width, muted, phase],
  )

  useEffect(() => {
    activeGuessRef.current = activeGuess
  }, [activeGuess])

  useEffect(() => {
    timerRemainingRef.current = timerRemaining
  }, [timerRemaining])

  useEffect(() => {
    const updatePaused = () => {
      setPaused(document.hidden || !document.hasFocus())
    }

    document.addEventListener('visibilitychange', updatePaused)
    window.addEventListener('blur', updatePaused)
    window.addEventListener('focus', updatePaused)

    return () => {
      document.removeEventListener('visibilitychange', updatePaused)
      window.removeEventListener('blur', updatePaused)
      window.removeEventListener('focus', updatePaused)
    }
  }, [])

  useEffect(() => {
    if (paused) {
      if (phase === 'opening' || phase === 'turn-reveal' || phase === 'end-ripple' || phase === 'score-replay') {
        stepAnimationFromTime.current = stepTime
      }
      if (phase === 'finished') {
        finishedLoopStartTime.current = finishedLoopAbsoluteTimeRef.current
      }
      stepAnimationStartedAt.current = null
      guessTimerStartedAt.current = null
    }
  }, [paused, phase, stepTime])

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
    const mediaQuery = window.matchMedia('(orientation: portrait) and (max-width: 900px)')
    const updateBoardRotation = () => {
      setBoardRotated(mediaQuery.matches)
      setRenderRevision((revision) => revision + 1)
    }

    updateBoardRotation()
    mediaQuery.addEventListener('change', updateBoardRotation)
    window.addEventListener('resize', updateBoardRotation)

    return () => {
      mediaQuery.removeEventListener('change', updateBoardRotation)
      window.removeEventListener('resize', updateBoardRotation)
    }
  }, [])

  useEffect(() => {
    if (paused) {
      return
    }

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
            finishedLoopAbsoluteTimeRef.current = toTime
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
        finishedLoopAbsoluteTimeRef.current = absoluteTime
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
    paused,
    simulation.bounces,
    simulation.samples,
    turnIndex,
    turnResults,
    playDueBounceSounds,
  ])

  useEffect(() => {
    if (phase !== 'guessing' || paused) {
      return
    }

    let timerFrame = 0
    const elapsedBeforePause = Math.max(0, currentTurnSeconds - timerRemainingRef.current)
    guessTimerStartedAt.current = performance.now() - elapsedBeforePause * 1000

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
  }, [currentTurnSeconds, finishTurn, paused, phase, turnIndex])

  useEffect(() => {
    if (!activeChallengeSlug) {
      const timeout = window.setTimeout(() => {
        setChallenge(null)
        setChallengeLoading(false)
        setChallengeError('')
        setChallengeAttemptStatus('fresh')
      }, 0)
      return () => window.clearTimeout(timeout)
    }

    if (challenge?.slug === activeChallengeSlug) {
      const timeout = window.setTimeout(() => {
        setChallengeLoading(false)
        setChallengeAttemptStatus(readChallengeAttemptStatus(activeChallengeSlug))
      }, 0)
      return () => window.clearTimeout(timeout)
    }

    let cancelled = false
    const loadingTimeout = window.setTimeout(() => {
      setChallengeLoading(true)
      setChallengeError('')
    }, 0)

    void getChallenge(activeChallengeSlug).then((loadedChallenge) => {
      if (cancelled) {
        return
      }

      setChallenge(loadedChallenge)
      setBoard({
        scene: generateRandomScene(defaultGeneratorConfig, endlessGenerationBounces, loadedChallenge.seed),
        seed: loadedChallenge.seed,
        source: 'challenge',
      })
      setActiveGuess(null)
      setTurnIndex(0)
      setTurnResults([])
      setHighlightedBounce(null)
      setTimerRemaining(endlessStartSeconds)
      setPauseBounceIndex(0)
      setStepTime(0)
      setFinalTrailTime(0)
      setFinalScoreOffset({ x: 0, y: 0 })
      setFinalMessage('')
      setChallengeAttemptStatus(readChallengeAttemptStatus(activeChallengeSlug))
      setChallengeLoading(false)
      setPhase('ready')
    }).catch((error: unknown) => {
      if (cancelled) {
        return
      }

      setChallengeError(error instanceof Error ? error.message : 'Challenge not found.')
      setChallengeLoading(false)
    })

    return () => {
      cancelled = true
      window.clearTimeout(loadingTimeout)
    }
  }, [activeChallengeSlug, challenge?.slug])

  useEffect(() => {
    if (!activeDailyDate) {
      const timeout = window.setTimeout(() => {
        setDaily(null)
        setDailyLoading(false)
        setDailyError('')
        setDailyAttemptStatus('fresh')
      }, 0)
      return () => window.clearTimeout(timeout)
    }

    if (daily?.date === activeDailyDate) {
      const timeout = window.setTimeout(() => {
        setDailyLoading(false)
        setDailyAttemptStatus(readDailyAttemptStatus(activeDailyDate))
      }, 0)
      return () => window.clearTimeout(timeout)
    }

    let cancelled = false
    const loadingTimeout = window.setTimeout(() => {
      setDailyLoading(true)
      setDailyError('')
    }, 0)

    void getDaily(activeDailyDate).then((loadedDaily) => {
      if (cancelled) {
        return
      }

      setDaily(loadedDaily)
      setBoard({
        scene: generateRandomScene(defaultGeneratorConfig, endlessGenerationBounces, loadedDaily.seed),
        seed: loadedDaily.seed,
        source: 'daily',
      })
      setActiveGuess(null)
      setTurnIndex(0)
      setTurnResults([])
      setHighlightedBounce(null)
      setTimerRemaining(endlessStartSeconds)
      setPauseBounceIndex(0)
      setStepTime(0)
      setFinalTrailTime(0)
      setFinalScoreOffset({ x: 0, y: 0 })
      setFinalMessage('')
      setDailyAttemptStatus(readDailyAttemptStatus(activeDailyDate))
      setDailyLoading(false)
      setPhase('ready')
    }).catch((error: unknown) => {
      if (cancelled) {
        return
      }

      setDailyError(error instanceof Error ? error.message : 'Daily challenge not found.')
      setDailyLoading(false)
    })

    return () => {
      cancelled = true
      window.clearTimeout(loadingTimeout)
    }
  }, [activeDailyDate, daily?.date])

  useEffect(() => {
    if (!activeTip) {
      return
    }

    const timeout = window.setTimeout(() => setActiveTip(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [activeTip])

  useEffect(() => {
    if (phase === 'guessing' && turnResults.length === 0) {
      showTutorialTip(setActiveTip, {
        key: 'firstPrediction',
        text: 'Tap where you think the ball will hit next.',
      })
    }
  }, [phase, turnResults.length])

  useEffect(() => {
    const latestResult = turnResults[turnResults.length - 1]
    if (!latestResult) {
      return
    }

    if (latestResult.points <= 0) {
      showTutorialTip(setActiveTip, {
        key: 'firstMiss',
        text: 'Guess too far from the bounce and you lose a life. You get three.',
      })
      return
    }

    if (latestResult.maxPoints >= 100) {
      showTutorialTip(setActiveTip, {
        key: 'longPath',
        text: 'Big travel means bigger point chances.',
      })
      return
    }

    showTutorialTip(setActiveTip, {
      key: 'firstScore',
      text: 'Guess closer to the bounce to score more points.',
    })
  }, [turnResults])

  useEffect(() => {
    if (phase !== 'finished') {
      return
    }

    const runKey = `${board.seed}:${turnResults.length}:${totalScore}`
    if (recordedFinishedScoreRef.current === runKey) {
      return
    }

    recordedFinishedScoreRef.current = runKey
    const timeout = window.setTimeout(() => {
      const previousBest = runBestBeforeRef.current
      const nextBest = Math.max(localHighScore, totalScore)
      if (nextBest > localHighScore) {
        writeLocalHighScore(nextBest)
        setLocalHighScore(nextBest)
      }

      setFinalMessage(getFinalMessage(totalScore, maxScore, previousBest, turnResults))
      showTutorialTip(setActiveTip, {
        key: 'finishedRun',
        text: 'New Game rolls a fresh board. Copy Link keeps this one.',
      })
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [board.seed, localHighScore, maxScore, phase, totalScore, turnResults])

  useEffect(() => {
    if (phase !== 'finished' || !activeChallengeSlug || challengeAttemptStatus !== 'started') {
      return
    }

    const runKey = `${activeChallengeSlug}:${turnResults.length}:${totalScore}`
    if (autoSubmittedChallengeRef.current === runKey) {
      return
    }

    autoSubmittedChallengeRef.current = runKey
    submitCurrentChallengeScore()
  }, [activeChallengeSlug, challengeAttemptStatus, phase, submitCurrentChallengeScore, totalScore, turnResults.length])

  useEffect(() => {
    if (phase !== 'finished' || !activeDailyDate || dailyAttemptStatus !== 'started') {
      return
    }

    const runKey = `${activeDailyDate}:${turnResults.length}:${totalScore}`
    if (autoSubmittedDailyRef.current === runKey) {
      return
    }

    autoSubmittedDailyRef.current = runKey
    submitCurrentDailyScore()
  }, [activeDailyDate, dailyAttemptStatus, phase, submitCurrentDailyScore, totalScore, turnResults.length])

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
      theme,
      trailSegments,
      highlightedLabel: highlightedBounce,
      rotateLabels: boardRotated,
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
    theme,
    trailSegments,
    visibleGuesses,
    visibleTargets,
    boardRotated,
  ])

  return (
    <main className={`app-shell theme-${theme}`}>
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
          {board.source === 'challenge' && <span>challenge</span>}
          {board.source === 'daily' && <span>daily</span>}
          {board.source === 'url' && <span>linked board</span>}
          <strong>Best {localHighScore}</strong>
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

        {activeTip && (
          <div className="tutorial-tip" role="status">
            <span>{activeTip.text}</span>
          </div>
        )}

        {phase === 'ready' && (
          <div className="play-overlay">
            {dailyLoading ? (
              <div className="ready-panel">
                <p className="eyebrow">daily challenge</p>
                <strong>Loading board</strong>
              </div>
            ) : dailyError && !activeDailyDate ? (
              <div className="ready-panel">
                <p className="eyebrow">daily challenge</p>
                <strong>{dailyError}</strong>
                <button type="button" onClick={startNewRound}>
                  New Game
                </button>
              </div>
            ) : activeDailyDate && dailyAttemptStatus !== 'fresh' ? (
              <div className="ready-panel">
                <p className="eyebrow">daily challenge</p>
                <strong>{formatDailyTitle(activeDailyDate)}</strong>
                <DailyMeta streak={dailyStreak} playedToday />
                {daily && <DailyLeaderboard daily={daily} playerId={playerId} />}
                <div className="score-actions">
                  <FlipButton type="button" hoverText="Copy" onClick={copyDailyLink}>
                    {dailyCopied ? 'Copied' : 'Copy Link'}
                  </FlipButton>
                  <button type="button" className="secondary" onClick={startNewRound}>
                    New Game
                  </button>
                </div>
              </div>
            ) : activeDailyDate && daily ? (
              <div className="ready-panel challenge-lobby">
                <p className="eyebrow">daily challenge</p>
                <strong>{formatDailyTitle(activeDailyDate)}</strong>
                <DailyMeta streak={dailyStreak} playedToday={dailyAttemptStatus === 'submitted'} />
                <label className="initials-field">
                  <span>Initials</span>
                  <input
                    aria-label="Leaderboard initials"
                    maxLength={3}
                    onChange={(event) => setPlayerInitials(cleanInitialsInput(event.target.value))}
                    placeholder={initialsPlaceholder}
                    value={playerInitials}
                  />
                </label>
                {dailyError && <p className="challenge-error">{dailyError}</p>}
                <DailyLeaderboard daily={daily} playerId={playerId} />
                <FlipButton type="button" disabled={!isAllowedInitials(playerInitials)} hoverText="Today" onClick={startGame}>
                  Play Daily
                </FlipButton>
              </div>
            ) : challengeLoading ? (
              <div className="ready-panel">
                <p className="eyebrow">challenge</p>
                <strong>Loading board</strong>
              </div>
            ) : challengeError && !activeChallengeSlug ? (
              <div className="ready-panel">
                <p className="eyebrow">challenge</p>
                <strong>{challengeError}</strong>
                <button type="button" onClick={startNewRound}>
                  New Game
                </button>
              </div>
            ) : activeChallengeSlug && challengeAttemptStatus !== 'fresh' ? (
              <div className="ready-panel">
                <p className="eyebrow">leaderboard</p>
                <strong>{challenge ? getChallengeTitle(challenge) : 'Challenge'}</strong>
                {challenge && <ChallengeLeaderboard challenge={challenge} playerId={playerId} />}
                <div className="score-actions">
                  <FlipButton type="button" hoverText="Copy" onClick={copyChallengeLink}>
                    {challengeCopied ? 'Copied' : 'Copy Link'}
                  </FlipButton>
                  <FlipButton type="button" className="secondary wave-text" hoverText="Fresh Board" onClick={startNewRound}>
                    New Game
                  </FlipButton>
                </div>
              </div>
            ) : activeChallengeSlug && challenge ? (
              <div className="ready-panel challenge-lobby">
                <p className="eyebrow">challenge</p>
                <strong>{getChallengeTitle(challenge)}</strong>
                <label className="initials-field">
                  <span>Initials</span>
                  <input
                    aria-label="Leaderboard initials"
                    maxLength={3}
                    onChange={(event) => setPlayerInitials(cleanInitialsInput(event.target.value))}
                    placeholder={initialsPlaceholder}
                    value={playerInitials}
                  />
                </label>
                {challengeError && <p className="challenge-error">{challengeError}</p>}
                <ChallengeLeaderboard challenge={challenge} playerId={playerId} />
                <FlipButton type="button" disabled={!isAllowedInitials(playerInitials)} hoverText="Beat It" onClick={startGame}>
                  Play Challenge
                </FlipButton>
              </div>
            ) : (
              <div className="start-card">
                <BallKnowledgeIcon />
                <h1>Ball Knowledge</h1>
                <div className="start-tagline" aria-label="Predict the next rebound">
                  <span>Predict the next rebound</span>
                  <span aria-hidden="true">Bring a protractor</span>
                </div>
                <div className="start-card-actions">
                  <button type="button" className="start-menu-button primary-start-button" onClick={startGame}>
                    <span className="start-icon-flip">
                      <PlayIcon />
                      <TargetIcon />
                    </span>
                    <span className="start-label-flip">
                      <span>Play</span>
                      <span>{renderWaveText("Let's Go")}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="start-menu-button daily-start-button"
                    aria-label="Daily challenge"
                    title="Daily challenge"
                    onClick={openDailyChallenge}
                  >
                    <span className="daily-icon-flip start-icon-flip">
                      <CalendarIcon />
                      <FlameIcon />
                    </span>
                    <span className="start-label-flip daily-label-flip">
                      <span>Daily</span>
                      <span>Streak: {dailyStreak}</span>
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {phase === 'score-replay' && (
          <>
            <ScorePanel
              label="scoring replay"
              maxScore={maxScore}
              score={displayScore}
              onHover={setHighlightedBounce}
              results={visibleScoreResults}
            />
            <button type="button" className="skip-replay-button secondary" onClick={skipScoringReplay}>
              Skip Replay
            </button>
          </>
        )}

        {phase === 'finished' && (
          <div className="final-score-menu">
            <div
              className={`draggable-final-score ${activeDailyDate || activeChallengeSlug ? 'social-results' : ''}`}
              onPointerDown={handleFinalScorePointerDown}
              onPointerMove={handleFinalScorePointerMove}
              onPointerUp={handleFinalScorePointerUp}
              style={{ transform: `translate(${finalScoreOffset.x}px, ${finalScoreOffset.y}px)` }}
            >
              <ScorePanel
                label="final score"
                maxScore={null}
                score={displayScore}
                onHover={setHighlightedBounce}
                results={visibleScoreResults}
                variant="grid"
              />
              {finalMessage && <p className="final-score-note">{finalMessage}</p>}
              <div className="score-actions">
                <FlipButton type="button" className="wave-text" hoverText="Fresh Board" onClick={startNewRound}>
                  New Game
                </FlipButton>
                <FlipButton
                  type="button"
                  className="secondary"
                  hoverText="Run It Back"
                  onClick={() => {
                    enableAudio()
                    watchOneBounceReplay()
                  }}
                >
                  Watch Replay
                </FlipButton>
              </div>
              {activeDailyDate ? (
                <DailyPanel
                  actionBusy={dailyActionBusy}
                  copied={dailyCopied}
                  daily={daily}
                  error={dailyError}
                  onCopy={copyDailyLink}
                  playerId={playerId}
                  shareUrl={dailyShareUrl}
                  streak={dailyStreak}
                />
              ) : activeChallengeSlug ? (
                <ChallengePanel
                  actionBusy={challengeActionBusy}
                  attemptStatus={challengeAttemptStatus}
                  challenge={challenge}
                  copied={challengeCopied}
                  error={challengeError}
                  initials={playerInitials}
                  isChallengeRun
                  onCopy={copyChallengeLink}
                  onCreate={createChallengeFromRun}
                  onInitialsChange={setPlayerInitials}
                  onSubmit={submitCurrentChallengeScore}
                  playerId={playerId}
                  shareUrl={challengeShareUrl}
                />
              ) : (
                <div className="challenge-dropdown">
                  <FlipButton
                    type="button"
                    className="challenge-dropdown-toggle secondary"
                    aria-expanded={challengePanelOpen}
                    hoverText="Send It"
                    onClick={() => setChallengePanelOpen((open) => !open)}
                  >
                    Challenge Your Friends
                  </FlipButton>
                  {challengePanelOpen && (
                  <ChallengePanel
                    actionBusy={challengeActionBusy}
                    attemptStatus={challengeAttemptStatus}
                    challenge={challenge}
                    copied={challengeCopied}
                    error={challengeError}
                    initials={playerInitials}
                    isChallengeRun={Boolean(activeChallengeSlug)}
                    onCopy={copyChallengeLink}
                    onCreate={createChallengeFromRun}
                    onInitialsChange={setPlayerInitials}
                    onSubmit={submitCurrentChallengeScore}
                    playerId={playerId}
                    shareUrl={challengeShareUrl}
                  />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="menu-shell">
          <button
            type="button"
            className="menu-toggle icon-button"
            aria-expanded={settingsOpen}
            aria-label="Settings"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            ⚙
          </button>

          {settingsOpen && (
            <aside className="hud" aria-label="Game settings">
              <button
                type="button"
                className={`theme-switch ${theme === 'night' ? 'is-night' : 'is-sky'}`}
                aria-label={`Switch to ${theme === 'night' ? 'sky' : 'night'} theme`}
                aria-pressed={theme === 'sky'}
                onClick={() => setTheme((current) => (current === 'night' ? 'sky' : 'night'))}
              >
                <span className="switch-track">
                  <span className="switch-thumb">{theme === 'night' ? '☾' : '☀'}</span>
                </span>
              </button>

              <button
                type="button"
                className={`sound-toggle ${muted ? 'is-muted' : ''}`}
                aria-label={muted ? 'Unmute sound' : 'Mute sound'}
                aria-pressed={!muted}
                onClick={() => setMuted((current) => !current)}
              >
                <span>{muted ? '🔇' : '🔊'}</span>
              </button>
            </aside>
          )}
        </div>
      </section>
      <Analytics />
    </main>
  )
}

function createInitialBoard(): BoardState {
  const seedFromAddress = getSeedFromAddress()
  const seed = seedFromAddress ?? createRandomSeed()

  return {
    scene: generateRandomScene(defaultGeneratorConfig, endlessGenerationBounces, seed),
    seed,
    source: seedFromAddress === null ? 'random' : 'url',
  }
}

function getSeedFromAddress() {
  if (typeof window === 'undefined') {
    return null
  }

  const rawSeed = new URLSearchParams(window.location.search).get(seedQueryParam)
  if (rawSeed === null) {
    return null
  }

  const seed = Number(rawSeed)
  if (!Number.isSafeInteger(seed) || seed < 0) {
    return null
  }

  return seed >>> 0
}

function getChallengeSlugFromAddress() {
  if (typeof window === 'undefined') {
    return null
  }

  const slugFromQuery = new URLSearchParams(window.location.search).get(challengeQueryParam)
  if (slugFromQuery) {
    return cleanChallengeSlug(slugFromQuery)
  }

  const match = window.location.pathname.match(/^\/c\/([a-z0-9-]+)/i)
  return match ? cleanChallengeSlug(match[1]) : null
}

function getDailyDateFromAddress() {
  if (typeof window === 'undefined') {
    return null
  }

  const dateFromQuery = new URLSearchParams(window.location.search).get(dailyQueryParam)
  if (dateFromQuery) {
    return cleanDailyDate(dateFromQuery)
  }

  const match = window.location.pathname.match(/^\/d\/(\d{4}-\d{2}-\d{2})/i)
  return match ? cleanDailyDate(match[1]) : null
}

function clearSeedFromAddress() {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  if (!url.searchParams.has(seedQueryParam)) {
    return
  }

  url.searchParams.delete(seedQueryParam)
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function clearChallengeFromAddress() {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  if (!url.searchParams.has(challengeQueryParam) && !url.pathname.startsWith('/c/')) {
    return
  }

  url.searchParams.delete(challengeQueryParam)
  window.history.replaceState({}, '', `/${url.search}${url.hash}`)
}

function clearDailyFromAddress() {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  if (!url.searchParams.has(dailyQueryParam) && !url.pathname.startsWith('/d/')) {
    return
  }

  url.searchParams.delete(dailyQueryParam)
  window.history.replaceState({}, '', `/${url.search}${url.hash}`)
}

function pushChallengeAddress(slug: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.history.replaceState({}, '', `/c/${slug}`)
}

function pushDailyAddress(date: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.history.replaceState({}, '', `/d/${date}`)
}

function cleanChallengeSlug(slug: string) {
  const cleaned = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)
  return cleaned || null
}

function cleanDailyDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

function readLocalHighScore() {
  try {
    const value = Number(window.localStorage.getItem(localHighScoreKey))
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

function writeLocalHighScore(score: number) {
  try {
    window.localStorage.setItem(localHighScoreKey, String(Math.max(0, Math.floor(score))))
  } catch {
    // Local storage can be disabled; the game should keep playing.
  }
}

function readPlayerId() {
  try {
    const existing = window.localStorage.getItem(playerIdKey)
    if (existing) {
      return existing
    }

    const next = crypto.randomUUID()
    window.localStorage.setItem(playerIdKey, next)
    return next
  } catch {
    return crypto.randomUUID()
  }
}

function readPlayerInitials() {
  try {
    const stored = normalizeInitials(window.localStorage.getItem(playerInitialsKey) ?? '')
    return isAllowedInitials(stored) ? stored : ''
  } catch {
    return ''
  }
}

function writePlayerInitials(initials: string) {
  try {
    window.localStorage.setItem(playerInitialsKey, normalizeInitials(initials))
  } catch {
    // Optional player convenience only.
  }
}

function readChallengeAttemptStatus(slug: string): ChallengeAttemptStatus {
  try {
    const value = window.localStorage.getItem(`${challengeAttemptPrefix}${slug}`)
    return value === 'started' || value === 'submitted' ? value : 'fresh'
  } catch {
    return 'fresh'
  }
}

function writeChallengeAttemptStatus(slug: string, status: ChallengeAttemptStatus) {
  try {
    window.localStorage.setItem(`${challengeAttemptPrefix}${slug}`, status)
  } catch {
    // One-browser attempt limits are best-effort without sign-in.
  }
}

function readDailyAttemptStatus(date: string): DailyAttemptStatus {
  try {
    const value = window.localStorage.getItem(`${dailyAttemptPrefix}${date}`)
    return value === 'started' || value === 'submitted' ? value : 'fresh'
  } catch {
    return 'fresh'
  }
}

function writeDailyAttemptStatus(date: string, status: DailyAttemptStatus) {
  try {
    window.localStorage.setItem(`${dailyAttemptPrefix}${date}`, status)
  } catch {
    // One-browser attempt limits are best-effort without sign-in.
  }
}

function readDailyStreak() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(dailyStreakKey) ?? '{}') as {
      count?: number
      lastDate?: string
    }
    return Number.isFinite(stored.count) ? Math.max(0, stored.count ?? 0) : 0
  } catch {
    return 0
  }
}

function updateDailyStreak(date: string) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(dailyStreakKey) ?? '{}') as {
      count?: number
      lastDate?: string
    }

    if (stored.lastDate === date) {
      return Math.max(1, stored.count ?? 1)
    }

    const previousDate = new Date(`${date}T00:00:00.000Z`)
    previousDate.setUTCDate(previousDate.getUTCDate() - 1)
    const expectedPrevious = previousDate.toISOString().slice(0, 10)
    const count = stored.lastDate === expectedPrevious ? Math.max(0, stored.count ?? 0) + 1 : 1
    window.localStorage.setItem(dailyStreakKey, JSON.stringify({ count, lastDate: date }))
    return count
  } catch {
    return 1
  }
}

function cleanInitialsInput(input: string) {
  return normalizeInitials(input)
}

function normalizeInitials(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
}

function isAllowedInitials(initials: string) {
  const blocked = new Set(['ASS', 'KKK', 'NZI', 'SEX', 'XXX'])
  return initials.length === 3 && !blocked.has(initials)
}

function getInitialsError(initials: string) {
  if (initials.length !== 3) {
    return 'Enter exactly three letters or numbers.'
  }

  return 'Try different initials.'
}

function formatDailyTitle(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return `Daily Challenge ${parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })}`
}

function serializeTurns(results: TurnResult[]) {
  return results.map((result) => ({
    guess: result.guess ? { x: result.guess.x, y: result.guess.y } : null,
    target: {
      x: result.target.x,
      y: result.target.y,
      time: result.target.time,
      source: result.target.source,
    },
    points: result.points,
    maxPoints: result.maxPoints,
  }))
}

async function copyText(text: string, label: string) {
  if (!navigator.clipboard) {
    window.prompt(label, text)
    return
  }

  await navigator.clipboard.writeText(text)
}

function showTutorialTip(setTip: (tip: TutorialTip | null) => void, tip: TutorialTip) {
  try {
    const storageKey = `${tutorialStoragePrefix}${tip.key}`
    if (window.localStorage.getItem(storageKey)) {
      return
    }

    window.localStorage.setItem(storageKey, 'seen')
  } catch {
    // If storage is unavailable, show the tip without making persistence a dependency.
  }

  setTip(tip)
}

function getFinalMessage(score: number, maxScore: number, previousBest: number, results: TurnResult[]) {
  const misses = getEndlessMisses(results)
  const efficiency = maxScore > 0 ? score / maxScore : 0

  if (score > previousBest && score > 0 && score < 500) {
    return previousBest > 0 ? `New best by ${score - previousBest}. But can you hit 500?` : 'Play Ball!'
  }

  if (score > previousBest && score > 0 && score < 1000) {
    return previousBest > 0 ? `New best by ${score - previousBest}. A score of 1000 is calling your name. Get there!` : 'First score on the board.'
  }

  if (score > previousBest && score > 0 && score > 1000 && previousBest < 1000) {
    return previousBest > 0 ? `New best by ${score - previousBest}. You broke the barrier. Incredible.` : 'First score on the board.'
  }

  if (score > previousBest && score > 0) {
    return previousBest > 0 ? `New best by ${score - previousBest}. You're too good...` : 'First score on the board.'
  }

  if (previousBest > 0 && score >= previousBest * 0.9) {
    return 'Almost there. It just takes a little more ball knowledge.'
  }

  if (efficiency >= 0.72 && misses === 0) {
    return 'You were seeing angles.'
  }

  if (misses >= endlessLives) {
    return getRandomGameOverMessage()
  }

  if (score <= 0) {
    return 'Physics had jokes today.'
  }

  return 'Keep calibrating your physics engine.'
}

function getRandomGameOverMessage() {
  return gameOverMessages[Math.floor(Math.random() * gameOverMessages.length)]
}

function isPortraitBoardLayout() {
  return window.matchMedia('(orientation: portrait) and (max-width: 900px)').matches
}

type DrawOptions = {
  bounces: Bounce[]
  gameScene: GameScene
  guesses: LabeledPoint[]
  highlightedLabel: number | null
  phase: Phase
  rippleAge: number | null
  rotateLabels: boolean
  samples: ReturnType<typeof simulateTrajectory>['samples']
  targetBounces: LabeledBounce[]
  theme: Theme
  trailSegments: TrailSegment[]
  trailTime: number
  timerProgress: number | null
  time: number
}

function prepareCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, gameScene: GameScene) {
  const cssWidth = canvas.clientWidth
  const cssHeight = canvas.clientHeight
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 3)
  const pixelWidth = Math.max(1, Math.round(cssWidth * pixelRatio))
  const pixelHeight = Math.max(1, Math.round(cssHeight * pixelRatio))

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }

  context.setTransform(pixelWidth / gameScene.width, 0, 0, pixelHeight / gameScene.height, 0, 0)
}

function drawScene(context: CanvasRenderingContext2D, options: DrawOptions) {
  const {
    bounces,
    gameScene,
    guesses,
    highlightedLabel,
    phase,
    rippleAge,
    rotateLabels,
    samples,
    targetBounces,
    theme,
    timerProgress,
    time,
    trailSegments,
    trailTime,
  } = options
  const state = getStateAtFast(samples, time)

  context.clearRect(0, 0, gameScene.width, gameScene.height)
  drawBoard(context, gameScene, theme)
  drawTrail(context, trailSegments, trailTime, theme)
  drawObstacles(context, gameScene, theme)

  if (rippleAge !== null && targetBounces.length > 0) {
    drawRipple(context, gameScene, targetBounces[targetBounces.length - 1], rippleAge, theme)
  }

  if (phase === 'score-replay' || phase === 'finished') {
    drawTargets(
      context,
      targetBounces.filter((bounce) => bounce.time <= time || phase === 'finished'),
      highlightedLabel,
      rotateLabels,
    )
  }

  drawGuesses(context, guesses, highlightedLabel, rotateLabels)
  drawBall(context, state, gameScene.ballRadius, timerProgress === null ? getImpactAge(bounces, time) : null, timerProgress, theme)
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

function getThemePalette(theme: Theme): ThemePalette {
  if (theme === 'sky') {
    return {
      backgroundTop: '#5b8ed0',
      backgroundBottom: '#8fd3ff',
      border: '#cbd5e1',
      grid: '#ffffff',
      trail: '#07839c',
      ripple: '#0ea5e9',
      obstacleStroke: '#e3f0fc',
      ball: '#f97316',
      ballFlash: '#fff7ed',
      ballGlow: '#fb923c',
      timerFill: 'rgba(255, 255, 255, 0.62)',
      timerStroke: 'rgba(234, 88, 12, 0.9)',
    }
  }

  return {
    backgroundTop: '#101827',
    backgroundBottom: '#050914',
    border: '#67e8f9',
    grid: '#334155',
    trail: '#38bdf8',
    ripple: '#67e8f9',
    obstacleStroke: '#02061700',
    ball: '#f8fafc',
    ballFlash: '#ffffff',
    ballGlow: '#c7d2fe',
    timerFill: 'rgba(2, 6, 23, 0.58)',
    timerStroke: 'rgba(255, 255, 255, 0.94)',
  }
}

function drawSkyGlow(context: CanvasRenderingContext2D, gameScene: GameScene) {
  const glow = context.createRadialGradient(gameScene.width * 0.5, 0, 20, gameScene.width * 0.5, 0, gameScene.height)
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.72)')
  glow.addColorStop(0.48, 'rgba(219, 234, 254, 0.18)')
  glow.addColorStop(1, 'rgba(14, 165, 233, 0.08)')
  context.fillStyle = glow
  context.fillRect(0, 0, gameScene.width, gameScene.height)
}

function drawNightSky(context: CanvasRenderingContext2D, gameScene: GameScene) {
  const aurora = context.createRadialGradient(
    gameScene.width * 0.62,
    gameScene.height * 0.05,
    20,
    gameScene.width * 0.5,
    gameScene.height * 0.1,
    gameScene.width * 0.75,
  )
  aurora.addColorStop(0, 'rgba(52, 211, 153, 0.28)')
  aurora.addColorStop(0.38, 'rgba(56, 189, 248, 0.16)')
  aurora.addColorStop(0.72, 'rgba(168, 85, 247, 0.12)')
  aurora.addColorStop(1, 'rgba(15, 23, 42, 0)')
  context.fillStyle = aurora
  context.fillRect(0, 0, gameScene.width, gameScene.height)

  context.fillStyle = 'rgba(248, 250, 252, 0.76)'
  for (let index = 0; index < 54; index += 1) {
    const x = seededUnit(index * 2 + 11) * gameScene.width
    const y = seededUnit(index * 2 + 29) * gameScene.height
    const radius = seededUnit(index * 2 + 47) > 0.84 ? 1.3 : 0.7
    context.globalAlpha = 0.24 + seededUnit(index * 2 + 71) * 0.6
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
  return value - Math.floor(value)
}

function getAlphaColor(color: string, alpha: number) {
  const hex = color.replace('#', '')
  if (hex.length !== 6) {
    return color
  }

  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function drawBoard(context: CanvasRenderingContext2D, gameScene: GameScene, theme: Theme) {
  const palette = getThemePalette(theme)
  const gradient = context.createLinearGradient(0, 0, gameScene.width, gameScene.height)
  gradient.addColorStop(0, palette.backgroundTop)
  gradient.addColorStop(1, palette.backgroundBottom)
  context.fillStyle = gradient
  context.fillRect(0, 0, gameScene.width, gameScene.height)

  if (theme === 'night') {
    drawNightSky(context, gameScene)
  } else {
    drawSkyGlow(context, gameScene)
  }

  context.strokeStyle = palette.border
  context.lineWidth = 1.5
  context.strokeRect(
    boardCollisionInset / 2,
    boardCollisionInset / 2,
    gameScene.width - boardCollisionInset,
    gameScene.height - boardCollisionInset,
  )

  context.globalAlpha = 0.12
  context.strokeStyle = palette.grid
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

function drawObstacles(context: CanvasRenderingContext2D, gameScene: GameScene, theme: Theme) {
  const palette = getThemePalette(theme)
  context.strokeStyle = palette.obstacleStroke
  context.lineWidth = 2

  for (const obstacle of gameScene.obstacles) {
    context.beginPath()
    context.fillStyle = getObstacleFill(obstacle.kind, theme)

    if (obstacle.kind === 'circle') {
      context.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2)
    } else {
      drawRoundedPolygonPath(context, obstacle.points, obstacle.cornerRadius)
    }

    context.fill()
    context.stroke()
  }
}

function drawRoundedPolygonPath(context: CanvasRenderingContext2D, points: Point[], radius: number) {
  if (points.length < 3 || radius <= 0) {
    points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y)
        return
      }

      context.lineTo(point.x, point.y)
    })
    context.closePath()
    return
  }

  const starts = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length]
    const next = points[(index + 1) % points.length]
    const trim = Math.min(radius, getDistance(point, previous) * 0.5, getDistance(point, next) * 0.5)

    return {
      start: getPointToward(point, previous, trim),
      end: getPointToward(point, next, trim),
    }
  })

  context.moveTo(starts[0].start.x, starts[0].start.y)
  points.forEach((point, index) => {
    const corner = starts[index]
    context.lineTo(corner.start.x, corner.start.y)
    context.quadraticCurveTo(point.x, point.y, corner.end.x, corner.end.y)
  })
  context.closePath()
}

function drawRipple(context: CanvasRenderingContext2D, gameScene: GameScene, origin: Point, age: number, theme: Theme) {
  const palette = getThemePalette(theme)
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
    context.strokeStyle = getAlphaColor(palette.ripple, alpha)
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
    context.strokeStyle = getAlphaColor(palette.ripple, 0.36 * (1 - echoProgress))
    context.lineWidth = 2
    context.stroke()
  }

  context.restore()
}

function drawTrail(context: CanvasRenderingContext2D, segments: TrailSegment[], trailTime: number, theme: Theme) {
  if (segments.length === 0 || trailTime <= 0) {
    return
  }

  context.beginPath()
  let drewSegment = false

  for (const segment of segments) {
    if (trailTime < segment.startTime) {
      break
    }

    const progress =
      trailTime >= segment.endTime
        ? 1
        : (trailTime - segment.startTime) / Math.max(0.0001, segment.endTime - segment.startTime)
    const to = {
      x: segment.from.x + (segment.to.x - segment.from.x) * progress,
      y: segment.from.y + (segment.to.y - segment.from.y) * progress,
    }

    context.moveTo(segment.from.x, segment.from.y)
    context.lineTo(to.x, to.y)
    drewSegment = true

    if (progress < 1) {
      break
    }
  }

  if (!drewSegment) {
    return
  }

  context.strokeStyle = getThemePalette(theme).trail
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
  theme: Theme,
) {
  const palette = getThemePalette(theme)
  const age = impactAge ?? 0
  const impact = impactAge === null ? 0 : Math.max(0, 1 - age / 0.18)
  const flicker = impact > 0 ? 0.5 + Math.sin(age * 90) * 0.5 : 0
  const flash = impact * flicker

  if (impact > 0) {
    context.beginPath()
    context.arc(point.x, point.y, radius + 8 + impact * 14, 0, Math.PI * 2)
    context.strokeStyle = getAlphaColor(palette.ballFlash, 0.5 * impact)
    context.lineWidth = 2
    context.stroke()
  }

  context.beginPath()
  context.arc(point.x, point.y, radius + flash * 3, 0, Math.PI * 2)
  context.fillStyle = flash > 0.45 ? palette.ballFlash : palette.ball
  context.shadowColor = palette.ballGlow
  context.shadowBlur = 18 + flash * 18
  context.fill()
  context.shadowBlur = 0

  if (theme === 'night') {
    context.beginPath()
    context.arc(point.x - radius * 0.24, point.y - radius * 0.26, radius * 0.18, 0, Math.PI * 2)
    context.fillStyle = 'rgba(148, 163, 184, 0.26)'
    context.fill()
    context.beginPath()
    context.arc(point.x + radius * 0.22, point.y + radius * 0.08, radius * 0.11, 0, Math.PI * 2)
    context.fillStyle = 'rgba(148, 163, 184, 0.18)'
    context.fill()
  }

  if (timerProgress !== null) {
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + Math.PI * 2 * timerProgress

    context.beginPath()
    context.moveTo(point.x, point.y)
    context.arc(point.x, point.y, radius * 0.95, startAngle, endAngle)
    context.closePath()
    context.fillStyle = palette.timerFill
    context.fill()

    context.beginPath()
    context.arc(point.x, point.y, radius * 1, 0, Math.PI * 2)
    context.strokeStyle = palette.timerStroke
    context.lineWidth = 2
    context.stroke()
  }
}

function drawGuesses(
  context: CanvasRenderingContext2D,
  guesses: LabeledPoint[],
  highlightedLabel: number | null,
  rotateLabels: boolean,
) {
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
    drawCenteredLabel(context, String(guess.label ?? index + 1), guess, rotateLabels)
  })
}

function drawTargets(
  context: CanvasRenderingContext2D,
  bounces: LabeledBounce[],
  highlightedLabel: number | null,
  rotateLabels: boolean,
) {
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
    drawCenteredLabel(context, String(bounce.label ?? index + 1), bounce, rotateLabels)
  })
}

function drawCenteredLabel(context: CanvasRenderingContext2D, label: string, point: Point, rotateLabels: boolean) {
  if (!rotateLabels) {
    context.fillText(label, point.x, point.y)
    return
  }

  context.save()
  context.translate(point.x, point.y)
  context.rotate(-Math.PI / 2)
  context.fillText(label, 0, 0)
  context.restore()
}

type ScorePanelProps = {
  label: string
  maxScore: number | null
  onHover?: (label: number | null) => void
  score: number
  results: LabeledTurnResult[]
  variant?: 'grid' | 'list'
}

function ScorePanel({ label, maxScore, onHover, score, results, variant = 'list' }: ScorePanelProps) {
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
      <div className={`score-breakdown ${variant === 'grid' ? 'score-breakdown-grid' : ''}`} ref={breakdownRef}>
        {results.map((result, index) => (
          <span
            className={`score-line ${variant === 'grid' ? 'score-token' : ''}`}
            key={`${result.target.time}-${index}`}
            onBlur={() => onHover?.(null)}
            onFocus={() => onHover?.(result.label)}
            onMouseEnter={() => onHover?.(result.label)}
            onMouseLeave={() => onHover?.(null)}
            style={getScoreStyle(result.points, result.maxPoints)}
            tabIndex={0}
          >
            {variant === 'grid' ? (
              <>
                <span className="score-token-label">{result.label}</span>
                <span className="score-token-score">{result.points}/{result.maxPoints}</span>
              </>
            ) : (
              <>
                <span>Bounce {result.label}</span>
                <span>{result.points}/{result.maxPoints}</span>
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

type FlipButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode
  hoverText: string
}

function FlipButton({ children, className, hoverText, ...props }: FlipButtonProps) {
  return (
    <button className={`flip-button ${className ?? ''}`.trim()} {...props}>
      <span>{children}</span>
      <span aria-hidden="true">
        {renderWaveText(hoverText)}
      </span>
    </button>
  )
}

function renderWaveText(text: string) {
  return Array.from(text).map((letter, index) => (
    <i key={`${letter}-${index}`} style={{ '--letter-index': index } as React.CSSProperties}>
      {letter === ' ' ? '\u00a0' : letter}
    </i>
  ))
}

type ChallengePanelProps = {
  actionBusy: boolean
  attemptStatus: ChallengeAttemptStatus
  challenge: ChallengeRecord | null
  copied: boolean
  error: string
  initials: string
  isChallengeRun: boolean
  onCopy: () => void
  onCreate: () => void
  onInitialsChange: (initials: string) => void
  onSubmit: () => void
  playerId: string
  shareUrl: string
}

function ChallengePanel({
  actionBusy,
  attemptStatus,
  challenge,
  copied,
  error,
  initials,
  isChallengeRun,
  onCopy,
  onCreate,
  onInitialsChange,
  onSubmit,
  playerId,
  shareUrl,
}: ChallengePanelProps) {
  const normalizedInitials = normalizeInitials(initials)
  const initialsAllowed = isAllowedInitials(normalizedInitials)
  const canSubmitScore = isChallengeRun && attemptStatus === 'started' && Boolean(error)
  const canCreateChallenge = !isChallengeRun && !challenge

  return (
    <div className="challenge-panel">
      <div className="challenge-panel-heading">
        <p className="eyebrow">{isChallengeRun ? 'friend challenge' : 'share challenge'}</p>
        <strong>
          {challenge
            ? getChallengeTitle(challenge)
            : 'See if your friends can play this board better than you could'}
        </strong>
      </div>

      {(canCreateChallenge || canSubmitScore) && (
        <label className="initials-field">
          <span>Initials</span>
          <input
            aria-label="Leaderboard initials"
            maxLength={3}
            onChange={(event) => onInitialsChange(cleanInitialsInput(event.target.value))}
            placeholder={initialsPlaceholder}
            value={initials}
          />
        </label>
      )}

      {error && <p className="challenge-error">{error}</p>}
      {isChallengeRun && attemptStatus === 'started' && !error && (
        <p className="challenge-status">{actionBusy ? 'Submitting score...' : 'Score pending...'}</p>
      )}

      {canCreateChallenge && (
        <FlipButton type="button" disabled={!initialsAllowed || actionBusy} hoverText="Send It" onClick={onCreate}>
          {actionBusy ? 'Creating' : 'Create Challenge'}
        </FlipButton>
      )}

      {canSubmitScore && (
        <FlipButton type="button" disabled={!initialsAllowed || actionBusy} hoverText="Submit" onClick={onSubmit}>
          {actionBusy ? 'Submitting' : 'Submit Score'}
        </FlipButton>
      )}

      {challenge && (
        <>
          <div className="challenge-share-row">
            <span>{shareUrl}</span>
            <FlipButton type="button" className="secondary compact" hoverText="Copy" onClick={onCopy}>
              {copied ? 'Copied' : 'Copy'}
            </FlipButton>
          </div>
          <ChallengeLeaderboard challenge={challenge} playerId={playerId} />
        </>
      )}
    </div>
  )
}

function ChallengeLeaderboard({ challenge, playerId }: { challenge: ChallengeRecord; playerId: string }) {
  return <ScoreLeaderboard entries={challenge.leaderboard} playerId={playerId} />
}

type DailyPanelProps = {
  actionBusy: boolean
  copied: boolean
  daily: DailyRecord | null
  error: string
  onCopy: () => void
  playerId: string
  shareUrl: string
  streak: number
}

function DailyPanel({ actionBusy, copied, daily, error, onCopy, playerId, shareUrl, streak }: DailyPanelProps) {
  return (
    <div className="challenge-panel">
      <div className="challenge-panel-heading">
        <p className="eyebrow">daily challenge</p>
        <strong>{daily ? formatDailyTitle(daily.date) : 'Daily Challenge'}</strong>
      </div>
      <DailyMeta streak={streak} playedToday />
      {error && <p className="challenge-error">{error}</p>}
      {actionBusy && <p className="challenge-status">Submitting score...</p>}
      {daily && (
        <>
          <div className="challenge-share-row">
            <span>{shareUrl}</span>
            <FlipButton type="button" className="secondary compact" hoverText="Copy" onClick={onCopy}>
              {copied ? 'Copied' : 'Copy'}
            </FlipButton>
          </div>
          <DailyLeaderboard daily={daily} playerId={playerId} />
        </>
      )}
    </div>
  )
}

function DailyMeta({ playedToday, streak }: { playedToday: boolean; streak: number }) {
  return (
    <div className="daily-meta">
      <span className={playedToday ? 'is-played' : 'is-unplayed'}>{playedToday ? 'Played today' : 'Not played yet'}</span>
      <span className="is-streak">Streak {streak}</span>
    </div>
  )
}

function DailyLeaderboard({ daily, playerId }: { daily: DailyRecord; playerId: string }) {
  return <ScoreLeaderboard entries={daily.leaderboard} playerId={playerId} />
}

function ScoreLeaderboard({ entries, playerId }: { entries: ChallengeRecord['leaderboard']; playerId: string }) {
  return (
    <div className="challenge-leaderboard-wrap">
      <p className="challenge-leaderboard-title">Leaderboard:</p>
      <div className="challenge-leaderboard">
        {entries.slice(0, 8).map((entry, index) => (
          <span
            className={`challenge-entry ${isPlayerEntry(entry, playerId) ? 'is-player' : ''}`}
            key={entry.id}
          >
            <strong>{index + 1}</strong>
            <span>{entry.initials}</span>
            <span>{entry.score}/{entry.maxScore}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function getChallengeTitle(challenge: ChallengeRecord) {
  return `${challenge.creatorInitials}'s challenge`
}

function isPlayerEntry(entry: ChallengeRecord['leaderboard'][number], playerId: string) {
  return entry.playerId === playerId || entry.id === `player:${playerId}`
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <rect x="5.5" y="6.5" width="13" height="12" rx="2.5" />
      <path d="M8.5 4.8v3.4M15.5 4.8v3.4M5.5 10.2h13" />
      <path d="M9 13.5h.01M12 13.5h.01M15 13.5h.01M9 16h.01M12 16h.01M15 16h.01" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M8 5.4v13.2L18.5 12 8 5.4Z" />
    </svg>
  )
}

function TargetIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  )
}

function FlameIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M12 21c-3.5 0-6.2-2.4-6.2-5.9 0-2.9 1.8-5.2 4-7.1.2 1.6.8 2.7 1.8 3.5.7-2.6 2.1-4.7 4.1-6.5.3 3 2.5 4.7 2.5 8.3 0 4.5-2.8 7.7-6.2 7.7Z" />
    </svg>
  )
}

function BallKnowledgeIcon() {
  return (
    <svg className="ball-knowledge-icon" aria-hidden="true" focusable="false" viewBox="0 0 220 104">
      <path className="bounce-path" d="M24 70 62 30 101 72 143 25 196 57" />
      <circle className="bounce-ball" cx="196" cy="57" r="16" />
      <path className="spark" d="M32 20v8M28 24h8" />
      <path className="spark small" d="M54 8v5M51.5 10.5h5" />
    </svg>
  )
}

function getObstacleFill(kind: GameScene['obstacles'][number]['kind'], theme: Theme) {
  if (theme === 'sky') {
    if (kind === 'circle') return '#d6f7bf'
    if (kind === 'triangle') return '#c1dffc'
    if (kind === 'block') return '#f6c8d4'
    return '#f6fcd6'
  }

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
  let seconds = endlessStartSeconds

  for (let index = 0; index < turnIndex; index += 1) {
    seconds = Math.max(endlessMinimumSeconds, seconds - getTimerDecayStep(seconds))
  }

  return roundTimerSeconds(seconds)
}

function getTimerDecayStep(seconds: number) {
  if (seconds > 4) return 0.5
  if (seconds > 3) return 0.25
  if (seconds > 2) return 0.125
  if (seconds > 1) return 0.0625
  return 0
}

function roundTimerSeconds(seconds: number) {
  return Math.round(seconds * 1000) / 1000
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

function getTrailSegments(samples: DrawOptions['samples']): TrailSegment[] {
  if (samples.length < 2) {
    return []
  }

  const segments: TrailSegment[] = []
  let start = samples[0]
  let previous = samples[0]

  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index]
    const velocityChanged =
      Math.abs(current.vx - previous.vx) > 0.001 ||
      Math.abs(current.vy - previous.vy) > 0.001

    if (velocityChanged) {
      if (previous.time > start.time) {
        segments.push({
          from: start,
          to: previous,
          startTime: start.time,
          endTime: previous.time,
        })
      }
      start = previous
    }

    previous = current
  }

  if (previous.time > start.time) {
    segments.push({
      from: start,
      to: previous,
      startTime: start.time,
      endTime: previous.time,
    })
  }

  return segments
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

function getDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

export default App
