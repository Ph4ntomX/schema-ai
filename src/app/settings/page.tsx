'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Save, Loader2, Minus, Plus } from 'lucide-react'
import { saveOnboardingProfile } from '@/app/actions/user'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { toast } from 'sonner'

export default function SettingsPage() {
  const router = useRouter()
  const [dailyLimit, setDailyLimit] = useState(20)
  const [subjectsGoal, setSubjectsGoal] = useState(2)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('user_settings')
          .select('daily_card_limit, daily_subjects_goal')
          .eq('id', user.id)
          .maybeSingle()
        
        if (profile) {
          if (profile.daily_card_limit) setDailyLimit(profile.daily_card_limit)
          if (profile.daily_subjects_goal) setSubjectsGoal(profile.daily_subjects_goal)
        }
      }
      setIsLoading(false)
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    
    const res = await saveOnboardingProfile(dailyLimit, subjectsGoal)
    
    if (res && res.error) {
      toast.error(`Failed to save settings: ${res.error}`)
    } else {
      toast.success('Settings saved successfully!')
    }
    setIsSaving(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#a1a1aa]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-6 pb-24 relative">
      <header className="max-w-2xl mx-auto flex items-center justify-between pt-6 pb-12">
        <div className="flex items-center gap-4">
          <Link 
            href="/"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#171717] border border-[#262626] hover:bg-[#202020] transition-colors text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
            <p className="text-[#a1a1aa] text-sm mt-1">Configure your dashboard experience</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto flex flex-col gap-6">
        <div className="bg-[#171717] border border-[#262626] rounded-3xl p-8 sm:p-10 shadow-xl">
          <h2 className="text-xl font-bold text-white tracking-tight mb-3">Cards per Subject</h2>
          <p className="text-[#a1a1aa] mb-10 text-sm">How many flashcards do you want to review <strong>per subject</strong> each day?</p>

          <div className="flex items-center justify-center gap-6 mb-12 w-full">
            <button 
              onClick={() => setDailyLimit(Math.max(5, dailyLimit - 5))}
              className="w-14 h-14 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-white hover:bg-[#262626] hover:scale-110 active:scale-90 transition-all duration-200"
            >
              <Minus className="w-6 h-6" />
            </button>
            
            <div className="w-28 text-center flex items-baseline justify-center gap-1">
              <span className="text-7xl font-bold text-white tracking-tighter tabular-nums">{dailyLimit}</span>
            </div>

            <button 
              onClick={() => setDailyLimit(dailyLimit + 5)}
              className="w-14 h-14 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-white hover:bg-[#262626] hover:scale-110 active:scale-90 transition-all duration-200"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
          
          <div className="w-full h-px bg-[#262626] mb-12" />

          <h2 className="text-xl font-bold text-white tracking-tight mb-3">Daily Subjects</h2>
          <p className="text-[#a1a1aa] mb-10 text-sm">How many different subjects do you want to focus on each day?</p>

          <div className="flex items-center justify-center gap-6 mb-12 w-full">
            <button 
              onClick={() => setSubjectsGoal(Math.max(1, subjectsGoal - 1))}
              className="w-14 h-14 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-white hover:bg-[#262626] hover:scale-110 active:scale-90 transition-all duration-200"
            >
              <Minus className="w-6 h-6" />
            </button>
            
            <div className="w-28 text-center flex items-baseline justify-center gap-1">
              <span className="text-7xl font-bold text-white tracking-tighter tabular-nums">{subjectsGoal}</span>
            </div>

            <button 
              onClick={() => setSubjectsGoal(Math.min(10, subjectsGoal + 1))}
              className="w-14 h-14 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-white hover:bg-[#262626] hover:scale-110 active:scale-90 transition-all duration-200"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-4">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-white text-black font-semibold py-4 rounded-xl hover:bg-[#e4e4e7] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Save Configuration</>}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
