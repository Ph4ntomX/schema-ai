import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic' // Ensure it's not statically cached

export async function GET(request: Request) {
  // CRITICAL: We must use the Service Role Key to bypass Row Level Security 
  // since this is a backend cron job running without a specific user session.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const cronSecret = process.env.CRON_SECRET

  // Secure the endpoint so malicious users cannot trigger push notification spam
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized CRON trigger' }, { status: 401 })
  }
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Initialize web-push with your VAPID keys
  const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateVapidKey = process.env.VAPID_PRIVATE_KEY
  
  if (!publicVapidKey || !privateVapidKey) {
    return NextResponse.json({ error: 'Missing VAPID keys in environment variables' }, { status: 500 })
  }

  webpush.setVapidDetails(
    'mailto:supersheevypalpatine@gmail.com', // Replace with a real contact email for push services
    publicVapidKey,
    privateVapidKey
  )

  try {
    // 1. Get today's Malaysia Time date string to see who hasn't studied today
    const mytDate = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())
    
    const now = new Date().toISOString()

    // 2. Fetch users who haven't studied today
    const { data: users, error: userError } = await supabase
      .from('user_settings')
      .select('id, current_streak, last_study_date, daily_card_limit')
      
    if (userError) throw userError
    if (!users || users.length === 0) return NextResponse.json({ success: true, message: 'No users found' })

    const lazyUsers = users.filter(u => u.last_study_date !== mytDate)

    let notificationsSent = 0

    // Process in batches (in a real production app you'd want to parallelize this more)
    for (const user of lazyUsers) {
      // 3. Mathematically count how many cards they have due right now
      // First, find out how many they reviewed today (Malaysia Time)
      const mytMidnight = `${mytDate}T00:00:00+08:00`
      const { count: reviewedToday } = await supabase
        .from('user_card_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('last_reviewed', mytMidnight)
        .gt('interval', 0)
        
      const cardsReviewedToday = reviewedToday || 0
      const dailyLimit = user.daily_card_limit || 50

      const { count: dueCount, error: countError } = await supabase
        .from('user_card_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .lte('next_review', now)
        .gt('interval', 0) // Ignore abandoned learning cards

      const actualDue = Math.min(dueCount || 0, Math.max(0, dailyLimit - cardsReviewedToday))

      // If they have no cards due under the daily cap, don't bother them!
      if (actualDue === 0 || countError) continue

      // 4. Construct the dynamic string based on their streak!
      let bodyText = ""
      const streak = user.current_streak || 0
      
      if (streak > 0) {
        bodyText = `You still have ${actualDue} flashcards due! Complete them before your ${streak}-day streak expires!`
      } else {
        bodyText = `You still have ${actualDue} flashcards due! Complete them to activate your streak!`
      }

      const payload = JSON.stringify({
        title: "Daily Deck Reminder 🧠",
        body: bodyText,
        url: "/study/daily"
      })

      // 5. Fetch their devices and send
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, subscription')
        .eq('user_id', user.id)

      if (subs && subs.length > 0) {
        for (const sub of subs) {
          try {
            // Push it directly to the browser vendors!
            await webpush.sendNotification(sub.subscription, payload)
            notificationsSent++
          } catch (pushErr: any) {
            // If the subscription is no longer valid (e.g. user revoked permissions on this specific device), delete it
            if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
              await supabase
                .from('push_subscriptions')
                .delete()
                .eq('id', sub.id) // ONLY delete the dead device, not all devices!
            }
          }
        }
      }
    }
    
    return NextResponse.json({ success: true, notificationsSent })
    
  } catch (err: any) {
    console.error('CRON ERROR:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
