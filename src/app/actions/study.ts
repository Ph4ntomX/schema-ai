'use server'

import { createClient } from '@/utils/supabase/server'
import { unstable_noStore as noStore } from 'next/cache'

export async function syncMasteryData() {
  noStore()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  try {
    const { data: topics } = await supabase.from('topics').select('*')
    const { data: subtopics } = await supabase.from('subtopics').select('*')
    const { data: flashcards } = await supabase.from('flashcards').select('*')
    
    const { data: cardProgress } = await supabase
      .from('user_card_progress')
      .select('*')
      .eq('user_id', user.id)

    return {
      topics: topics || [],
      subtopics: subtopics || [],
      flashcards: flashcards || [],
      cardProgress: cardProgress || []
    }
  } catch (error: any) {
    console.error('Error syncing mastery data:', error)
    return { error: error.message }
  }
}

export async function resetSubtopicProgress(subtopicId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  try {
    const { data: cards } = await supabase
      .from('flashcards')
      .select('id')
      .eq('subtopic_id', subtopicId)
      
    if (!cards || cards.length === 0) return { success: true }
    
    const cardIds = cards.map(c => c.id)
    
    await supabase
      .from('user_card_progress')
      .delete()
      .eq('user_id', user.id)
      .in('card_id', cardIds)
      
    return { success: true, deletedCardIds: cardIds }
  } catch (error: any) {
    return { error: error.message }
  }
}



import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
