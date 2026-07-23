import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { PaperMarkingChecklist } from '@/components/PaperMarkingChecklist'

export default async function PaperPage(props: { params: Promise<{ paperId: string }> }) {
  const params = await props.params
  const paperId = params.paperId

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Clean the title for display
  const cleanTitle = paperId.replace(/_/g, ' ')

  return (
    <PaperMarkingChecklist 
      paperId={paperId} 
      paperTitle={cleanTitle} 
      userId={user.id} 
    />
  )
}
