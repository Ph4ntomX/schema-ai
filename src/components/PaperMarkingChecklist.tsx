'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronDown, ChevronRight, Check, X, FileText, BarChart3, Plus, Loader2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, LocalQuestion, LocalFlashcard } from '@/lib/db'
import { useRouter } from 'next/navigation'
import { fetchPaperData } from '@/app/actions/study'
import { toast } from 'sonner'

interface PaperMarkingChecklistProps {
  paperId: string
  paperTitle?: string
  userId: string
}

export function PaperMarkingChecklist({ paperId, paperTitle = "Paper Marking", userId }: PaperMarkingChecklistProps) {
  const router = useRouter()

  // Queries
  const questions = useLiveQuery(() => db.questions.where('paper_id').equals(paperId).toArray(), [paperId])
  const flashcards = useLiveQuery(() => db.flashcards.toArray())

  // State
  const [expandedQId, setExpandedQId] = useState<string | null>(null)
  const [markedCards, setMarkedCards] = useState<Record<string, boolean>>({})
  const [showSummary, setShowSummary] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // Sync Data on Mount if missing
  useEffect(() => {
    async function syncData() {
      if (!questions || questions.length === 0) {
        setIsSyncing(true)
        const res = await fetchPaperData(paperId)
        if (res.questions && res.questions.length > 0 && res.flashcards) {
          await db.questions.bulkPut(res.questions)
          await db.flashcards.bulkPut(res.flashcards)
          toast.success("Paper scheme downloaded!")
        } else if (res.error) {
          toast.error(`Error: ${res.error}`)
        }
        setIsSyncing(false)
      }
    }
    
    // Only attempt sync if we explicitly know it's empty (not just undefined from loading)
    if (questions !== undefined && questions.length === 0) {
      syncData()
    }
  }, [questions?.length, paperId])

  // Grouping
  const groupedData = useMemo(() => {
    if (!questions || !flashcards) return []
    return questions.map(q => {
      const qCards = flashcards
        .filter(f => f.question_id === q.id)
        .sort((a, b) => Number(a.is_alt) - Number(b.is_alt)) // non-alt (false/0) first
      return { ...q, flashcards: qCards }
    }).sort((a, b) => a.question_label.localeCompare(b.question_label, undefined, { numeric: true }))
  }, [questions, flashcards])

  // Score Logic
  const getQuestionScore = (qId: string) => {
    const qCards = groupedData.find(q => q.id === qId)?.flashcards || []
    return qCards.filter(c => markedCards[c.id]).length
  }

  let totalScore = 0
  let totalMaxMarks = 0
  groupedData.forEach(q => {
    totalMaxMarks += q.marks
    totalScore += getQuestionScore(q.id)
  })

  const scorePercentage = totalMaxMarks === 0 ? 0 : Math.round((totalScore / totalMaxMarks) * 100)

  // Interaction Handlers
  const toggleMark = (cardId: string, qId: string, maxMarks: number) => {
    const currentScore = getQuestionScore(qId)
    const isCurrentlyMarked = !!markedCards[cardId]

    if (!isCurrentlyMarked && currentScore >= maxMarks) {
      // Prevent marking more than the question's max marks
      return
    }

    setMarkedCards(prev => ({
      ...prev,
      [cardId]: !isCurrentlyMarked
    }))
  }

  const completeMarking = async () => {
    // 1. Compile offline sync actions for spaced repetition (SM-2 updates)
    // We must include ALL flashcards in this paper, not just the ones interacted with.
    const allFlashcards = groupedData.flatMap(q => q.flashcards)
    const syncItems = allFlashcards.map(card => {
      const isMarked = !!markedCards[card.id]
      return {
        action: 'REVIEW_CARD',
        payload: {
          card_id: card.id,
          rating: isMarked ? 'good' : 'hard',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      }
    })

    if (syncItems.length > 0) {
      await db.sync_queue.bulkAdd(syncItems)
    }

    await db.sync_queue.add({
      action: 'CHECKLIST_GRADED',
      payload: { paperId, totalScore, totalMaxMarks },
      timestamp: new Date().toISOString()
    })

    setShowSummary(true)
  }

  // Summary logic
  const conceptSummary = useMemo(() => {
    const summary: Record<string, {score: number, max: number}> = {}
    groupedData.forEach(q => {
      if (!summary[q.concept_key]) summary[q.concept_key] = { score: 0, max: 0 }
      summary[q.concept_key].max += q.marks
      summary[q.concept_key].score += getQuestionScore(q.id)
    })
    return summary
  }, [groupedData, markedCards])

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col relative">
      {/* Sticky Top Bar */}
      <div className="sticky top-0 z-40 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-[#262626]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[#171717] border border-[#262626] hover:bg-[#202020] transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-tight">{paperTitle}</h1>
              <p className="text-xs text-[#a1a1aa] font-medium tracking-wide">
                Marks: {totalScore} / {totalMaxMarks} ({scorePercentage}%)
              </p>
            </div>
          </div>
          <button 
            onClick={completeMarking}
            className="bg-white text-black px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-gray-200 transition-colors shadow-sm"
          >
            Complete Marking
          </button>
        </div>
        
        {/* Minimalist Progress Bar */}
        <div className="w-full h-1 bg-[#171717]">
          <div 
            className="h-full bg-white transition-all duration-500 ease-out"
            style={{ width: `${scorePercentage}%` }}
          />
        </div>
      </div>

      {/* Main List */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-4 py-8 flex flex-col gap-8">
        {(!questions || groupedData.length === 0) && (
          <div className="text-center py-20 text-[#71717a] flex flex-col items-center gap-4">
            {isSyncing ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-white" />
                <p>Syncing paper from cloud...</p>
              </>
            ) : (
              <p>No marking scheme found for this paper.</p>
            )}
          </div>
        )}

        {groupedData.map(q => {
          const currentScore = getQuestionScore(q.id)
          
          // Format label: '1a_i' -> '1 a) i)'
          const formatLabel = (label: string) => {
            let s = label.replace(/(\d)([a-zA-Z])/g, '$1 $2')
            s = s.replace(/_/g, ' ')
            return s.split(/\s+/).filter(Boolean).map((part, i) => {
              if (i === 0 && /^\d+$/.test(part)) return part
              if (/^[a-zA-Z]+$/.test(part)) return `${part})`
              return part
            }).join(' ')
          }

          return (
            <div 
              key={q.id} 
              className="bg-[#171717] border border-[#262626] rounded-2xl overflow-hidden shadow-sm"
            >
              {/* Question Header */}
              <div className="px-6 py-5 flex items-center justify-between bg-[#111111]/50 border-b border-[#262626]">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    currentScore === q.marks ? 'bg-green-500/20 text-green-400' : 'bg-[#262626] text-[#a1a1aa]'
                  }`}>
                    {currentScore}
                  </div>
                  <div className="text-left">
                    <h2 className="font-semibold text-white tracking-tight text-lg">
                      {formatLabel(q.question_label)}
                    </h2>
                    <p className="text-xs text-[#71717a] mt-0.5">Max: {q.marks} marks • {q.concept_key}</p>
                  </div>
                </div>
              </div>

              {/* Rubric Points */}
              <div className="px-6 py-5 flex flex-col gap-3">
                {q.flashcards.length === 0 && (
                  <p className="text-sm text-[#71717a]">No specific rubrics available.</p>
                )}
                
                {q.flashcards.map(card => {
                  const isMarked = !!markedCards[card.id]
                  const isDisabled = !isMarked && currentScore >= q.marks
                  
                  return (
                    <button
                      key={card.id}
                      disabled={isDisabled}
                      onClick={() => toggleMark(card.id, q.id, q.marks)}
                      className={`text-left p-4 rounded-xl border transition-all duration-200 flex items-start gap-4 ${
                        isMarked 
                          ? 'bg-green-500/10 border-green-500/30' 
                          : isDisabled
                            ? 'bg-[#111111] border-[#1f1f1f] opacity-50 cursor-not-allowed'
                            : 'bg-[#0A0A0A] border-[#262626] hover:border-[#3f3f46]'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isMarked ? (
                          <motion.div 
                            initial={{ scale: 0 }} 
                            animate={{ scale: 1 }}
                            className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"
                          >
                            <Check className="w-3 h-3 text-black stroke-[3]" />
                          </motion.div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-[#3f3f46]" />
                        )}
                      </div>
                      <div>
                        <p className="text-[15px] font-medium text-white leading-relaxed">
                          {card.back_text}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </main>

      {/* Completion Modal */}
      <AnimatePresence>
        {showSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="relative w-full max-w-md bg-[#171717] border border-[#262626] rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight">Performance Breakdown</h2>
                </div>
                <button 
                  onClick={() => setShowSummary(false)}
                  className="w-8 h-8 rounded-full bg-[#202020] hover:bg-[#262626] flex items-center justify-center text-[#a1a1aa] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mb-8">
                <div className="text-5xl font-black tabular-nums tracking-tighter mb-2">
                  {scorePercentage}%
                </div>
                <p className="text-[#a1a1aa] text-sm">
                  You scored {totalScore} out of {totalMaxMarks} total marks.
                </p>
              </div>

              <div className="space-y-4 mb-8 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                {Object.entries(conceptSummary).map(([concept, data]) => {
                  const perc = data.max === 0 ? 0 : (data.score / data.max) * 100
                  return (
                    <div key={concept}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="font-medium text-white truncate max-w-[70%]">{concept}</span>
                        <span className="text-[#a1a1aa] font-medium">{data.score} / {data.max}</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#0A0A0A] rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-700 ${perc >= 80 ? 'bg-green-500' : perc >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${perc}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => router.push('/')}
                  className="w-full bg-white text-black font-bold py-3.5 rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" /> Add Missed Cards to Queue
                </button>
                <button 
                  onClick={() => router.push('/')}
                  className="w-full bg-transparent border border-[#3f3f46] text-white font-medium py-3.5 rounded-xl hover:bg-[#202020] transition-colors"
                >
                  Return to Dashboard
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #262626;
          border-radius: 4px;
        }
      `}</style>
    </div>
  )
}
