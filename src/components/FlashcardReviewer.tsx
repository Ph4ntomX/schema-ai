'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ChevronLeft, X, Check, Undo2, LayoutGrid } from 'lucide-react'
import { queueAction } from '@/hooks/useSync'

interface FlashcardReviewerProps {
  cards: any[]
  subject: string
}

export function FlashcardReviewer({ cards, subject }: FlashcardReviewerProps) {
  const router = useRouter()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [exitDirection, setExitDirection] = useState<'left' | 'right'>('left')
  
  const isFinished = currentIndex >= cards.length

  const handleRate = async (isCorrect: boolean) => {
    const currentCard = cards[currentIndex]
    
    // Rating logic mapping
    const rating = isCorrect ? 'good' : 'hard'
    
    // Animate out
    setExitDirection(isCorrect ? 'right' : 'left')
    
    // Queue offline action immediately
    await queueAction('REVIEW_CARD', {
      card_id: currentCard.id,
      rating,
      timestamp: new Date().toISOString()
    })
    
    // Move to next card
    setTimeout(() => {
      setIsFlipped(false)
      setCurrentIndex(prev => prev + 1)
    }, 300) // matches framer motion exit duration
  }

  if (isFinished) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
          <Check className="w-10 h-10 text-green-500" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-3">Deck Complete!</h1>
        <p className="text-[#a1a1aa] max-w-sm mb-10">
          You've successfully reviewed all due flashcards for {subject}. Great job protecting your streak!
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

  const currentCard = cards[currentIndex]
  const progress = Math.round((currentIndex / cards.length) * 100)

  // Helper to format concept key "a_b_c_d" -> "B (C D)"
  const formatConceptKey = (key?: string) => {
    if (!key) return "Concept";
    const parts = key.split('_');
    if (parts.length < 2) return key;
    
    // Capitalize main topic (second part)
    const main = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
    
    if (parts.length === 2) return main;
    
    // Capitalize and wrap the rest in parentheses
    const rest = parts.slice(2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return `${main} (${rest})`;
  }

  // Safely extract concept key (Supabase might return it as object or array)
  const rawConceptKey = Array.isArray(currentCard.questions) 
    ? currentCard.questions[0]?.concept_key 
    : currentCard.questions?.concept_key;

  return (
    <div className="flex-1 flex flex-col relative max-w-2xl mx-auto w-full">
      {/* Header */}
      <header className="p-6 flex items-center justify-between z-10">
        <button 
          onClick={() => router.push('/')}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#171717] border border-[#262626] hover:bg-[#202020] transition-colors text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">{subject}</h2>
          <p className="text-xs text-[#a1a1aa] font-medium">{currentIndex + 1} / {cards.length} Cards</p>
        </div>
        <div className="w-10 h-10" /> {/* Spacer */}
      </header>

      {/* Progress Bar */}
      <div className="px-6 mb-8">
        <div className="w-full h-1.5 bg-[#171717] rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-white rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Card Arena */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative perspective-1000">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 50, scale: 0.9, rotateX: 10 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ 
              opacity: 0, 
              x: exitDirection === 'left' ? -200 : 200, 
              rotate: exitDirection === 'left' ? -10 : 10,
              transition: { duration: 0.3 }
            }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="w-full relative h-[400px] cursor-pointer group"
            onClick={() => !isFlipped && setIsFlipped(true)}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* Background stack visual effect */}
            {currentIndex < cards.length - 1 && (
              <div className="absolute inset-0 bg-[#202020] rounded-3xl transform rotate-3 scale-[0.95] origin-bottom border border-[#262626] -z-20" />
            )}
            {currentIndex < cards.length - 2 && (
              <div className="absolute inset-0 bg-[#1a1a1a] rounded-3xl transform -rotate-2 scale-[0.92] origin-bottom border border-[#262626] -z-10" />
            )}

            {/* Flippable Card Container */}
            <motion.div
              className="relative w-full h-full"
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* FRONT SIDE */}
              <div 
                className="absolute inset-0 w-full h-full bg-[#171717] border border-[#262626] rounded-3xl p-8 flex flex-col shadow-2xl backface-hidden"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <div className="mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#71717a] bg-[#202020] px-3 py-1 rounded-full border border-[#262626]">
                    {formatConceptKey(rawConceptKey)}
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <h3 className="text-2xl font-bold text-white text-center leading-relaxed">
                    {currentCard.front_text}
                  </h3>
                </div>
                {!isFlipped && (
                  <div className="mt-auto text-center animate-pulse">
                    <p className="text-sm font-medium text-[#a1a1aa]">Tap to reveal answer</p>
                  </div>
                )}
              </div>

              {/* BACK SIDE (ANSWER) */}
              <div 
                className="absolute inset-0 w-full h-full bg-[#111111] border border-[#3f3f46] rounded-3xl p-8 flex flex-col shadow-2xl backface-hidden"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <div className="mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa] bg-[#262626] px-3 py-1 rounded-full">
                    Answer
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-center overflow-y-auto custom-scrollbar pr-2">
                  <p className="text-xl font-medium text-white text-center leading-relaxed">
                    {currentCard.back_text}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Action Buttons (Only visible when flipped) */}
        <AnimatePresence>
          {isFlipped && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-[-100px] left-0 w-full flex items-center justify-center gap-4 px-6"
            >
              <button
                onClick={(e) => { e.stopPropagation(); handleRate(false) }}
                className="flex-1 bg-[#202020] border border-[#ff3b30]/30 hover:bg-[#ff3b30]/10 text-white font-bold py-5 rounded-2xl transition-all flex flex-col items-center justify-center gap-1 group shadow-lg"
              >
                <X className="w-6 h-6 text-[#ff3b30] group-hover:scale-110 transition-transform" />
                <span className="text-xs text-[#a1a1aa] group-hover:text-white">Got it Wrong</span>
              </button>
              
              <button
                onClick={(e) => { e.stopPropagation(); handleRate(true) }}
                className="flex-1 bg-white text-black hover:bg-gray-200 font-bold py-5 rounded-2xl transition-all flex flex-col items-center justify-center gap-1 group shadow-[0_0_30px_rgba(255,255,255,0.1)]"
              >
                <Check className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span className="text-xs opacity-70 group-hover:opacity-100">Got it Right</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #262626;
          border-radius: 4px;
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
      `}</style>
    </div>
  )
}
