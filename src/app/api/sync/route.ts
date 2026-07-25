import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

interface SyncPayload {
  action: string
  card_id: string
  rating: 'wrong' | 'right'
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
        .from('user_card_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('card_id', payload.card_id)
        .maybeSingle()

      // Binary Spaced Repetition Logic (Server-side recalculation)
      let ease_factor = progress?.ease_factor ?? 2.5
      let interval = progress?.interval ?? 0
      let repetitions = progress?.repetitions ?? 0
      
      if (payload.rating === 'wrong') {
        ease_factor = Math.max(1.3, ease_factor - 0.2)
        interval = 0
        repetitions = 0
      } else if (payload.rating === 'easy') {
        ease_factor += 0.15
        if (interval === 0) {
          interval = 4
        } else {
          interval = Math.round(interval * ease_factor * 1.3)
        }
        repetitions += 1
      } else if (payload.rating === 'right') {
        if (interval === 0) {
          interval = 1
        } else if (interval === 1) {
          interval = 6
        } else {
          interval = Math.round(interval * ease_factor)
        }
        repetitions += 1
      }

      // Calculate exact next review timestamp
      const next_review = new Date()
      // If interval is 0, we intentionally set next_review to the past to make it strictly due NOW.
      if (interval === 0) {
        next_review.setMinutes(next_review.getMinutes() - 1)
      } else {
        next_review.setDate(next_review.getDate() + interval)
        next_review.setHours(0, 0, 0, 0) // Snap to exactly midnight
      }

      // Upsert progress cleanly respecting RLS
      const { error: upsertError } = await supabase
        .from('user_card_progress')
        .upsert({
          user_id: user.id,
          card_id: payload.card_id,
          ease_factor,
          interval,
          repetitions,
          next_review: next_review.toISOString(),
          last_reviewed: new Date(payload.timestamp || Date.now()).toISOString()
        }, { onConflict: 'user_id, card_id' })

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
