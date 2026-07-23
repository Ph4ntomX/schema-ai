import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { LogOut, BookOpen, Flame, Settings, Plus, Play, LayoutGrid, Check } from 'lucide-react'

import { fetchDailyDeck } from '@/app/actions/study'

export default async function FlashcardsDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch progress to see if user is new
  const { count: progressCount } = await supabase
    .from('user_progress')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const hasFlashcards = progressCount !== null && progressCount > 0

  let dailyDecks: Record<string, { cards: any[], progress: { reviewedToday: number, totalDailyGoal: number, isFinished: boolean } }> = {}
  let currentStreak = 0

  if (hasFlashcards) {
    const res = await fetchDailyDeck()
    if (res.data) {
      dailyDecks = res.data
    }

    // Get current streak
    const { data: profile } = await supabase
      .from('user_settings')
      .select('current_streak')
      .eq('id', user.id)
      .maybeSingle()
      
    if (profile) currentStreak = profile.current_streak || 0
  }

  // Check if at least one subject is completed today to "ignite" the streak for the day
  const isStreakActiveToday = Object.values(dailyDecks).some(deck => deck.progress.isFinished)
  
  // Display streak: if they just activated their very first streak, show 1 instead of 0
  const displayStreak = (isStreakActiveToday && currentStreak === 0) ? 1 : currentStreak

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-6 pb-24 relative">
      {/* Header */}
      <header className="max-w-4xl mx-auto flex items-center justify-between pt-6 pb-12">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Study Dashboard</h1>
          <p className="text-[#a1a1aa] text-sm mt-1">Ready to review some flashcards?</p>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/papers" className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors text-sm font-medium">
            <BookOpen className="w-4 h-4" /> Papers
          </Link>
          <Link href="/settings" className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors text-sm font-medium">
            <Settings className="w-4 h-4" /> Settings
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
        {!hasFlashcards ? (
          <div className="w-full bg-[#171717] border border-[#262626] rounded-3xl p-12 flex flex-col items-center justify-center text-center shadow-xl">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
              <BookOpen className="w-10 h-10 text-[#a1a1aa]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">No Flashcards Yet</h2>
            <p className="text-[#a1a1aa] max-w-md mx-auto mb-10 leading-relaxed">
              At first, you don't have any flashcards. You add flashcards to your collection automatically by marking trial papers that you've completed.
            </p>
            <Link 
              href="/papers"
              className="bg-white text-black font-bold py-4 px-8 rounded-xl hover:bg-gray-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            >
              <Plus className="w-5 h-5" /> Mark a Paper
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            
            {/* Streak Card */}
            <div className={`relative overflow-hidden rounded-3xl p-8 border ${isStreakActiveToday ? 'bg-[#ff3b30]/10 border-[#ff3b30]/20' : 'bg-[#171717] border-[#262626]'} transition-colors duration-500`}>
              {isStreakActiveToday && (
                <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-[#ff3b30]/20 rounded-full blur-3xl animate-pulse" />
              )}
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isStreakActiveToday ? 'bg-[#ff3b30] shadow-[0_0_20px_rgba(255,59,48,0.4)]' : 'bg-[#202020]'}`}>
                    <Flame className={`w-7 h-7 ${isStreakActiveToday ? 'text-white' : 'text-[#71717a]'}`} fill={isStreakActiveToday ? "currentColor" : "none"} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-2">
                      {displayStreak} Day Streak
                      {isStreakActiveToday && <span className="text-[#ff3b30] text-sm font-bold uppercase tracking-wider">Active!</span>}
                    </h2>
                    <p className={`text-sm mt-0.5 ${isStreakActiveToday ? 'text-[#ff3b30]/80' : 'text-[#a1a1aa]'}`}>
                      {isStreakActiveToday 
                        ? (currentStreak === 0 ? "You've ignited your first streak!" : "You've protected your streak for today!") 
                        : "Complete a full flashcard set today to ignite your streak."}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <h2 className="text-2xl font-bold text-white tracking-tight">Your Daily Decks</h2>
              <span className="text-sm font-medium text-[#a1a1aa] bg-[#202020] px-3 py-1 rounded-full border border-[#262626]">
                {Object.keys(dailyDecks).length} Subjects Available
              </span>
            </div>

            {Object.keys(dailyDecks).length === 0 ? (
              <div className="bg-[#171717] border border-[#262626] rounded-3xl p-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                  <Check className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">You're all caught up!</h3>
                <p className="text-[#a1a1aa] text-sm max-w-sm">
                  You have no flashcards due for review right now. Take a break, or add more cards by marking another paper.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(dailyDecks).map(([subject, deckData]) => {
                  const { cards, progress } = deckData
                  
                  // Get accent color based on subject
                  let accent = "from-blue-500/20 to-blue-500/0 border-blue-500/30 text-blue-400"
                  let solidBg = "bg-blue-500"
                  
                  if (subject === 'Biology') { accent = "from-green-500/20 to-green-500/0 border-green-500/30 text-green-400"; solidBg = "bg-green-500" }
                  if (subject === 'Physics') { accent = "from-purple-500/20 to-purple-500/0 border-purple-500/30 text-purple-400"; solidBg = "bg-purple-500" }
                  if (subject === 'Chemistry') { accent = "from-orange-500/20 to-orange-500/0 border-orange-500/30 text-orange-400"; solidBg = "bg-orange-500" }
                  if (subject === 'Sejarah') { accent = "from-red-500/20 to-red-500/0 border-red-500/30 text-red-400"; solidBg = "bg-red-500" }

                  if (progress.isFinished) {
                    return (
                      <div key={subject} className="relative bg-[#111111] border border-[#262626] rounded-3xl p-8 flex flex-col h-full overflow-hidden opacity-80">
                        <div className="relative z-10 flex items-start justify-between mb-10">
                          <div>
                            <h3 className="text-2xl font-bold text-white tracking-tight">{subject}</h3>
                            <p className="text-green-400 text-sm mt-1 font-medium flex items-center gap-1.5">
                              <Check className="w-4 h-4" /> Finished for today
                            </p>
                          </div>
                        </div>
                        <div className="mt-auto">
                          <div className="w-full h-1.5 bg-[#262626] rounded-full overflow-hidden mb-3">
                            <div className="h-full bg-green-500 w-full" />
                          </div>
                          <p className="text-xs text-[#71717a] font-medium text-right">
                            {progress.reviewedToday} / {progress.totalDailyGoal} completed
                          </p>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <Link 
                      key={subject}
                      href={`/review/${subject.toLowerCase()}`}
                      className="group relative block outline-none"
                    >
                      {/* Background layered cards */}
                      <div className="absolute inset-0 bg-[#202020] rounded-3xl transform rotate-3 scale-[0.95] origin-bottom border border-[#262626] transition-transform duration-300 group-hover:rotate-6 group-hover:scale-[0.98]" />
                      <div className="absolute inset-0 bg-[#1a1a1a] rounded-3xl transform -rotate-2 scale-[0.97] origin-bottom border border-[#262626] transition-transform duration-300 group-hover:-rotate-4 group-hover:scale-[0.99]" />
                      
                      {/* Main front card */}
                      <div className="relative bg-[#171717] border border-[#262626] rounded-3xl p-8 flex flex-col h-full overflow-hidden transition-all duration-300 group-hover:-translate-y-2 group-hover:border-[#3f3f46]">
                        {/* Soft glow gradient at the top */}
                        <div className={`absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${accent} opacity-50`} />
                        
                        <div className="relative z-10 flex items-start justify-between mb-10">
                          <div>
                            <h3 className="text-2xl font-bold text-white tracking-tight">{subject}</h3>
                            <p className="text-[#a1a1aa] text-sm mt-1 flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${solidBg} animate-pulse`} />
                              {cards.length} cards due
                            </p>
                          </div>
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-[#0A0A0A] border border-[#262626]`}>
                            <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                          </div>
                        </div>

                        <div className="relative z-10 mt-auto">
                          <div className="flex -space-x-3 mb-4">
                            {[...Array(Math.min(3, cards.length))].map((_, i) => (
                              <div key={i} className="w-10 h-10 rounded-full bg-[#202020] border-2 border-[#171717] flex items-center justify-center shadow-sm">
                                <BookOpen className="w-4 h-4 text-[#a1a1aa]" />
                              </div>
                            ))}
                            {cards.length > 3 && (
                              <div className="w-10 h-10 rounded-full bg-[#262626] border-2 border-[#171717] flex items-center justify-center shadow-sm z-10">
                                <span className="text-[10px] font-bold text-white">+{cards.length - 3}</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="w-full bg-white text-black font-semibold py-3.5 rounded-xl text-center text-sm shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all group-hover:bg-gray-200">
                            Start Session
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
