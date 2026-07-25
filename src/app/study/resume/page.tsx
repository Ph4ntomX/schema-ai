'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/db'
import { FlashcardReviewer } from '@/components/FlashcardReviewer'
import { Loader2 } from 'lucide-react'
import { incrementStreak } from '@/app/actions/user'

export default function ResumeSessionPage() {
  const router = useRouter()
  
  const [sessionQueue, setSessionQueue] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadSession() {
      // Fetch all progress where interval === 0
      const allProgress = await db.user_card_progress.filter(p => p.interval === 0).toArray()
      
      if (allProgress.length === 0) {
        setIsLoading(false)
        return
      }

      const cardIds = allProgress.map(p => p.card_id)
      const cards = await db.flashcards.where('id').anyOf(cardIds).toArray()
      
      const progressMap = new Map(allProgress.map(p => [p.card_id, p]))

      const combined = cards.map(card => ({
        ...card,
        progress: progressMap.get(card.id)
      }))

      // Shuffle so they get a random mix of their abandoned cards
      combined.sort(() => Math.random() - 0.5)

      setSessionQueue(combined)
      setIsLoading(false)
    }
    
    loadSession()
  }, [])

  const handleComplete = async () => {
    await incrementStreak()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#a1a1aa]" />
        <p className="text-white mt-4 font-bold">Resuming Session...</p>
      </div>
    )
  }

  if (sessionQueue.length === 0) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">No abandoned cards!</h1>
        <button 
          onClick={() => router.push('/')}
          className="mt-6 bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition-colors"
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
