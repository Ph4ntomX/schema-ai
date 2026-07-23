'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Plus, Minus, Bell, Flame, ChevronRight, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

import { saveOnboardingProfile } from '@/app/actions/user'

// Steps logic
const steps = [1, 2, 3, 4]

export default function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1) // 1 for forward, -1 for backward

  // Step 1 State
  const [dailyLimit, setDailyLimit] = useState(20)

  // Step 2 State
  const [subjectsGoal, setSubjectsGoal] = useState(2)

  // Step 3/4 State
  const [isFinishing, setIsFinishing] = useState(false)

  const nextStep = () => {
    setDirection(1)
    setStep((prev) => Math.min(prev + 1, 4))
  }

  const prevStep = () => {
    setDirection(-1)
    setStep((prev) => Math.max(prev - 1, 1))
  }

  const handleFinish = async () => {
    setIsFinishing(true)
    const res = await saveOnboardingProfile(dailyLimit, subjectsGoal)
    if (res && res.error) {
      toast.error(`Onboarding Save Error: ${res.error}`)
      setIsFinishing(false)
      return
    }
    toast.success("Welcome to schema.ai!")
    setTimeout(() => {
      router.push('/')
    }, 500)
  }

  const variants: any = {
    initial: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
      scale: 0.95
    }),
    animate: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: { duration: 0.5, type: 'spring', bounce: 0, damping: 25, stiffness: 200 }
    },
    exit: (direction: number) => ({
      x: direction > 0 ? '-100%' : '100%',
      opacity: 0,
      scale: 0.95,
      transition: { duration: 0.5, type: 'spring', bounce: 0, damping: 25, stiffness: 200 }
    })
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4 overflow-hidden relative">
      {/* Minimalist progress indicator */}
      <div className="absolute top-12 left-0 right-0 flex justify-center gap-2 z-50">
        {steps.map(s => (
          <div 
            key={s} 
            className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
              s === step ? 'w-8 bg-white' : s < step ? 'w-4 bg-white/50' : 'w-4 bg-[#262626]'
            }`}
          />
        ))}
      </div>

      <div className="w-full max-w-md relative flex items-center justify-center min-h-[450px]">
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          {step === 1 && (
            <motion.div
              key="step1"
              custom={direction}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full bg-[#171717] border border-[#262626] rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col items-center text-center min-h-[450px]"
            >
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">Cards per Subject</h1>
              <p className="text-[#a1a1aa] mb-12 text-sm sm:text-base">How many flashcards do you want to review <strong>per subject</strong> each day?</p>

              <div className="flex items-center justify-center gap-6 mb-12 w-full mt-auto">
                <button 
                  onClick={() => setDailyLimit(Math.max(5, dailyLimit - 5))}
                  className="w-14 h-14 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-white hover:bg-[#262626] hover:scale-110 active:scale-90 transition-all duration-200"
                >
                  <Minus className="w-6 h-6" />
                </button>
                
                <div className="w-28 text-center flex items-baseline justify-center gap-1">
                  <span className="text-7xl font-bold text-white tracking-tighter tabular-nums">{dailyLimit}</span>
                </div>

                <button 
                  onClick={() => setDailyLimit(dailyLimit + 5)}
                  className="w-14 h-14 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-white hover:bg-[#262626] hover:scale-110 active:scale-90 transition-all duration-200"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              <button 
                onClick={nextStep}
                className="w-full bg-white text-black font-semibold py-4 rounded-xl hover:bg-[#e4e4e7] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.1)] mt-auto"
              >
                Continue <ChevronRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              custom={direction}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full bg-[#171717] border border-[#262626] rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col items-center text-center min-h-[450px]"
            >
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">Daily Subjects</h1>
              <p className="text-[#a1a1aa] mb-12 text-sm sm:text-base">How many different subjects do you want to focus on each day?</p>

              <div className="flex items-center justify-center gap-6 mb-12 w-full mt-auto">
                <button 
                  onClick={() => setSubjectsGoal(Math.max(1, subjectsGoal - 1))}
                  className="w-14 h-14 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-white hover:bg-[#262626] hover:scale-110 active:scale-90 transition-all duration-200"
                >
                  <Minus className="w-6 h-6" />
                </button>
                
                <div className="w-28 text-center flex items-baseline justify-center gap-1">
                  <span className="text-7xl font-bold text-white tracking-tighter tabular-nums">{subjectsGoal}</span>
                </div>

                <button 
                  onClick={() => setSubjectsGoal(Math.min(10, subjectsGoal + 1))}
                  className="w-14 h-14 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-white hover:bg-[#262626] hover:scale-110 active:scale-90 transition-all duration-200"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              <div className="flex gap-4 w-full mt-auto">
                <button 
                  onClick={prevStep}
                  className="w-1/3 bg-transparent border border-[#3f3f46] text-white font-medium py-4 rounded-xl hover:bg-[#202020] active:scale-[0.98] transition-all"
                >
                  Back
                </button>
                <button 
                  onClick={nextStep}
                  className="w-2/3 bg-white text-black font-semibold py-4 rounded-xl hover:bg-[#e4e4e7] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              custom={direction}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full bg-[#171717] border border-[#262626] rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col items-center text-center min-h-[450px]"
            >
              <div className="w-20 h-20 rounded-full bg-[#ff3b30]/10 flex items-center justify-center mb-6 mt-4">
                <Flame className="w-10 h-10 text-[#ff3b30]" />
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight mb-4">Protect Your Streak</h1>
              <p className="text-[#a1a1aa] mb-12 text-sm leading-relaxed px-4">
                Consistency is everything. We'll send you one reminder every evening if your streak is in danger. Don't let your hard work slip.
              </p>

              <div className="w-full mt-auto flex flex-col gap-5">
                <button 
                  onClick={nextStep}
                  className="w-full bg-[#ff3b30] text-white font-semibold py-4 rounded-xl shadow-[0_0_30px_rgba(255,59,48,0.3)] hover:bg-[#ff453a] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Bell className="w-5 h-5 fill-current" /> Enable Notifications
                </button>

                <button 
                  onClick={nextStep}
                  className="text-[#52525b] hover:text-[#a1a1aa] text-sm font-medium transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              custom={direction}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full bg-[#171717] border border-[#262626] rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col items-center text-center justify-center min-h-[450px]"
            >
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, type: 'spring', bounce: 0.5 }}
                className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-8 shadow-[0_0_60px_rgba(255,255,255,0.3)]"
              >
                <Check className="w-12 h-12 text-black" strokeWidth={3} />
              </motion.div>
              
              <h1 className="text-3xl font-bold text-white tracking-tight mb-3">You're All Set</h1>
              <p className="text-[#a1a1aa] mb-12">Your personalized study plan is ready.</p>

              <button 
                onClick={handleFinish}
                disabled={isFinishing}
                className="w-full bg-white text-black font-bold py-4 rounded-xl shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center h-[56px] mt-auto"
              >
                {isFinishing ? (
                  <Loader2 className="w-6 h-6 animate-spin text-black" />
                ) : (
                  'Start your streak'
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
