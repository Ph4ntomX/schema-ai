import { TimersDashboard } from '@/components/TimersDashboard'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function TimersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-6 pb-24 relative flex justify-center">
      <main className="w-full max-w-4xl mx-auto flex flex-col items-center">
        <TimersDashboard />
      </main>
    </div>
  )
}
