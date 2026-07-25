'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { db } from '@/lib/db'
import { FlashcardReviewer } from '@/components/FlashcardReviewer'
import { Loader2 } from 'lucide-react'
import { getSeededRandom, hashString } from '@/lib/seededRandom'
import { createClient } from '@/utils/supabase/client'
import { incrementStreak } from '@/app/actions/user'

function DailyDeckContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetSubject = searchParams.get('subject') // e.g. "Biology"
  
  const [sessionQueue, setSessionQueue] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadSession() {
      // 1. Fetch user settings for limits
      let subjectsGoal = 2
      let dailyLimit = 50
      let userId = 'default'
      
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          userId = user.id
          const { data } = await supabase.from('user_settings').select('daily_card_limit, daily_subjects_goal').eq('id', user.id).maybeSingle()
          if (data) {
            if (data.daily_card_limit) dailyLimit = data.daily_card_limit
            if (data.daily_subjects_goal) subjectsGoal = data.daily_subjects_goal
          }
        }
      } catch (err) {
        console.error('Failed to fetch settings', err)
      }

      // 2. Fetch all cards and progress
      const allCards = await db.flashcards.toArray()
      const allTopics = await db.topics.toArray()
      const allSubtopics = await db.subtopics.toArray()
      const allProgress = await db.user_card_progress.toArray()
      
      const progressMap = new Map(allProgress.map(p => [p.card_id, p]))
      const subtopicMap = new Map(allSubtopics.map(s => [s.id, s]))
      const topicMap = new Map(allTopics.map(t => [t.id, t]))

      const now = new Date().toISOString()
      
      // 3. Group by Subject Name (from Topics)
      const subjectGroups: Record<string, any[]> = {}
      
      for (const card of allCards) {
        const p = progressMap.get(card.id)
        if (!p) continue // Daily deck only contains cards they have seen in the Mastery Library at least once!
        if (p.interval === 0) continue // Skip abandoned learning cards!
        if (p.next_review > now) continue // Skip future cards entirely
        
        const subtopic = subtopicMap.get(card.subtopic_id)
        if (!subtopic) continue
        const topic = topicMap.get(subtopic.topic_id)
        if (!topic) continue
        
        const subjectName = topic.subject
        if (targetSubject && subjectName !== targetSubject) continue // Filter if a specific subject was clicked

        if (!subjectGroups[subjectName]) {
          subjectGroups[subjectName] = []
        }
        subjectGroups[subjectName].push({ ...card, progress: p })
      }

      // 4. Daily Deterministic Sort (Malaysia Time)
      const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date())
      const seedHash = hashString(`${userId}-${dateKey}`)
      const seededRng = getSeededRandom(seedHash)

      // Calculate how many cards they have already studied today!
      const todayString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())
      let cardsReviewedToday = 0
      for (const p of allProgress) {
        if (!p.last_reviewed) continue
        const reviewedString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(p.last_reviewed))
        if (reviewedString === todayString && p.interval > 0) {
          cardsReviewedToday++
        }
      }

      // Strict global daily allowance
      const remainingAllowance = Math.max(0, dailyLimit - cardsReviewedToday)

      let finalQueue: any[] = []
      
      // We process only the target subject if provided, else we pick N subjects
      let selectedSubjects = targetSubject ? [targetSubject] : Object.keys(subjectGroups)
      
      if (!targetSubject) {
        selectedSubjects.sort(() => seededRng() - 0.5)
        selectedSubjects = selectedSubjects.slice(0, subjectsGoal)
      }
      
      for (const subj of selectedSubjects) {
        if (finalQueue.length >= remainingAllowance) break
        
        const cards = subjectGroups[subj]
        if (!cards) continue
        
        // SORT BY EASE FACTOR (Ascending: Hardest cards first!)
        // If ease_factors are identical, fallback to deterministic shuffle
        cards.sort((a, b) => {
          if (a.progress.ease_factor !== b.progress.ease_factor) {
            return a.progress.ease_factor - b.progress.ease_factor
          }
          return seededRng() - 0.5
        })
        
        // Take cards fairly from this subject without exceeding global limit
        const cardsToTake = Math.min(cards.length, remainingAllowance - finalQueue.length)
        if (cardsToTake > 0) {
          finalQueue.push(...cards.slice(0, cardsToTake))
        }
      }

      setSessionQueue(finalQueue)
      setIsLoading(false)
    }
    
    loadSession()
  }, [targetSubject])

  const handleComplete = async () => {
    await incrementStreak()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#a1a1aa]" />
        <p className="text-white mt-4 font-bold">Building your Daily Deck...</p>
      </div>
    )
  }

  if (sessionQueue.length === 0) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">You're all caught up! 🎉</h1>
        <p className="text-[#a1a1aa] mb-8 max-w-md">You have zero cards due in your global spaced-repetition pool today. Go to the Mastery Library to study a new subtopic.</p>
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
        title="Daily Deck"
      />
    </div>
  )
}

export default function DailyDeckPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A]" />}>
      <DailyDeckContent />
    </Suspense>
  )
}
