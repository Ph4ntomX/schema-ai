'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cloud, Check, Loader2, ChevronDown } from 'lucide-react'
import { queueAction } from '@/hooks/useSync'

type SyncStatus = 'cloud' | 'downloaded' | 'syncing'

interface Topic {
  id: string
  title: string
  concept_key: string
  selected: boolean
}

interface Paper {
  id: string
  title: string
  status: SyncStatus
  topics: Topic[]
}

const mockPapers: Paper[] = [
  {
    id: 'p1',
    title: 'Sejarah SBP 2025',
    status: 'downloaded',
    topics: [
      { id: 't1', title: 'Bab 1: Warisan Negara Bangsa', concept_key: 'sejarah_f4_b1', selected: false },
      { id: 't2', title: 'Bab 2: Kebangkitan Nasionalisme', concept_key: 'sejarah_f4_b2', selected: false },
      { id: 't3', title: 'Bab 3: Konflik Dunia', concept_key: 'sejarah_f4_b3', selected: false },
    ]
  },
  {
    id: 'p2',
    title: 'Biologi MRSM 2025',
    status: 'cloud',
    topics: [
      { id: 't4', title: 'Chapter 2: Cell Biology & Organisation', concept_key: 'bio_f4_c2', selected: false },
      { id: 't5', title: 'Chapter 3: Movement of Substances', concept_key: 'bio_f4_c3', selected: false },
    ]
  }
]

export function PaperChecklist() {
  const [papers, setPapers] = useState<Paper[]>(mockPapers)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Flatten selected topics count
  const selectedCount = papers.reduce((acc, paper) => {
    return acc + paper.topics.filter(t => t.selected).length
  }, 0)

  const toggleTopic = (paperId: string, topicId: string) => {
    setPapers(prev => prev.map(p => {
      if (p.id !== paperId) return p
      return {
        ...p,
        topics: p.topics.map(t => t.id === topicId ? { ...t, selected: !t.selected } : t)
      }
    }))
  }

  const togglePaper = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }

  const handleAddCards = async () => {
    setIsProcessing(true)
    const selectedTopics = papers.flatMap(p => p.topics.filter(t => t.selected))
    
    // Queue offline action
    await queueAction('ADD_TO_DAILY_DECK', {
      topics: selectedTopics.map(t => t.concept_key),
      timestamp: Date.now()
    })
    
    // Simulate UI delay for physical feel
    setTimeout(() => {
      // Reset selection after action
      setPapers(prev => prev.map(p => ({
        ...p,
        topics: p.topics.map(t => ({ ...t, selected: false }))
      })))
      
      setExpandedId(null)
      setIsProcessing(false)
    }, 400)
  }

  const renderStatusIcon = (status: SyncStatus) => {
    switch (status) {
      case 'cloud': return <Cloud className="w-4 h-4 text-[#71717a]" />
      case 'syncing': return <Loader2 className="w-4 h-4 text-white animate-spin" />
      case 'downloaded': return <Check className="w-4 h-4 text-[#10b981]" />
    }
  }

  return (
    <div className="relative w-full max-w-md mx-auto min-h-[60vh] pb-24">
      
      <div className="flex flex-col gap-3">
        {papers.map((paper) => {
          const isExpanded = expandedId === paper.id
          
          return (
            <motion.div
              key={paper.id}
              layout
              initial={{ borderRadius: 16 }}
              className="bg-[#171717] border border-[#262626] overflow-hidden"
            >
              <button
                onClick={() => togglePaper(paper.id)}
                className="w-full flex items-center justify-between p-4 focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  {renderStatusIcon(paper.status)}
                  <span className="text-white font-medium tracking-tight text-[15px]">
                    {paper.title}
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <ChevronDown className="w-4 h-4 text-[#52525b]" />
                </motion.div>
              </button>

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    <div className="px-4 pb-4 flex flex-col gap-2 border-t border-[#262626] pt-4 mt-1">
                      {paper.topics.map((topic) => (
                        <button
                          key={topic.id}
                          onClick={() => toggleTopic(paper.id, topic.id)}
                          className="flex items-center justify-between group p-2 rounded-lg hover:bg-[#202020] transition-colors"
                        >
                          <span className="text-sm text-[#a1a1aa] group-hover:text-[#e4e4e7] transition-colors text-left pr-4">
                            {topic.title}
                          </span>
                          
                          {/* Minimal Custom Toggle/Checkbox */}
                          <div
                            className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all duration-200 ${
                              topic.selected 
                                ? 'bg-white border-white' 
                                : 'bg-transparent border-[#3f3f46] group-hover:border-[#52525b]'
                            }`}
                          >
                            {topic.selected && <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      {/* Floating Action Button (FAB) */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: 100, opacity: 0, x: '-50%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-8 left-1/2 z-50 w-full max-w-sm px-4"
          >
            <button
              onClick={handleAddCards}
              disabled={isProcessing}
              className="w-full bg-white text-black font-semibold py-4 rounded-xl shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:scale-[1.02] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin text-black" />
              ) : (
                `Add ${selectedCount} Topic${selectedCount > 1 ? 's' : ''} to Daily Deck`
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
