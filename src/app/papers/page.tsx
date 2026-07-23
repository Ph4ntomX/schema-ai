import fs from 'fs'
import path from 'path'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { LogOut, BookOpen, CheckCircle, Clock } from 'lucide-react'

// Define the exact subjects required
const SUBJECTS = [
  "Sejarah",
  "Pendidikan Islam",
  "Biology",
  "Chemistry",
  "Physics",
  "Mathematics"
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Read local data directory safely
  const dataDir = path.join(process.cwd(), 'data')
  let files: string[] = []
  if (fs.existsSync(dataDir)) {
    files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'))
  }

  // Categorize papers
  const categorized: Record<string, string[]> = {}
  SUBJECTS.forEach(sub => categorized[sub] = [])

  files.forEach(file => {
    const filename = file.replace('.json', '')
    let matched = false
    // Try to match file name to a subject
    for (const sub of SUBJECTS) {
      if (filename.toLowerCase().includes(sub.toLowerCase())) {
        categorized[sub].push(filename)
        matched = true
        break
      }
    }
  })

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-6 pb-24 relative">
      {/* Header */}
      <header className="max-w-4xl mx-auto flex items-center justify-between pt-6 pb-12">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Paper Library</h1>
          <p className="text-[#a1a1aa] text-sm mt-1">Select a paper to mark and extract flashcards.</p>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors text-sm font-medium">
            <BookOpen className="w-4 h-4" /> Dashboard
          </Link>
          <form action={logout}>
            <button className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors text-sm font-medium">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Grid Content */}
      <main className="max-w-4xl mx-auto flex flex-col gap-12">
        {SUBJECTS.map(subject => {
          const papers = categorized[subject]
          
          return (
            <section key={subject}>
              <h2 className="text-xl font-semibold text-white tracking-tight mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#52525b]" />
                {subject}
              </h2>
              
              {papers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {papers.map(paper => (
                    <Link href={`/paper/${paper}`} key={paper} className="bg-[#171717] border border-[#262626] rounded-2xl p-5 hover:border-[#3f3f46] transition-all duration-200 cursor-pointer group shadow-sm hover:shadow-md block">
                      <h3 className="text-white font-medium text-sm mb-3 group-hover:text-white transition-colors leading-relaxed">
                        {paper.replace(/_/g, ' ')}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-[#71717a] mt-auto">
                        <span className="flex items-center gap-1.5 font-medium"><Clock className="w-3.5 h-3.5" /> Start Paper</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="w-full bg-[#111111] border border-dashed border-[#262626] rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                  <p className="text-[#52525b] text-sm">No papers available for {subject} yet.</p>
                </div>
              )}
            </section>
          )
        })}
      </main>
    </div>
  )
}
