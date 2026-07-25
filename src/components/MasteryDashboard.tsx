'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Play, RefreshCw, Loader2, Database, BookOpen, Bell } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { syncMasteryData, resetSubtopicProgress } from '@/app/actions/study'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function MasteryDashboard({ userId }: { userId: string }) {
  const router = useRouter()
  const [isSyncing, setIsSyncing] = useState(false)
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({})
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({})
  const [isRefreshingProgress, setIsRefreshingProgress] = useState<string | null>(null)
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([])
  const [timeUntilRestock, setTimeUntilRestock] = useState<string>('')

  const toggleSelection = (id: string) => {
    setSelectedSubtopics(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  // Local queries
  const topics = useLiveQuery(() => db.topics.toArray())
  const subtopics = useLiveQuery(() => db.subtopics.toArray())
  const flashcards = useLiveQuery(() => db.flashcards.toArray())
  const cardProgress = useLiveQuery(() => db.user_card_progress.toArray())
  const activeSubtopics = useLiveQuery(() => db.user_active_subtopics.toArray())

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date()
      
      let nextTarget = new Date(now)
      nextTarget.setHours(24, 0, 0, 0) // Default to midnight

      let diff = nextTarget.getTime() - now.getTime()
      if (diff < 0) diff = 0
      
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      
      setTimeUntilRestock(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      )
    }
    
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [cardProgress])

  useEffect(() => {
    // Silent background sync on mount without triggering the massive pull-to-refresh spinner
    handleSync(true, true)
  }, [])

  const handleSync = async (silent = false, hideVisual = false) => {
    if (!navigator.onLine) {
      if (!silent) toast.error('You are offline. Showing cached local data.')
      return
    }

    if (!hideVisual) setIsSyncing(true)
    try {
      // CRITICAL FIX: Push any pending offline local progress to the cloud FIRST
      const pendingItems = await db.sync_queue.orderBy('timestamp').toArray()
      if (pendingItems.length > 0) {
        const pushRes = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: pendingItems }),
        })
        if (pushRes.ok) {
          const itemIds = pendingItems.map(item => item.id as number)
          await db.sync_queue.bulkDelete(itemIds)
        } else {
          const errData = await pushRes.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to push offline progress to server')
        }
      }

      // NOW that the cloud has our latest work, pull the entire DB state
      const res = await syncMasteryData()
      if (res.error) {
        if (!silent) toast.error('Sync failed: ' + res.error)
      } else {
        await db.transaction('rw', db.topics, db.subtopics, db.flashcards, db.user_card_progress, async () => {
          await db.topics.bulkPut(res.topics || [])
          await db.subtopics.bulkPut(res.subtopics || [])
          await db.flashcards.bulkPut(res.flashcards || [])
          
          await db.user_card_progress.clear()
          await db.user_card_progress.bulkPut(res.cardProgress || [])
        })
        if (!silent) toast.success('Database Synced')
      }
    } catch (err: any) {
      console.warn('Offline or sync failed:', err)
      if (!silent) toast.error('Network unreachable. Operating in offline mode.')
    } finally {
      if (!hideVisual) setIsSyncing(false)
    }
  }

  const handleResetProgress = async (subtopicId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!window.confirm('Are you sure you want to completely reset your spaced-repetition progress for this subtopic?')) {
      return
    }

    setIsRefreshingProgress(subtopicId)
    
    // Server Reset
    const res = await resetSubtopicProgress(subtopicId)
    if (res.success && res.deletedCardIds) {
      // Local Reset
      await db.user_card_progress.where('card_id').anyOf(res.deletedCardIds).delete()
      toast.success('Progress reset for subtopic')
    } else {
      toast.error('Failed to reset progress')
    }
    setIsRefreshingProgress(null)
  }

  const hierarchy = useMemo(() => {
    if (!topics || !subtopics) return {}
    const map: Record<string, any[]> = {}
    
    topics.forEach(t => {
      const subjKey = `${t.subject} - Form ${t.form}`
      if (!map[subjKey]) map[subjKey] = []
      
      const tSubs = subtopics.filter(s => s.topic_id === t.id)
      map[subjKey].push({ ...t, subtopics: tSubs })
    })

    // Sort topics by title logic (assuming titles have numbers like "1.1")
    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
    })

    return map
  }, [topics, subtopics])

  // Categorize Progress
  const { dailyDueBySubject, resumeCount, dailyDueCount, hasStartedLearning, cardsReviewedToday } = useMemo(() => {
    const result = {
      dailyDueBySubject: {} as Record<string, number>,
      resumeCount: 0,
      dailyDueCount: 0,
      hasStartedLearning: false,
      cardsReviewedToday: 0
    }

    if (!flashcards || !cardProgress || !subtopics || !topics) return result
    if (cardProgress.length > 0) result.hasStartedLearning = true
    
    const now = new Date().toISOString()
    const todayString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())
    
    // Create fast lookup maps
    const subtopicMap = new Map(subtopics.map(s => [s.id, s]))
    const topicMap = new Map(topics.map(t => [t.id, t]))
    const flashcardMap = new Map(flashcards.map(f => [f.id, f]))

    for (const progress of cardProgress) {
      if (progress.interval === 0) {
        // Abandoned mid-learning
        result.resumeCount++
        continue
      }
      
      // Check if they reviewed it TODAY
      if (progress.last_reviewed) {
        const reviewedString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(progress.last_reviewed))
        if (reviewedString === todayString && progress.interval > 0) {
          result.cardsReviewedToday++
        }
      }
      
      if (progress.next_review <= now) {
        // Due for daily review
        const card = flashcardMap.get(progress.card_id)
        if (!card) continue
        
        const subtopic = subtopicMap.get(card.subtopic_id)
        if (!subtopic) continue
        
        const topic = topicMap.get(subtopic.topic_id)
        if (!topic) continue
        
        const subjectName = topic.subject
        result.dailyDueCount++
        result.dailyDueBySubject[subjectName] = (result.dailyDueBySubject[subjectName] || 0) + 1
      }
    }
    
    return result
  }, [flashcards, cardProgress, subtopics, topics])

  const [showPushPrompt, setShowPushPrompt] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        setShowPushPrompt(true)
      }
    }
  }, [])

  // Pull to Refresh State
  const [startY, setStartY] = useState(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [isPulling, setIsPulling] = useState(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0) {
      setStartY(e.touches[0].clientY)
      setIsPulling(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPulling && window.scrollY <= 0) {
      const distance = e.touches[0].clientY - startY
      if (distance > 0) {
        setPullDistance(Math.min(distance, 120)) // Max pull distance visual
      } else {
        setPullDistance(0)
      }
    } else {
      setIsPulling(false)
      setPullDistance(0)
    }
  }

  const handleTouchEnd = () => {
    if (pullDistance > 80) {
      handleSync(true) // Force sync if pulled far enough
    }
    setIsPulling(false)
    setPullDistance(0)
  }

  const [dailyLimit, setDailyLimit] = useState(50)
  
  useEffect(() => {
    // Fetch user's visual limit so they don't get overwhelmed
    import('@/utils/supabase/client').then(({ createClient }) => {
      const supabase = createClient()
      supabase.from('user_settings').select('daily_card_limit').eq('id', userId).maybeSingle().then(({ data }) => {
        if (data?.daily_card_limit) setDailyLimit(data.daily_card_limit)
      })
    })
  }, [userId])

  return (
    <div 
      className="flex flex-col gap-10 w-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* PULL TO REFRESH INDICATOR */}
      <div 
        className="w-full flex justify-center overflow-hidden pointer-events-none"
        style={{ 
          height: isSyncing ? '60px' : `${pullDistance}px`,
          opacity: isSyncing ? 1 : pullDistance / 100,
          transition: isPulling ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' 
        }}
      >
        <div className="mt-2 bg-[#202020] border border-[#262626] rounded-full p-2 shadow-lg flex items-center justify-center">
          <RefreshCw 
            className={`w-6 h-6 text-blue-500 ${isSyncing ? 'animate-spin' : ''}`}
            style={{ transform: isSyncing ? 'none' : `rotate(${pullDistance * 4}deg)` }}
          />
        </div>
      </div>


      {/* PUSH NOTIFICATION PROMPT */}
      {showPushPrompt && (
        <section className="bg-gradient-to-r from-blue-500/10 to-[#171717] border border-blue-500/20 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 flex-shrink-0 bg-blue-500/20 rounded-full flex items-center justify-center">
              <Bell className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-white">Enable Daily Reminders</h2>
              <p className="text-[#a1a1aa] text-sm">
                Never lose your streak! Get notified at 5 PM and 11 PM if you haven't studied.
              </p>
            </div>
          </div>
          <button 
            onClick={() => router.push('/settings')}
            className="relative z-10 flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-700 transition-all whitespace-nowrap"
          >
            Go To Settings
          </button>
        </section>
      )}

      {/* SECTION 1: IN PROGRESS / RESUME LEARNING */}
      {resumeCount > 0 && (
        <section className="bg-gradient-to-r from-red-500/10 to-[#171717] border border-red-500/20 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-red-500/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="flex flex-col gap-2 relative z-10">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Uncompleted Mastery Session
            </h2>
            <p className="text-[#a1a1aa] text-sm">
              You abandoned a study session midway. You have {resumeCount} learning cards pending.
            </p>
          </div>
          <button 
            onClick={() => router.push('/study/resume')}
            className="relative z-10 flex items-center justify-center gap-2 px-6 py-3 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full font-bold hover:bg-red-500/30 transition-all"
          >
            Resume Session
          </button>
        </section>
      )}

      {/* SECTION 2: THE DAILY DECK */}
      <section className="bg-gradient-to-br from-[#171717] to-[#111] border border-[#262626] rounded-3xl p-8 flex flex-col gap-6 shadow-xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="flex flex-col gap-2 relative z-10">
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-blue-500" />
            Daily Deck
          </h2>
          <p className="text-[#a1a1aa] max-w-sm">
            Your global spaced-repetition pool. Cards you study in the Mastery Library graduate into this deck.
          </p>
          <div className="mt-2">
            {!hasStartedLearning ? (
              <span className="text-sm font-bold px-3 py-1 rounded-full bg-[#262626] text-[#a1a1aa]">
                Study below to unlock
              </span>
            ) : (
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${Math.min(dailyDueCount, Math.max(0, dailyLimit - cardsReviewedToday)) === 0 ? 'bg-green-500/20 text-green-400' : 'bg-[#ff9500]/20 text-[#ff9500]'}`}>
                {Math.min(dailyDueCount, Math.max(0, dailyLimit - cardsReviewedToday)) === 0 ? `🎉 Replenishes in ${timeUntilRestock}` : `${Math.min(dailyDueCount, Math.max(0, dailyLimit - cardsReviewedToday))} Cards Due`}
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Subject Buttons for Daily Deck */}
        {dailyDueCount > 0 && (
          <div className="relative z-10 flex flex-wrap gap-4 mt-2 border-t border-[#262626] pt-6">
            {Object.entries(dailyDueBySubject).map(([subject, count]) => (
              <button 
                key={subject}
                onClick={() => router.push(`/study/daily?subject=${encodeURIComponent(subject)}`)}
                className="flex items-center justify-between gap-4 px-6 py-4 bg-[#202020] border border-[#3f3f46] text-white rounded-2xl font-bold hover:bg-[#262626] hover:border-blue-500/50 transition-all shadow-sm hover:shadow-[0_0_15px_rgba(59,130,246,0.1)] group flex-1 min-w-[200px]"
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="text-sm text-[#a1a1aa] font-medium group-hover:text-blue-400 transition-colors">Study Subject</span>
                  <span className="text-lg">{subject}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-[#ff9500]/20 text-[#ff9500] px-3 py-1 rounded-full text-sm">
                    {Math.min(count, Math.max(0, dailyLimit - cardsReviewedToday))} Due
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* SECTION B: THE MASTERY LIBRARY */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Mastery Library</h2>
            <p className="text-[#a1a1aa] text-sm">Study specific subtopics on demand.</p>
          </div>
          <button 
            onClick={() => handleSync(false)}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-[#202020] text-[#a1a1aa] rounded-full text-xs font-bold hover:text-white transition-colors border border-[#262626]"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Force Sync
          </button>
        </div>

        {(!topics || topics.length === 0) ? (
          <div className="w-full h-64 border border-[#262626] rounded-3xl flex items-center justify-center bg-[#171717]">
             {isSyncing ? <Loader2 className="w-8 h-8 animate-spin text-[#a1a1aa]" /> : <p className="text-[#a1a1aa]">No topics found. Please sync database.</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Object.keys(hierarchy).sort().map(subjKey => {
              const isSubjExpanded = expandedSubjects[subjKey]
              return (
                <div key={subjKey} className="bg-[#171717] border border-[#262626] rounded-2xl overflow-hidden shadow-sm">
                  
                  {/* Subject Header */}
                  <button 
                    onClick={() => setExpandedSubjects(prev => ({ ...prev, [subjKey]: !isSubjExpanded }))}
                    className="w-full px-6 py-5 flex items-center justify-between bg-[#111111]/50 border-b border-[#262626] hover:bg-[#1f1f1f] transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {isSubjExpanded ? <ChevronDown className="w-5 h-5 text-[#a1a1aa]" /> : <ChevronRight className="w-5 h-5 text-[#a1a1aa]" />}
                      <div className="text-left">
                        <h3 className="text-xl font-bold text-white tracking-tight">{subjKey}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-medium text-[#71717a]">{hierarchy[subjKey].length} Topics</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* SPM Mastery Badge */}
                    {(() => {
                      const subjectSubtopicIds = hierarchy[subjKey].flatMap(t => t.subtopics.map((st: any) => st.id))
                      if (!flashcards || !cardProgress) return null;
                      
                      const subjectCards = flashcards.filter(c => subjectSubtopicIds.includes(c.subtopic_id))
                      if (subjectCards.length === 0) return null;
                      
                      const subjectProgress = cardProgress.filter(p => subjectCards.some(c => c.id === p.card_id))
                      
                      if (subjectProgress.length === 0) {
                        return (
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-bold text-[#71717a] tracking-widest uppercase">Unranked</span>
                            <span className="text-[10px] text-[#a1a1aa]">0% Assessed</span>
                          </div>
                        )
                      }
                      
                      const avgInterval = subjectProgress.reduce((sum, p) => sum + p.interval, 0) / Math.max(1, subjectProgress.length)
                      const coveragePercent = Math.round((subjectProgress.length / subjectCards.length) * 100)
                      
                      let grade = 'G'
                      let gradeColor = 'text-red-500'
                      let gradeName = 'Gagal'
                      
                      if (avgInterval >= 30) { grade = 'A+'; gradeColor = 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]'; gradeName = 'Cemerlang Tertinggi' }
                      else if (avgInterval >= 15) { grade = 'A'; gradeColor = 'text-green-400'; gradeName = 'Cemerlang' }
                      else if (avgInterval >= 7) { grade = 'B'; gradeColor = 'text-blue-400'; gradeName = 'Kepujian' }
                      else if (avgInterval >= 3) { grade = 'C'; gradeColor = 'text-purple-400'; gradeName = 'Baik' }
                      else if (avgInterval > 0) { grade = 'E'; gradeColor = 'text-orange-400'; gradeName = 'Lulus' }

                      return (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#a1a1aa] font-medium">{gradeName}</span>
                            <span className={`text-xl font-black ${gradeColor}`}>{grade}</span>
                          </div>
                          <span className="text-[10px] text-[#71717a] font-bold tracking-wider uppercase">
                            {coveragePercent}% Syllabus Assessed
                          </span>
                        </div>
                      )
                    })()}
                  </button>

                  {/* Topics List */}
                  <AnimatePresence>
                    {isSubjExpanded && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-col">
                          {hierarchy[subjKey].map((topic, index) => {
                            const isTopicExpanded = expandedTopics[topic.id]
                            const isLast = index === hierarchy[subjKey].length - 1

                            return (
                              <div key={topic.id} className={`${!isLast && 'border-b border-[#262626]'}`}>
                                <button
                                  onClick={() => setExpandedTopics(prev => ({ ...prev, [topic.id]: !isTopicExpanded }))}
                                  className="w-full px-8 py-4 flex items-center justify-between bg-[#171717] hover:bg-[#202020] transition-colors"
                                >
                                  <div className="flex items-center gap-3 text-left">
                                    {isTopicExpanded ? <ChevronDown className="w-4 h-4 text-[#71717a]" /> : <ChevronRight className="w-4 h-4 text-[#71717a]" />}
                                    <span className="text-[15px] font-semibold text-[#a1a1aa]">
                                      {topic.title}
                                    </span>
                                  </div>
                                </button>

                                <AnimatePresence>
                                  {isTopicExpanded && (
                                    <motion.div
                                      initial={{ height: 0 }}
                                      animate={{ height: 'auto' }}
                                      exit={{ height: 0 }}
                                      className="overflow-hidden bg-[#0A0A0A]"
                                    >
                                      <div className="pl-16 pr-6 py-4 flex flex-col gap-1">
                                        {topic.subtopics.map((st: any) => {
                                          // Check if there's any progress for this subtopic to show the Reset button
                                          const hasProgress = cardProgress?.some(p => 
                                            flashcards?.find(c => c.id === p.card_id)?.subtopic_id === st.id
                                          )

                                          return (
                                            <div key={st.id} className="flex items-center justify-between py-2 group">
                                              <div className="flex items-center gap-2 flex-1 pr-4">
                                                <input 
                                                  type="checkbox"
                                                  checked={selectedSubtopics.includes(st.id)}
                                                  onChange={() => toggleSelection(st.id)}
                                                  className="w-4 h-4 rounded border-[#3f3f46] bg-[#111] accent-blue-500 cursor-pointer"
                                                />
                                                <span className="text-sm text-white font-medium cursor-pointer" onClick={() => toggleSelection(st.id)}>
                                                  {st.title}
                                                </span>
                                              </div>
                                              
                                              <div className="flex items-center gap-2">
                                                {/* Reset Progress Button */}
                                                {hasProgress && (
                                                  <button
                                                    onClick={(e) => handleResetProgress(st.id, e)}
                                                    disabled={isRefreshingProgress === st.id}
                                                    className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-red-500/20 hover:text-red-400 transition-all border border-blue-500/20 hover:border-red-500/30"
                                                    title="Reset progress for this subtopic"
                                                  >
                                                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingProgress === st.id ? 'animate-spin text-red-500' : ''}`} />
                                                  </button>
                                                )}
                                                
                                                <button 
                                                  onClick={() => router.push(`/study/subtopic/${st.id}`)}
                                                  className="flex items-center gap-2 px-4 py-1.5 bg-[#262626] text-white rounded-full text-xs font-bold hover:bg-gray-200 hover:text-black transition-colors"
                                                >
                                                  Study Now <Play className="w-3 h-3" fill="currentColor" />
                                                </button>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Floating Action Bar for Multi-Select */}
      <AnimatePresence>
        {selectedSubtopics.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#171717] border border-[#262626] rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] px-6 py-4 flex items-center gap-6 z-50"
          >
            <div className="text-white font-bold">
              {selectedSubtopics.length} Selected
            </div>
            <button 
              onClick={() => router.push(`/study/custom?ids=${selectedSubtopics.join(',')}`)}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-full font-bold hover:bg-blue-600 transition-colors shadow-lg"
            >
              Study Selected <Play className="w-4 h-4" fill="currentColor" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
