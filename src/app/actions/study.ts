'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function fetchDailyDeck() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  // 1. Get user profile config
  const { data: profile, error: profileError } = await supabase
    .from('user_settings')
    .select('daily_card_limit')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return { error: 'Profile not found' }
  }

  const limit = profile.daily_card_limit || 20

  // 2. Fetch existing user progress alongside the linked flashcard and question paper_id in a single optimized query
  const { data: progressData, error: progressError } = await supabase
    .from('user_progress')
    .select(`
      flashcard_id, 
      next_review_at, 
      last_reviewed_at, 
      repetition_count,
      flashcards!inner (
        id,
        front_text,
        back_text,
        card_type,
        is_alt,
        questions!inner(paper_id, concept_key)
      )
    `)
    .eq('user_id', user.id)

  if (progressError) {
    return { error: progressError.message }
  }

  const now = new Date().toISOString()
  
  // Start of current day for quota tracking
  const startOfDayDate = new Date()
  startOfDayDate.setHours(0, 0, 0, 0)
  const startOfDay = startOfDayDate.toISOString()

  // 3. Group by subject inline
  const getSubjectFromPaper = (paperId: string) => {
    if (paperId.includes('sejarah')) return 'Sejarah'
    if (paperId.includes('pendidikan_islam')) return 'Pendidikan Islam'
    if (paperId.includes('biology') || paperId.includes('bio')) return 'Biology'
    if (paperId.includes('chemistry') || paperId.includes('chem')) return 'Chemistry'
    if (paperId.includes('physics') || paperId.includes('phys')) return 'Physics'
    if (paperId.includes('mathematics') || paperId.includes('math')) return 'Mathematics'
    return 'Other'
  }

  const subjectData: Record<string, { due: any[], reviewedToday: number }> = {}

  progressData?.forEach(p => {
    const card = p.flashcards as any // The joined flashcard object
    
    // Safety check for malformed data
    if (!card || Array.isArray(card)) return; 
    
    // In PostgREST one-to-one joins, the linked object is typically returned as a single object (or array depending on schema setup, but !inner forces one)
    const rawPaperId = card.questions?.paper_id || (Array.isArray(card.questions) ? card.questions[0]?.paper_id : '')
    const subject = getSubjectFromPaper(rawPaperId)
    
    if (!subjectData[subject]) {
      subjectData[subject] = { due: [], reviewedToday: 0 }
    }

    // Check if it was reviewed today
    if (p.last_reviewed_at && p.last_reviewed_at >= startOfDay && p.repetition_count > 0) {
      subjectData[subject].reviewedToday++
    }

    // Check if it's due
    if (p.next_review_at <= now) {
      subjectData[subject].due.push(card)
    }
  })

  // 5. Apply daily limits and deterministic sorting
  const subjectsGoal = profile.daily_subjects_goal || 2
  const finalDeck: Record<string, { cards: any[], progress: { reviewedToday: number, totalDailyGoal: number, isFinished: boolean } }> = {}
  
  // Sort subjects alphabetically for stability
  const sortedSubjects = Object.keys(subjectData).sort()
  let subjectCount = 0

  for (const subject of sortedSubjects) {
    const data = subjectData[subject]
    
    // Deterministic sort for due cards (by ID) so they don't randomly shuffle on reload
    const stableDueCards = data.due.sort((a, b) => a.id.localeCompare(b.id))
    
    const remainingQuota = Math.max(0, limit - data.reviewedToday)
    const cardsToReview = stableDueCards.slice(0, remainingQuota)
    const isFinished = remainingQuota === 0 && data.reviewedToday > 0

    // Only include subjects that either have cards due OR were finished today
    if (cardsToReview.length > 0 || isFinished) {
      if (subjectCount >= subjectsGoal) break

      finalDeck[subject] = {
        cards: cardsToReview,
        progress: {
          reviewedToday: data.reviewedToday,
          totalDailyGoal: limit,
          isFinished
        }
      }
      subjectCount++
    }
  }

  return { data: finalDeck }
}

export async function fetchPaperData(paperId: string) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing. Did you restart your Next.js server?')
    return { error: 'Server configuration error: Missing Service Role Key. Please restart your Next.js dev server.' }
  }

  // Use service role key to bypass RLS for public questions/flashcards
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  
  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('*')
    .eq('paper_id', paperId)

  if (qError) {
    console.error('Failed to fetch questions:', qError)
    return { error: qError.message }
  }

  if (!questions || questions.length === 0) {
    return { questions: [], flashcards: [] }
  }

  const questionIds = questions.map(q => q.id)

  // Chunk array to avoid URL length limits if there are huge amounts of questions
  const { data: flashcards, error: fError } = await supabase
    .from('flashcards')
    .select('*')
    .in('question_id', questionIds)

  if (fError) {
    console.error('Failed to fetch flashcards:', fError)
    return { error: fError.message }
  }

  return { questions, flashcards }
}
