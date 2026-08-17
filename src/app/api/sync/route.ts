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

    // 1. Gather all unique card IDs from the payload
    const syncItems = items.filter(item => item.action === 'REVIEW_CARD' && item.payload?.card_id && item.payload?.rating)
    if (syncItems.length === 0) {
      return NextResponse.json({ success: true, message: 'No valid sync items found' })
    }

    const uniqueCardIds = [...new Set(syncItems.map(item => item.payload.card_id))]

    // 2. Bulk fetch existing progress for all these cards
    const { data: existingProgress, error: fetchError } = await supabase
      .from('user_card_progress')
      .select('*')
      .eq('user_id', user.id)
      .in('card_id', uniqueCardIds)

    if (fetchError) {
      throw new Error(`Failed to fetch existing progress: ${fetchError.message}`)
    }

    // 3. Build an in-memory map of the progress to allow sequential updates (e.g. if they reviewed the same card twice offline)
    const progressMap = new Map<string, any>()
    for (const p of (existingProgress || [])) {
      progressMap.set(p.card_id, { ...p })
    }

    // 4. Process all offline queue actions in chronological order
    for (const item of syncItems) {
      const payload: SyncPayload = item.payload
      const currentP = progressMap.get(payload.card_id) || {
        ease_factor: 2.5,
        interval: 0,
        repetitions: 0
      }

      let ease_factor = currentP.ease_factor
      let interval = currentP.interval
      let repetitions = currentP.repetitions
      
      if (payload.rating === 'wrong') {
        ease_factor = Math.max(1.3, ease_factor - 0.2)
        interval = 0
      } else if (payload.rating === 'right') {
        ease_factor = Math.min(3.0, ease_factor + 0.1) // CRITICAL: Must increase ease_factor on server too!
        if (interval === 0) {
          interval = 1
        } else {
          if (repetitions === 0) interval = 1
          else if (repetitions === 1) interval = 6
          else interval = Math.min(21, Math.max(interval + 1, Math.round(interval * ease_factor))) // Escapes the 1-day black hole
        }
        repetitions += 1
      }

      const next_review = new Date()
      if (interval === 0) {
        next_review.setMinutes(next_review.getMinutes() - 1)
      } else {
        next_review.setDate(next_review.getDate() + interval)
        next_review.setHours(0, 0, 0, 0)
      }

      progressMap.set(payload.card_id, {
        user_id: user.id,
        card_id: payload.card_id,
        ease_factor,
        interval,
        repetitions,
        next_review: next_review.toISOString(),
        last_reviewed: new Date(payload.timestamp || Date.now()).toISOString()
      })
    }

    // 5. Bulk Upsert
    const upsertPayload = Array.from(progressMap.values())
    if (upsertPayload.length > 0) {
      const { error: upsertError } = await supabase
        .from('user_card_progress')
        .upsert(upsertPayload, { onConflict: 'user_id, card_id' })

      if (upsertError) {
        throw new Error(`Bulk upsert failed: ${upsertError.message}`)
      }
    }

    return NextResponse.json({ success: true, message: `Offline sync processed smoothly (${upsertPayload.length} cards updated)` })
  } catch (error: any) {
    console.error('Sync Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
