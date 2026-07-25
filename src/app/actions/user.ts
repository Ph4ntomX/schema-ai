'use server'

import { createClient } from '@/utils/supabase/server'

export async function saveOnboardingProfile(limit: number, subjectsGoal: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      id: user.id,
      daily_card_limit: limit,
      daily_subjects_goal: subjectsGoal,
      current_streak: 0,
      updated_at: new Date().toISOString()
    })

  if (error) {
    console.error('Failed to save profile:', error)
    return { error: error.message }
  }

  return { success: true }
}

export async function incrementStreak() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch current streak and last_study_date
  const { data: profile } = await supabase
    .from('user_settings')
    .select('current_streak, last_study_date')
    .eq('id', user.id)
    .maybeSingle()
    
  if (profile) {
    // Helper to get YYYY-MM-DD in Malaysia Time
    const getMyTDate = (d: Date) => {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d)
    }

    const today = getMyTDate(new Date())
    const lastStudy = profile.last_study_date
    
    // If they already studied today, do NOT increment the streak again
    if (lastStudy === today) {
      return { success: true, message: 'Already incremented today' }
    }

    // Check if they studied yesterday (to maintain streak)
    let newStreak = profile.current_streak || 0
    if (lastStudy) {
      const yesterdayDate = new Date()
      // Adjust yesterday accurately using UTC math to avoid edge cases, then format to MYT
      yesterdayDate.setUTCHours(yesterdayDate.getUTCHours() - 24)
      const yesterdayStr = getMyTDate(yesterdayDate)

      if (lastStudy === yesterdayStr) {
        newStreak += 1 // Maintained streak!
      } else {
        newStreak = 1 // Streak broken! Reset to 1
      }
    } else {
      newStreak = 1 // First time ever
    }

    await supabase
      .from('user_settings')
      .update({ 
        current_streak: newStreak,
        last_study_date: today 
      })
      .eq('id', user.id)
  }

  return { success: true }
}
