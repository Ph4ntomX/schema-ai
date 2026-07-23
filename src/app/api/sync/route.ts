import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

interface SyncPayload {
  action: string
  card_id: string
  rating: 'good' | 'hard' | 'easy'
  timestamp: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { items } = await request.json()

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // Process each reviewed card from offline Dexie DB
    for (const item of items) {
      const payload: SyncPayload = item.payload
      
      if (item.action !== 'REVIEW_CARD' || !payload.card_id || !payload.rating) {
        continue
      }

      // Fetch existing progress
      const { data: progress } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('flashcard_id', payload.card_id)
        .maybeSingle()

      // Core SM-2 Spaced Repetition Logic
      const isFirstReview = !progress
      let ease_factor = progress?.ease_factor ?? 2.5
      let interval = progress?.interval ?? 0
      let repetition_count = progress?.repetition_count ?? 0
      
      switch (payload.rating) {
        case 'easy':
          ease_factor = Math.min(ease_factor + 0.15, 3.0)
          interval = interval === 0 ? 4 : Math.round(interval * ease_factor * 1.3)
          repetition_count += 1
          break
        case 'good':
          // Keep ease same, multiply interval normally
          interval = interval === 0 ? 1 : Math.round(interval * ease_factor)
          repetition_count += 1
          break
        case 'hard':
          ease_factor = Math.max(ease_factor - 0.2, 1.3)
          // If this is their first time grading it and they got it wrong,
          // they need to study it today! Make interval 0 (due instantly).
          // Otherwise, if they just forgot it in review, interval resets to 1.
          interval = isFirstReview ? 0 : 1
          // If they got it hard, they still reviewed it, so increment if it's not the first time
          if (!isFirstReview) repetition_count += 1
          break
      }

      // Calculate exact next review timestamp
      const next_review = new Date()
      // If interval is 0, we intentionally set next_review to the past to make it strictly due NOW.
      if (interval === 0) {
        next_review.setMinutes(next_review.getMinutes() - 1)
      } else {
        next_review.setDate(next_review.getDate() + interval)
      }

      // Upsert progress cleanly respecting RLS
      const { error: upsertError } = await supabase
        .from('user_progress')
        .upsert({
          user_id: user.id,
          flashcard_id: payload.card_id,
          ease_factor,
          interval,
          repetition_count,
          next_review_at: next_review.toISOString(),
          last_reviewed_at: new Date(payload.timestamp || Date.now()).toISOString()
        }, { onConflict: 'user_id, flashcard_id' })

      if (upsertError) {
        throw new Error(`Upsert failed: ${upsertError.message}`)
      }
    }

    return NextResponse.json({ success: true, message: 'Offline sync processed smoothly' })
  } catch (error: any) {
    console.error('Sync Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
