import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { LogOut, BookOpen, Settings, Flame } from 'lucide-react'
import { MasteryDashboard } from '@/components/MasteryDashboard'

export default async function FlashcardsDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get current streak and check onboarding status
  let { data: profile } = await supabase
    .from('user_settings')
    .select('current_streak, last_study_date')
    .eq('id', user.id)
    .maybeSingle()
    
  if (!profile) {
    // Silently create default settings for new accounts instead of forcing them through the legacy onboarding flow
    const { data: newProfile, error: insertError } = await supabase
      .from('user_settings')
      .insert({
        id: user.id,
        daily_card_limit: 50,
        daily_subjects_goal: 2,
        streak_freezes: 0,
        current_streak: 0,
        updated_at: new Date().toISOString()
      })
      .select()
      .maybeSingle()
      
    if (!insertError && newProfile) {
      profile = newProfile
    } else {
      profile = { current_streak: 0, last_study_date: null } // Fallback so dashboard doesn't crash
    }
  }

  let currentStreak = profile?.current_streak || 0
  
  // Verify if they studied today (Malaysia Time)
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())
  const hasStudiedToday = profile?.last_study_date === todayKey

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-6 pb-24 relative">
      {/* Header */}
      <header className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between py-6 px-6 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-black text-white tracking-tighter">spm-cards<span className="text-blue-500">.ai</span></h1>
          <p className="text-[#a1a1aa] text-sm mt-1">Master your SPM subjects</p>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border shadow-sm ${hasStudiedToday && currentStreak > 0 ? 'bg-[#ff9500]/10 border-[#ff9500]/20 shadow-[0_0_15px_rgba(255,149,0,0.1)]' : 'bg-[#262626]/50 border-[#3f3f46]'}`}>
            <Flame className={`w-5 h-5 ${hasStudiedToday && currentStreak > 0 ? 'text-[#ff9500]' : 'text-[#71717a]'}`} />
            <span className={`font-bold text-sm sm:text-base ${hasStudiedToday && currentStreak > 0 ? 'text-[#ff9500]' : 'text-[#71717a]'}`}>
              {currentStreak} Day Streak
            </span>
          </div>
          <Link href="/settings" className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors text-sm font-medium">
            <Settings className="w-5 h-5" /> <span className="hidden sm:inline">Settings</span>
          </Link>
          <form action={logout}>
            <button className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors text-sm font-medium">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto">
        <MasteryDashboard userId={user.id} />
      </main>
    </div>
  )
}
