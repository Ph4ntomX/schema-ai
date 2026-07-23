import { fetchDailyDeck } from '@/app/actions/study'
import { redirect } from 'next/navigation'
import { FlashcardReviewer } from '@/components/FlashcardReviewer'

export default async function SubjectReviewPage({ params }: { params: Promise<{ subject: string }> }) {
  const resolvedParams = await params
  const decodedSubject = decodeURIComponent(resolvedParams.subject)
  
  // Fetch the daily deck categorized by subject
  const res = await fetchDailyDeck()
  
  if (res.error || !res.data) {
    redirect('/')
  }
  
  // Find the exact subject from the returned keys (case-insensitive match)
  const subjectKey = Object.keys(res.data).find(k => k.toLowerCase() === decodedSubject.toLowerCase())
  
  if (!subjectKey || !res.data[subjectKey] || res.data[subjectKey].cards.length === 0) {
    // If no cards for this subject, redirect to dashboard
    redirect('/')
  }
  
  const cards = res.data[subjectKey].cards

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
      <FlashcardReviewer cards={cards} subject={subjectKey} />
    </div>
  )
}
