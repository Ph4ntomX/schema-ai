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
