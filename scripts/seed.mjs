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
  const dbTopicsRes = await supabase.from('topics').select('id, subject, form, title')
  const dbTopics = dbTopicsRes.data || []

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
      const existingTopic = dbTopics.find(dbT => dbT.subject === subject && dbT.form === form && dbT.title === t.topic_title)
      
      if (existingTopic) {
        topicId = existingTopic.id
      } else {
        const { data, error } = await supabase.from('topics').insert({
          subject, form, title: t.topic_title
        }).select('id').single()
        if (error) { console.error(`Error inserting topic ${t.topic_title}:`, error); continue; }
        topicId = data.id
      }
      touchedTopicIds.add(topicId)
      statTopics++

      // 2. Sync Subtopics
      const { data: existingSubtopics } = await supabase.from('subtopics').select('id, title').eq('topic_id', topicId)
      const subMap = new Map((existingSubtopics || []).map(st => [st.title, st.id]))

      for (const st of t.subtopics) {
        let subtopicId = subMap.get(st.subtopic_title)
        
        if (!subtopicId) {
          const { data, error } = await supabase.from('subtopics').insert({
            topic_id: topicId, title: st.subtopic_title
          }).select('id').single()
          if (error) { console.error(`Error inserting subtopic ${st.subtopic_title}:`, error); continue; }
          subtopicId = data.id
        }
        touchedSubtopicIds.add(subtopicId)
        statSubtopics++

        // 3. Sync Flashcards
        const { data: existingCards } = await supabase.from('flashcards').select('id, question').eq('subtopic_id', subtopicId)
        const cardMap = new Map((existingCards || []).map(c => [c.question, c.id]))

        const cardsToInsert = []
        for (const card of st.flashcards) {
          const existingCardId = cardMap.get(card.f_q)
          
          if (existingCardId) {
            // Update answer/type if needed
            await supabase.from('flashcards').update({
              answer: card.f_a,
              type: card.type
            }).eq('id', existingCardId)
            touchedFlashcardIds.add(existingCardId)
          } else {
            cardsToInsert.push({
              id: randomUUID(),
              subtopic_id: subtopicId,
              type: card.type || 'conceptual',
              question: card.f_q,
              answer: card.f_a
            })
          }
        }

        if (cardsToInsert.length > 0) {
          const { data: inserted, error: iErr } = await supabase.from('flashcards').insert(cardsToInsert).select('id')
          if (iErr) {
            console.error(`Error inserting cards for ${st.subtopic_title}:`, iErr)
          } else if (inserted) {
            inserted.forEach(c => touchedFlashcardIds.add(c.id))
          }
        }
        statCards += st.flashcards.length
      }
    }
  }

  // Cleanup Phase: Delete anything in DB that wasn't in the JSON
  console.log('\nCleaning up orphaned records (Bidirectional Sync)...')
  
  const allCardsRes = await supabase.from('flashcards').select('id')
  const allCards = allCardsRes.data || []
  const cardsToDelete = allCards.filter(c => !touchedFlashcardIds.has(c.id)).map(c => c.id)
  if (cardsToDelete.length > 0) {
    await supabase.from('flashcards').delete().in('id', cardsToDelete)
    console.log(`Deleted ${cardsToDelete.length} orphaned flashcards.`)
  }

  const allSubtopicsRes = await supabase.from('subtopics').select('id')
  const allSubtopics = allSubtopicsRes.data || []
  const subtopicsToDelete = allSubtopics.filter(s => !touchedSubtopicIds.has(s.id)).map(s => s.id)
  if (subtopicsToDelete.length > 0) {
    await supabase.from('subtopics').delete().in('id', subtopicsToDelete)
    console.log(`Deleted ${subtopicsToDelete.length} orphaned subtopics.`)
  }

  const allTopicsRes = await supabase.from('topics').select('id')
  const allTopics = allTopicsRes.data || []
  const topicsToDelete = allTopics.filter(t => !touchedTopicIds.has(t.id)).map(t => t.id)
  if (topicsToDelete.length > 0) {
    await supabase.from('topics').delete().in('id', topicsToDelete)
    console.log(`Deleted ${topicsToDelete.length} orphaned topics.`)
  }

  console.log(`\n✅ Seeding complete! Synced ${statTopics} Topics, ${statSubtopics} Subtopics, ${statCards} Flashcards.`)
}

main().catch(console.error)
