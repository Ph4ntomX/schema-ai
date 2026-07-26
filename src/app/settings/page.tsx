'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { ChevronLeft, Flame, Settings2, Save, Loader2, Bell } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const router = useRouter()
  const [limit, setLimit] = useState(20)
  const [subjectsGoal, setSubjectsGoal] = useState(2)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [streakFreezes, setStreakFreezes] = useState(0)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [hasSubscribed, setHasSubscribed] = useState(false)

  useEffect(() => {
    // Check if they are already subscribed natively
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        setHasSubscribed(true)
      }
    }
  }, [])

  const enableNotifications = async () => {
    setIsSubscribing(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        let registration = await navigator.serviceWorker.getRegistration()
        if (!registration) {
          try {
            await navigator.serviceWorker.register('/sw.js')
          } catch (e: any) {
            throw new Error('Service Worker registration failed: ' + e.message)
          }
        }
        
        // Wait for the worker to finish installing and become officially active
        registration = await navigator.serviceWorker.ready
        
        if (!registration || !registration.active) {
          throw new Error('PWA Service Worker is still installing. Please wait a second and try again.')
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        })

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          // Fetch all existing subscriptions to check if THIS specific device is already registered
          const { data: existing } = await supabase
            .from('push_subscriptions')
            .select('id, subscription')
            .eq('user_id', user.id)
            
          // Check if this exact endpoint is already saved
          const isAlreadyRegistered = existing?.some(
            (sub) => (sub.subscription as any)?.endpoint === subscription.endpoint
          )
            
          if (!isAlreadyRegistered) {
            const { error } = await supabase
              .from('push_subscriptions')
              .insert({
                user_id: user.id,
                subscription: subscription as any
              })
              
            if (error) throw error
          }
          setHasSubscribed(true)
          toast.success('Notifications successfully enabled!')
        }
      } else {
        toast.error('Notification permission denied by browser')
      }
    } catch (err: any) {
      console.error('Push Subscription Error:', err)
      toast.error(err?.message || 'Failed to enable notifications. Are you offline or not running a PWA?')
    }
    setIsSubscribing(false)
  }

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('user_settings')
          .select('daily_card_limit, daily_subjects_goal, streak_freezes')
          .eq('id', user.id)
          .maybeSingle()
          
        if (data) {
          if (data.daily_card_limit) setLimit(data.daily_card_limit)
          if (data.daily_subjects_goal) setSubjectsGoal(data.daily_subjects_goal)
          if (data.streak_freezes !== null) setStreakFreezes(data.streak_freezes)
        }
      }
      setIsLoading(false)
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      const { error } = await supabase
        .from('user_settings')
        .update({ 
          daily_card_limit: limit,
          daily_subjects_goal: subjectsGoal
        })
        .eq('id', user.id)
        
      if (error) {
        toast.error('Failed to save settings')
      } else {
        toast.success('Settings updated successfully!')
      }
    }
    setIsSaving(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#a1a1aa]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-6 pb-24 relative">
      <header className="max-w-2xl mx-auto flex items-center justify-between pt-6 pb-12">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/')}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#171717] border border-[#262626] hover:bg-[#202020] transition-colors text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
            <p className="text-[#a1a1aa] text-sm mt-1">Configure your daily study limits</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto flex flex-col gap-8">
        
        {/* Study Config */}
        <section className="bg-[#171717] border border-[#262626] rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8 border-b border-[#262626] pb-4">
            <Settings2 className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-bold text-white">Daily Deck Config</h2>
          </div>
          
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white text-lg">Subjects Per Day</h3>
                  <p className="text-sm text-[#a1a1aa]">How many subjects to include in your Daily Deck.</p>
                </div>
                <span className="text-3xl font-black text-white">{subjectsGoal}</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="5" 
                step="1"
                value={subjectsGoal}
                onChange={(e) => setSubjectsGoal(parseInt(e.target.value))}
                className="w-full accent-blue-500 h-2 bg-[#262626] rounded-lg appearance-none cursor-pointer mt-2"
              />
            </div>

            <div className="flex flex-col gap-4 pt-4 border-t border-[#262626]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white text-lg">Cards Per Subject</h3>
                  <p className="text-sm text-[#a1a1aa]">Maximum due cards pulled for each selected subject.</p>
                </div>
                <span className="text-3xl font-black text-white">{limit}</span>
              </div>
              <input 
                type="range" 
                min="5" 
                max="100" 
                step="5"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                className="w-full accent-blue-500 h-2 bg-[#262626] rounded-lg appearance-none cursor-pointer mt-2"
              />
            </div>
          </div>
        </section>

        {/* Gamification Items */}
        <section className="bg-[#171717] border border-[#262626] rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8 border-b border-[#262626] pb-4">
            <Flame className="w-6 h-6 text-[#ff9500]" />
            <h2 className="text-xl font-bold text-white">Gamification</h2>
          </div>
          
          <div className="flex items-center justify-between p-6 bg-[#202020] rounded-2xl border border-[#3f3f46]">
            <div>
              <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                Streak Freezes 🛡️
              </h3>
              <p className="text-sm text-[#a1a1aa] mt-1">
                Equipped shields that protect your streak if you miss a day. Earned every 7 days.
              </p>
            </div>
            <div className="text-4xl font-black text-white">
              {streakFreezes}
            </div>
          </div>
        </section>

        {/* Notifications Config */}
        <section className="bg-[#171717] border border-[#262626] rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8 border-b border-[#262626] pb-4">
            <Bell className="w-6 h-6 text-yellow-500" />
            <h2 className="text-xl font-bold text-white">Reminders</h2>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white text-lg">Push Notifications</h3>
              <p className="text-sm text-[#a1a1aa] mt-1 max-w-[80%]">
                Receive daily reminders at 5 PM and 11 PM if you haven't completed your Daily Deck.
              </p>
            </div>
            
            <button
              onClick={enableNotifications}
              disabled={hasSubscribed || isSubscribing}
              className={`px-6 py-3 rounded-xl font-bold transition-all shadow-sm ${
                hasSubscribed 
                  ? 'bg-green-500/10 text-green-500 border border-green-500/20' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isSubscribing ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : hasSubscribed ? (
                'Enabled ✓'
              ) : (
                'Enable'
              )}
            </button>
          </div>
        </section>

        {/* Action Bar */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-white text-black px-8 py-4 rounded-xl font-bold hover:bg-gray-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Changes
          </button>
        </div>

      </main>
    </div>
  )
}
