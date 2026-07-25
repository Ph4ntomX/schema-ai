'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/db'
import { FlashcardReviewer } from '@/components/FlashcardReviewer'
import { Loader2 } from 'lucide-react'
import { incrementStreak } from '@/app/actions/user'

export default function SubtopicStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  
  const [sessionQueue, setSessionQueue] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadSession() {
      // 1. Fetch all cards for this specific subtopic
      const cards = await db.flashcards.where('subtopic_id').equals(resolvedParams.id).toArray()
      
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
        // If it's new, or if it's due, they study it now.
        // We do NOT load future cards so they don't spam repeat cards they already got right today.
        if (!c.progress || c.progress.next_review <= now) {
          dueOrNew.push(c)
        }
      }

      // Shuffle using standard Math.random because this is an on-demand cram session, not the deterministic Daily Deck
      dueOrNew.sort(() => Math.random() - 0.5)

      setSessionQueue(dueOrNew)
      setIsLoading(false)
    }
    
    loadSession()
  }, [resolvedParams.id])

  const handleComplete = async () => {
    await incrementStreak()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#a1a1aa]" />
        <p className="text-white mt-4 font-bold">Building Subtopic Session...</p>
      </div>
    )
  }

  if (sessionQueue.length === 0) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Subtopic Mastered (For Today)</h1>
        <p className="text-[#a1a1aa] mb-8 max-w-md">You've answered all due cards for this subtopic correctly! They will now automatically appear in your Daily Deck when it's time to review them again.</p>
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
