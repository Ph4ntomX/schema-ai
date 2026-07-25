'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { db } from '@/lib/db'
import { FlashcardReviewer } from '@/components/FlashcardReviewer'
import { Loader2 } from 'lucide-react'
import { incrementStreak } from '@/app/actions/user'

export default function CustomStudyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const idsStr = searchParams.get('ids')
  
  const [sessionQueue, setSessionQueue] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadSession() {
      if (!idsStr) {
        setIsLoading(false)
        return
      }

      const ids = idsStr.split(',')

      // 1. Fetch all cards for these specific subtopics
      const cards = await db.flashcards.where('subtopic_id').anyOf(ids).toArray()
      
      // 2. Fetch progress for these cards
      const cardIds = cards.map(c => c.id)
      const allProgress = await db.user_card_progress.where('card_id').anyOf(cardIds).toArray()
      const progressMap = new Map(allProgress.map(p => [p.card_id, p]))

      // 3. Combined Data
      const now = new Date().toISOString()
      
      const combined = cards.map(card => {
        const p = progressMap.get(card.id)
        return {
          ...card,
          progress: p
        }
      })

      // Sort logic: 
      // Tier 1: Due cards (next_review <= now) or New cards (!progress)
      const dueOrNew = []

      for (const c of combined) {
        if (!c.progress || c.progress.next_review <= now) {
          dueOrNew.push(c)
        }
      }

      // Shuffle using standard Math.random because this is an on-demand cram session
      dueOrNew.sort(() => Math.random() - 0.5)

      setSessionQueue(dueOrNew)
      setIsLoading(false)
    }
    
    loadSession()
  }, [idsStr])

  const handleComplete = async () => {
    await incrementStreak()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#a1a1aa]" />
        <p className="text-white mt-4 font-bold">Building Multi-Subtopic Session...</p>
      </div>
    )
  }

  if (sessionQueue.length === 0) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Subtopics Mastered (For Today)</h1>
        <p className="text-[#a1a1aa] mb-8 max-w-md">You've answered all due cards for the selected subtopics correctly! They will automatically appear in your Daily Deck when due again.</p>
        <button 
          onClick={() => router.push('/')}
          className="bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
      <FlashcardReviewer 
        initialQueue={sessionQueue}
        onComplete={handleComplete} 
      />
    </div>
  )
}
