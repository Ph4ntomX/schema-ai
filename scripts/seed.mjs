import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

// Setup for ES Modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

// Initialize Supabase client using Service Role Key to bypass RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function fetchAll(table, selectStr, orderCol = null, orderOpts = {}) {
  let allData = []
  let from = 0
  const size = 999
  while (true) {
    let query = supabase.from(table).select(selectStr).range(from, from + size)
    if (orderCol) query = query.order(orderCol, orderOpts)
    const { data, error } = await query
    if (error) { console.error(`Error fetching ${table}:`, error); break; }
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length <= size) break
    from += size + 1
  }
  return { data: allData }
}

const dataDir = path.resolve(__dirname, '../notes_output')

async function main() {
  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found at ${dataDir}.`)
    process.exit(1)
  }

  const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'))

  if (files.length === 0) {
    console.log("No JSON files found in /notes_output directory. Wiping all topics from database...")
    await supabase.from('topics').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    return
  }

  console.log(`Found ${files.length} JSON files. Beginning bidirectional sync for Mastery Queue...`)

  // Parse files into structured data
  const parsedData = []
  for (const file of files) {
    const filePath = path.join(dataDir, file)
    let subject = "Unknown"
    let form = 4 // Default to 4
    
    // e.g. "biology-pandai-form-4.json"
    const lowerName = file.toLowerCase()
    if (lowerName.includes('biology')) subject = "Biology"
    else if (lowerName.includes('chemistry')) subject = "Chemistry"
    else if (lowerName.includes('physics')) subject = "Physics"
    else if (lowerName.includes('sejarah')) subject = "Sejarah"
    else if (lowerName.includes('islam')) subject = "Pendidikan Islam"
    
    if (lowerName.includes('form-4') || lowerName.includes('form4')) form = 4
    else if (lowerName.includes('form-5') || lowerName.includes('form5')) form = 5

    const content = fs.readFileSync(filePath, 'utf-8')
    try {
      const topics = JSON.parse(content)
      parsedData.push({ subject, form, topics, filename: file })
    } catch (e) {
      console.error(`Failed to parse ${file}: ${e.message}`)
    }
  }

  // Group by subject/form to manage deletions
  const dbTopicsRes = await fetchAll('topics', 'id, subject, form, title')
  const dbTopics = dbTopicsRes.data || []

  // Fetch all hierarchy data to build a flexible global memory map that allows migrating across subjects (e.g. Unknown -> Pendidikan Islam)
  const allDbCardsRes = await fetchAll('flashcards', 'id, question, created_at', 'created_at', { ascending: false })

  const globalCardMap = new Map()
  for (const c of (allDbCardsRes.data || [])) {
    // Pure question matching guarantees that old cards can securely migrate to new topics without spawning duplicates
    globalCardMap.set(c.question, c.id)
  }

  // Clean function to ignore 'Bab' and 'Chapter' prefixes when matching
  function cleanTitle(title) {
    if (!title) return ''
    return title.replace(/^(Chapter|Bab)\s+\d+(\.\d+)?\s*:\s*/i, '').trim()
  }

  // Track what we touch to delete the rest
  const touchedTopicIds = new Set()
  const touchedSubtopicIds = new Set()
  const touchedFlashcardIds = new Set()

  let statTopics = 0, statSubtopics = 0, statCards = 0

  for (const fileData of parsedData) {
    const { subject, form, topics, filename } = fileData
    console.log(`\nProcessing: ${filename} (${subject} - ${form})`)

    for (const t of topics) {
      // 1. Sync Topic
      let topicId = null
      const cleanJsonTitle = cleanTitle(t.topic_title)
      const existingTopic = dbTopics.find(dbT => 
        (dbT.subject === subject || dbT.subject === 'Unknown') && 
        dbT.form === form && 
        cleanTitle(dbT.title) === cleanJsonTitle
      )
      
      if (existingTopic) {
        topicId = existingTopic.id
        if (existingTopic.subject === 'Unknown' && subject !== 'Unknown') {
          await supabase.from('topics').update({ subject }).eq('id', topicId)
          existingTopic.subject = subject
          console.log(`[UPDATE] Topic Subject: ${existingTopic.title} -> ${subject}`)
        }
      } else {
        const { data, error } = await supabase.from('topics').insert({
          subject, form, title: t.topic_title
        }).select('id').single()
        if (error) { console.error(`Error inserting topic ${t.topic_title}:`, error); continue; }
        console.log(`[INSERT] Topic: ${t.topic_title}`)
        topicId = data.id
      }
      touchedTopicIds.add(topicId)
      statTopics++

      // 2. Sync Subtopics
      const existingSubtopicsRes = await fetchAll('subtopics', 'id, title')
      const existingSubtopics = existingSubtopicsRes.data?.filter(st => st.topic_id === topicId) || []

      for (const st of t.subtopics) {
        const cleanJsonSubTitle = cleanTitle(st.subtopic_title)
        const existingSubtopic = existingSubtopics.find(dbSt => cleanTitle(dbSt.title) === cleanJsonSubTitle)
        
        let subtopicId = null
        if (existingSubtopic) {
          subtopicId = existingSubtopic.id
        } else {
          const { data, error } = await supabase.from('subtopics').insert({
            topic_id: topicId, title: st.subtopic_title
          }).select('id').single()
          if (error) { console.error(`Error inserting subtopic ${st.subtopic_title}:`, error); continue; }
          console.log(`[INSERT] Subtopic: ${st.subtopic_title}`)
          subtopicId = data.id
        }
        touchedSubtopicIds.add(subtopicId)
        statSubtopics++

        // 3. Sync Flashcards with UPSERT logic
        const cardsToUpsert = []
        for (const card of st.flashcards) {
          let cardId = globalCardMap.get(card.f_q)
          
          if (!cardId) {
            // Completely new card
            cardId = randomUUID()
            globalCardMap.set(card.f_q, cardId)
          }

          cardsToUpsert.push({
            id: cardId,
            subtopic_id: subtopicId,
            type: card.type || 'conceptual',
            question: card.f_q,
            answer: card.f_a
          })
          touchedFlashcardIds.add(cardId)
        }

        if (cardsToUpsert.length > 0) {
          const { error: iErr } = await supabase.from('flashcards').upsert(cardsToUpsert, { onConflict: 'id' })
          if (iErr) {
            console.error(`Error upserting cards for ${st.subtopic_title}:`, iErr)
          } else {
            console.log(`[UPSERT] ${cardsToUpsert.length} flashcards in Subtopic: ${st.subtopic_title}`)
          }
        }
        statCards += st.flashcards.length
      }
    }
  }

  // Cleanup Phase: Delete anything in DB that wasn't in the JSON
  console.log('\nCleaning up orphaned records (Bidirectional Sync)...')
  
  const allCardsRes = await fetchAll('flashcards', 'id')
  const allCards = allCardsRes.data || []
  
  // HARD SAFETY CHECK: Never delete flashcards that have spaced-repetition progress
  const progressDataRes = await fetchAll('user_card_progress', 'card_id')
  const cardsWithProgress = new Set((progressDataRes.data || []).map(p => p.card_id))

  const cardsToDelete = allCards.filter(c => !touchedFlashcardIds.has(c.id) && !cardsWithProgress.has(c.id)).map(c => c.id)
  if (cardsToDelete.length > 0) {
    await supabase.from('flashcards').delete().in('id', cardsToDelete)
    console.log(`[DELETE] ${cardsToDelete.length} orphaned flashcards (skipped cards with active progress).`)
  }

  // To prevent Supabase ON DELETE CASCADE from destroying our safe flashcards, we must protect their parent subtopics/topics
  const survivingCardsRes = await fetchAll('flashcards', 'subtopic_id')
  const safeSubtopicIds = new Set((survivingCardsRes.data || []).map(c => c.subtopic_id))

  // HARD SAFETY CHECK: Never delete subtopics that are actively selected in user_active_subtopics
  const activeSubtopicsRes = await fetchAll('user_active_subtopics', 'subtopic_id')
  const activeSubtopics = new Set((activeSubtopicsRes.data || []).map(a => a.subtopic_id))

  const cleanupSubtopicsRes = await fetchAll('subtopics', 'id, topic_id')
  const allSubtopics = cleanupSubtopicsRes.data || []
  const subtopicsToDelete = allSubtopics.filter(s => !touchedSubtopicIds.has(s.id) && !safeSubtopicIds.has(s.id) && !activeSubtopics.has(s.id)).map(s => s.id)
  if (subtopicsToDelete.length > 0) {
    await supabase.from('subtopics').delete().in('id', subtopicsToDelete)
    console.log(`[DELETE] ${subtopicsToDelete.length} orphaned subtopics (skipped ones holding safe flashcards).`)
  }

  const survivingSubtopicsRes = await fetchAll('subtopics', 'topic_id')
  const safeTopicIds = new Set((survivingSubtopicsRes.data || []).map(s => s.topic_id))

  const cleanupTopicsRes = await fetchAll('topics', 'id')
  const allTopics = cleanupTopicsRes.data || []
  const topicsToDelete = allTopics.filter(t => !touchedTopicIds.has(t.id) && !safeTopicIds.has(t.id)).map(t => t.id)
  if (topicsToDelete.length > 0) {
    await supabase.from('topics').delete().in('id', topicsToDelete)
    console.log(`[DELETE] ${topicsToDelete.length} orphaned topics (skipped ones holding safe subtopics).`)
  }

  console.log(`\n✅ Seeding complete! Synced ${statTopics} Topics, ${statSubtopics} Subtopics, ${statCards} Flashcards.`)
}

main().catch(console.error)
