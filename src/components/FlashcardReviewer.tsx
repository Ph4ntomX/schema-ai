'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Check, LayoutGrid } from 'lucide-react'
import { db } from '@/lib/db'
import { queueAction } from '@/hooks/useSync'

interface FlashcardReviewerProps {
  initialQueue: any[]
  onComplete?: () => void
  title?: string
}

export function FlashcardReviewer({ initialQueue, onComplete, title = 'Mastery Queue' }: FlashcardReviewerProps) {
  const router = useRouter()
  const [queue, setQueue] = useState([...initialQueue])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [exitDirection, setExitDirection] = useState<'left' | 'right'>('left')
  
  // To avoid hitting the DB for the user id repeatedly
  const [userId, setUserId] = useState<string>('')
  useEffect(() => {
    async function fetchUser() {
      // 1. Try to get it from existing card progress (most reliable for daily deck)
      const progress = await db.user_card_progress.limit(1).toArray()
      if (progress.length > 0) {
        setUserId(progress[0].user_id)
        return
      }
      
      // 2. Fallback to active subtopics
      const subtopics = await db.user_active_subtopics.limit(1).toArray()
      if (subtopics.length > 0) {
        setUserId(subtopics[0].user_id)
        return
      }

      // 3. Absolute fallback: directly ask the Supabase client
      const { createClient } = await import('@/utils/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
      }
    }
    fetchUser()
  }, [])

  const isFinished = currentIndex >= queue.length

  useEffect(() => {
    if (isFinished && onComplete) {
      onComplete()
    }
  }, [isFinished, onComplete])

  const handleRate = async (rating: 'wrong' | 'right') => {
    if (isFinished) return
    const currentCard = queue[currentIndex]
    
    // Animate out
    setExitDirection(rating === 'wrong' ? 'left' : 'right')
    
    // Calculate Binary Spaced Repetition
    let ease_factor = currentCard.progress?.ease_factor ?? 2.5
    let interval = currentCard.progress?.interval ?? 0
    let repetitions = currentCard.progress?.repetitions ?? 0

    if (rating === 'wrong') {
      ease_factor = Math.max(ease_factor - 0.2, 1.3)
      interval = 0
      // We intentionally do NOT reset repetitions to 0 here.
      // This allows the Dashboard to mathematically distinguish between a lapsed old card (repetitions > 0)
      // and a brand new abandoned Mastery card (repetitions === 0).
      console.log('Lapsed card - retaining history:', repetitions)
    } else if (rating === 'right') {
      // Reward them with a slightly higher ease factor over time for consecutive right answers
      ease_factor = Math.min(ease_factor + 0.1, 3.0)
      
      if (interval === 0) {
        // If it's in the learning phase (either a brand new card or a lapsed card), graduate it to 1 day!
        interval = 1
      } else {
        if (repetitions === 0) interval = 1
        else if (repetitions === 1) interval = 1
        else if (repetitions === 2) interval = 6
        else interval = Math.max(1, Math.round(interval * ease_factor))
      }
      repetitions += 1
    }

    const next_review = new Date()
    if (interval === 0) {
      next_review.setMinutes(next_review.getMinutes() - 1) // Due immediately
    } else if (interval < 1) {
      next_review.setHours(next_review.getHours() + Math.round(interval * 24))
    } else {
      next_review.setDate(next_review.getDate() + interval)
      next_review.setHours(0, 0, 0, 0) // Snap to exactly midnight
    }

    const newProgress = {
      user_id: userId,
      card_id: currentCard.id,
      ease_factor,
      interval,
      repetitions,
      next_review: next_review.toISOString(),
      last_reviewed: new Date().toISOString()
    }

    const finalUserId = userId || currentCard.progress?.user_id
    
    // Update Dexie Progress immediately
    if (finalUserId) {
      await db.user_card_progress.put({
        ...newProgress,
        user_id: finalUserId
      })
      
      // Queue offline sync action for Supabase
      await queueAction('REVIEW_CARD', {
        card_id: currentCard.id,
        rating,
        timestamp: new Date().toISOString()
      })
    } else {
      console.error("FATAL: Could not resolve user ID to save progress!")
    }

    // Dynamic Re-queueing: If "wrong", push it to the END of the active session queue
    if (rating === 'wrong') {
      setQueue(prev => {
        const newQ = [...prev]
        newQ.push({ ...currentCard, progress: newProgress })
        return newQ
      })
    } else if (rating === 'right') {
      // Import dynamically to avoid SSR issues
      import('canvas-confetti').then((confetti) => {
        confetti.default({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#34c759', '#10b981', '#fbbf24']
        })
      })
    }

    // Move to next card
    setTimeout(() => {
      setIsFlipped(false)
      setCurrentIndex(prev => prev + 1)
    }, 200) // Fast game-like response
  }

  if (isFinished) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
          <Check className="w-10 h-10 text-green-500" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-3">Session Complete!</h1>
        <p className="text-[#a1a1aa] max-w-sm mb-10">
          You've aggressively tackled your Mastery Queue. Your brain is growing!
        </p>
        <button 
          onClick={() => router.push('/')}
          className="bg-white text-black font-bold py-4 px-8 rounded-xl hover:bg-gray-200 transition-all flex items-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
        >
          <LayoutGrid className="w-5 h-5" /> Return to Dashboard
        </button>
      </div>
    )
  }

  const currentCard = queue[currentIndex]
  const progressPercent = Math.round((currentIndex / queue.length) * 100)

  const getTypeColor = (type?: string) => {
    if (!type) return 'bg-[#202020] text-[#71717a] border-[#262626]';
    const t = type.toLowerCase();
    if (t === 'conceptual') return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    if (t === 'reference') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (t === 'evidence') return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    return 'bg-[#202020] text-[#71717a] border-[#262626]';
  }

  return (
    <div className="flex-1 flex flex-col relative max-w-3xl mx-auto w-full pt-4 pb-12">
      {/* Header */}
      <header className="p-4 flex items-center justify-between z-10">
        <button 
          onClick={() => router.push('/')}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#171717] border border-[#262626] hover:bg-[#202020] transition-colors text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h2>
          <p className="text-xs text-[#a1a1aa] font-medium">{currentIndex + 1} / {queue.length}</p>
        </div>
        <div className="w-10 h-10" />
      </header>

      {/* Progress Bar */}
      <div className="px-4 mb-6">
        <div className="w-full h-1.5 bg-[#171717] rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-white rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Card Arena */}
      <main className="flex-1 flex flex-col items-center justify-start px-4 relative perspective-1000 mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 30, scale: 0.95, rotateX: 5 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ 
              opacity: 0, 
              x: exitDirection === 'left' ? -150 : 150, 
              rotate: exitDirection === 'left' ? -5 : 5,
              transition: { duration: 0.2 }
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="w-full relative min-h-[450px] cursor-pointer group"
            onClick={() => !isFlipped && setIsFlipped(true)}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* Background stack visual effect */}
            {currentIndex < queue.length - 1 && (
              <div className="absolute inset-0 bg-[#202020] rounded-[2rem] transform rotate-2 scale-[0.96] origin-bottom border border-[#262626] -z-20" />
            )}
            
            {/* Card Content Container */}
            <div className="relative w-full h-full bg-[#171717] border border-[#262626] rounded-[2rem] p-8 flex flex-col shadow-2xl">
              <div className="mb-6 flex justify-between items-start">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border ${getTypeColor(currentCard.type)}`}>
                  {currentCard.type}
                </span>
                {!isFlipped && (
                  <span className="text-xs text-[#71717a] bg-[#111] px-3 py-1 rounded-full border border-[#262626] animate-pulse">
                    Tap to reveal
                  </span>
                )}
              </div>
              
              <div className="flex flex-col flex-1">
                {/* Question Section */}
                <div className={`flex flex-col items-center text-center transition-all duration-300 ${isFlipped ? 'mb-8' : 'justify-center flex-1'}`}>
                  <h3 className={`font-bold text-white leading-snug tracking-tight transition-all duration-300 ${isFlipped ? 'text-xl text-[#a1a1aa]' : 'text-3xl'}`}>
                    {currentCard.question}
                  </h3>
                </div>

                {/* Answer Section (Revealed on click) */}
                <AnimatePresence>
                  {isFlipped && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: 20 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex-1 flex flex-col items-center justify-start text-center border-t border-[#262626] pt-8"
                    >
                      <p className="text-2xl text-white font-medium leading-relaxed">
                        {currentCard.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Rating Controls */}
        <AnimatePresence>
          {isFlipped && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ delay: 0.1 }}
              className="w-full flex justify-center gap-4 pt-8 pb-4"
            >
              <button 
                onClick={(e) => { e.stopPropagation(); handleRate('wrong'); }}
                className="flex-1 bg-[#ff3b30]/10 border border-[#ff3b30]/30 text-[#ff3b30] hover:bg-[#ff3b30]/20 py-4 rounded-2xl font-bold text-lg transition-colors flex items-center justify-center gap-2"
              >
                Wrong
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleRate('right'); }}
                className="flex-1 bg-[#34c759]/10 border border-[#34c759]/30 text-[#34c759] hover:bg-[#34c759]/20 py-4 rounded-2xl font-bold text-lg transition-colors flex items-center justify-center gap-2"
              >
                Right
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style jsx global>{`
        .perspective-1000 { perspective: 1000px; }
        .backface-hidden { backface-visibility: hidden; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
      `}</style>
    </div>
  )
}
