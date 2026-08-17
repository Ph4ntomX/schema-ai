'use client'

import { useState, useEffect, useRef } from 'react'
import { Play, Pause, RotateCcw, ArrowLeft, BrainCircuit, Timer, Settings2, SkipForward } from 'lucide-react'
import Link from 'next/link'

type TimerMode = 'pomodoro' | 'flowtime'
type TimerPhase = 'idle' | 'work' | 'break'

const POMODORO_PRESETS = [
  {
    name: 'Fizik, Kimia, Add Maths',
    work: 50 * 60,
    break: 10 * 60,
    description: 'Deep focus for complex structural & essay calculations.',
    color: 'text-blue-500',
    bg: 'bg-blue-500',
    glow: 'shadow-[0_0_20px_rgba(59,130,246,0.3)]'
  },
  {
    name: 'Sejarah, Pendidikan Islam',
    work: 25 * 60,
    break: 5 * 60,
    description: 'Perfect burst window for pure memorization & facts.',
    color: 'text-orange-500',
    bg: 'bg-orange-500',
    glow: 'shadow-[0_0_20px_rgba(249,115,22,0.3)]'
  },
  {
    name: 'Biologi',
    work: 25 * 60,
    break: 5 * 60,
    description: 'Sketch & label diagrams, followed by short visual-lock breaks.',
    color: 'text-green-500',
    bg: 'bg-green-500',
    glow: 'shadow-[0_0_20px_rgba(34,197,94,0.3)]'
  }
]

export function TimersDashboard() {
  const [mode, setMode] = useState<TimerMode>('pomodoro')
  const [activePresetIndex, setActivePresetIndex] = useState(0)
  
  const [phase, setPhase] = useState<TimerPhase>('idle')
  const [timeLeft, setTimeLeft] = useState(POMODORO_PRESETS[0].work) // seconds
  const [flowtimeElapsed, setFlowtimeElapsed] = useState(0) // seconds
  const [isRunning, setIsRunning] = useState(false)
  
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  const activePreset = POMODORO_PRESETS[activePresetIndex]

  // Reset timer when preset changes (if idle)
  useEffect(() => {
    if (mode === 'pomodoro' && phase === 'idle') {
      setTimeLeft(activePreset.work)
    }
  }, [activePresetIndex, mode, activePreset.work, phase])

  const lastTickRef = useRef<number>(0)

  // Timer loop
  useEffect(() => {
    if (isRunning) {
      lastTickRef.current = Date.now()
      timerRef.current = setInterval(() => {
        const now = Date.now()
        const deltaSeconds = Math.round((now - lastTickRef.current) / 1000)
        
        if (deltaSeconds < 1) return // Wait for a full second
        
        // Advance the tick marker forward exactly by the delta
        lastTickRef.current = lastTickRef.current + deltaSeconds * 1000
        
        if (mode === 'pomodoro' || (mode === 'flowtime' && phase === 'break')) {
          setTimeLeft(prev => {
            const next = prev - deltaSeconds
            if (next <= 0) {
              handlePhaseComplete()
              return 0
            }
            return next
          })
        } else if (mode === 'flowtime' && phase === 'work') {
          setFlowtimeElapsed(prev => prev + deltaSeconds)
        }
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, mode, phase])

  const handlePhaseComplete = () => {
    setIsRunning(false)
    if (typeof window !== 'undefined') {
      new Audio('/notify.mp3').play().catch(() => {}) // Attempt to play sound, ignore if it fails
    }
    
    if (mode === 'pomodoro') {
      if (phase === 'work') {
        setPhase('break')
        setTimeLeft(activePreset.break)
      } else {
        setPhase('idle')
        setTimeLeft(activePreset.work)
      }
    } else {
      // Flowtime break finished
      setPhase('idle')
      setFlowtimeElapsed(0)
    }
  }

  const toggleTimer = () => {
    if (phase === 'idle') {
      setPhase('work')
      if (mode === 'flowtime') {
        setFlowtimeElapsed(0)
      }
    }
    setIsRunning(!isRunning)
  }

  const handleFlowtimeStop = () => {
    setIsRunning(false)
    
    // Calculate break based on flowtimeElapsed
    let breakTime = 5 * 60
    if (flowtimeElapsed >= 50 * 60) {
      breakTime = 10 * 60
    } else if (flowtimeElapsed >= 25 * 60) {
      breakTime = 8 * 60
    }
    
    setPhase('break')
    setTimeLeft(breakTime)
  }

  const resetTimer = () => {
    setIsRunning(false)
    setPhase('idle')
    if (mode === 'pomodoro') {
      setTimeLeft(activePreset.work)
    } else {
      setFlowtimeElapsed(0)
      setTimeLeft(0)
    }
  }
  
  const skipBreak = () => {
    setIsRunning(false)
    setPhase('idle')
    if (mode === 'pomodoro') {
      setTimeLeft(activePreset.work)
    } else {
      setFlowtimeElapsed(0)
    }
  }

  // Formatting helpers
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // SVG Circle Calculations
  const radius = 120
  const circumference = 2 * Math.PI * radius
  let strokeDashoffset = 0
  let ringColor = mode === 'pomodoro' ? activePreset.color : 'text-purple-500'

  if (mode === 'pomodoro') {
    if (phase === 'work' || phase === 'idle') {
      const total = activePreset.work
      strokeDashoffset = circumference - (timeLeft / total) * circumference
      ringColor = activePreset.color
    } else {
      const total = activePreset.break
      strokeDashoffset = circumference - (timeLeft / total) * circumference
      ringColor = 'text-[#ff9500]' // Break is always orange
    }
  } else {
    // Flowtime
    if (phase === 'work' || phase === 'idle') {
      // Infinite spin or static
      strokeDashoffset = isRunning ? (flowtimeElapsed % 60) / 60 * circumference : 0
      ringColor = 'text-purple-500'
    } else {
      // Flowtime Break
      // We don't have the original break max saved easily, let's just make it a static ring or calculate dynamically
      let breakMax = 5 * 60
      if (flowtimeElapsed >= 50 * 60) breakMax = 10 * 60
      else if (flowtimeElapsed >= 25 * 60) breakMax = 8 * 60
      
      strokeDashoffset = circumference - (timeLeft / breakMax) * circumference
      ringColor = 'text-[#ff9500]'
    }
  }

  // For flowtime infinite rotation effect
  const svgStyle = mode === 'flowtime' && phase === 'work' && isRunning 
    ? { transition: 'stroke-dashoffset 1s linear' } 
    : { transition: 'stroke-dashoffset 1s ease-in-out' }

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full flex justify-between items-center mb-8">
        <Link href="/" className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" /> Back to Dashboard
        </Link>
        <div className="flex bg-[#262626] rounded-full p-1 border border-[#3f3f46]">
          <button
            onClick={() => { setMode('pomodoro'); resetTimer(); }}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${mode === 'pomodoro' ? 'bg-[#3f3f46] text-white' : 'text-[#a1a1aa] hover:text-white'}`}
          >
            SPM Presets
          </button>
          <button
            onClick={() => { setMode('flowtime'); resetTimer(); }}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${mode === 'flowtime' ? 'bg-[#3f3f46] text-white' : 'text-[#a1a1aa] hover:text-white'}`}
          >
            Flowtime
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-[#171717] to-[#111] border border-[#262626] rounded-3xl p-8 shadow-xl w-full max-w-lg relative overflow-hidden flex flex-col items-center">
        
        {/* Header Status */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            {mode === 'pomodoro' ? <BrainCircuit className="w-6 h-6 text-blue-500" /> : <Timer className="w-6 h-6 text-purple-500" />}
            {mode === 'pomodoro' ? 'Pomodoro' : 'Flowtime'}
          </h2>
          <p className={`text-sm mt-1 font-bold ${phase === 'work' ? 'text-red-400' : phase === 'break' ? 'text-[#ff9500]' : 'text-[#a1a1aa]'}`}>
            {phase === 'idle' ? 'Ready to Focus' : phase === 'work' ? 'Deep Work Phase' : 'Break Phase'}
          </p>
        </div>

        {/* Circular Timer UI */}
        <div className="relative w-72 h-72 flex items-center justify-center mb-10">
          <svg className="absolute w-full h-full transform -rotate-90" viewBox="0 0 260 260">
            <circle
              cx="130"
              cy="130"
              r={radius}
              fill="transparent"
              stroke="#262626"
              strokeWidth="8"
            />
            <circle
              cx="130"
              cy="130"
              r={radius}
              fill="transparent"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className={ringColor}
              style={svgStyle}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-6xl font-black text-white tracking-tighter tabular-nums">
              {mode === 'flowtime' && phase === 'work' 
                ? formatTime(flowtimeElapsed)
                : formatTime(timeLeft)
              }
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6 mb-8 w-full">
          <button
            onClick={resetTimer}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-[#202020] border border-[#3f3f46] text-[#a1a1aa] hover:bg-[#262626] hover:text-white transition-all"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          
          <button
            onClick={toggleTimer}
            className={`w-20 h-20 flex items-center justify-center rounded-full text-white transition-all transform hover:scale-105 active:scale-95 ${
              mode === 'pomodoro' ? activePreset.bg : 'bg-purple-600'
            } ${mode === 'pomodoro' ? activePreset.glow : 'shadow-[0_0_20px_rgba(147,51,234,0.3)]'}`}
          >
            {isRunning ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-2" />}
          </button>

          {mode === 'flowtime' && phase === 'work' ? (
             <button
              onClick={handleFlowtimeStop}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[#202020] border border-[#3f3f46] text-purple-400 hover:bg-purple-500/20 transition-all group relative"
              title="Stop working & take a break"
            >
              <span className="w-4 h-4 bg-purple-400 rounded-sm"></span>
            </button>
          ) : phase === 'break' ? (
            <button
              onClick={skipBreak}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[#202020] border border-[#3f3f46] text-[#ff9500] hover:bg-[#ff9500]/20 transition-all"
              title="Skip Break"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-12 h-12" /> /* Empty placeholder to balance flex */
          )}
        </div>

        {/* SPM Presets Selection (Only visible in pomodoro mode and idle) */}
        {mode === 'pomodoro' && phase === 'idle' && (
          <div className="w-full flex flex-col gap-3 mt-4 border-t border-[#262626] pt-6">
            <h3 className="text-sm font-bold text-[#a1a1aa] flex items-center gap-2 mb-2">
              <Settings2 className="w-4 h-4" /> Select Subject Type
            </h3>
            {POMODORO_PRESETS.map((preset, idx) => (
              <button
                key={preset.name}
                onClick={() => setActivePresetIndex(idx)}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${activePresetIndex === idx ? 'bg-[#202020] border-[#3f3f46] shadow-sm' : 'bg-transparent border-transparent hover:bg-[#1a1a1a]'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-bold ${activePresetIndex === idx ? 'text-white' : 'text-[#a1a1aa]'}`}>
                    {preset.name}
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded bg-[#262626] ${preset.color}`}>
                    {preset.work / 60}m / {preset.break / 60}m
                  </span>
                </div>
                <p className="text-xs text-[#71717a]">{preset.description}</p>
              </button>
            ))}
          </div>
        )}
        
        {/* Flowtime Description */}
        {mode === 'flowtime' && phase === 'idle' && (
          <div className="w-full mt-4 border-t border-[#262626] pt-6 text-center">
            <p className="text-[#a1a1aa] text-sm">
              Work for as long as you feel productive. 
              When your focus drops, hit stop and your break time will be automatically calculated.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
