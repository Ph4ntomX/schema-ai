import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

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

const dataDir = path.resolve(__dirname, '../data')

async function main() {
  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found at ${dataDir}. Creating one for you...`)
    fs.mkdirSync(dataDir, { recursive: true })
    console.log("Please populate the /data directory with your JSON files and run again.")
    process.exit(0)
  }

  const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'))

  if (files.length === 0) {
    console.log("No JSON files found in /data directory. Wiping all papers from database...")
    await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000') // Deletes all
    return
  }

  console.log(`Found ${files.length} JSON files. Beginning bidirectional sync...`)

  // 1. Delete papers from DB that no longer have a JSON file
  const activePaperIds = files.map(f => path.basename(f, '.json'))
  const { data: dbPapers } = await supabase.from('questions').select('paper_id')
  
  if (dbPapers) {
    const dbPaperIds = [...new Set(dbPapers.map(p => p.paper_id))]
    const papersToDelete = dbPaperIds.filter(id => !activePaperIds.includes(id))
    
    if (papersToDelete.length > 0) {
      console.log(`Deleting ${papersToDelete.length} orphaned papers from database...`)
      await supabase.from('questions').delete().in('paper_id', papersToDelete)
    }
  }

  for (const file of files) {
    const paperId = path.basename(file, '.json')
    const filePath = path.join(dataDir, file)
    console.log(`\nProcessing: ${paperId}`)

    // Parse JSON
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    let questionsData
    try {
      questionsData = JSON.parse(fileContent)
    } catch (e) {
      console.error(`Failed to parse ${file}:`, e.message)
      continue
    }

    console.log(`Syncing data for paper_id: ${paperId}...`)

    // Fetch existing questions for this paper to preserve IDs
    const { data: existingQuestions, error: eqError } = await supabase
      .from('questions')
      .select('id, question_label')
      .eq('paper_id', paperId)

    if (eqError) {
      console.error(`Failed to fetch existing questions for ${paperId}:`, eqError)
      continue
    }

    const existingQMap = new Map()
    existingQuestions?.forEach(q => existingQMap.set(q.question_label, q.id))

    // Track active questions to delete missing ones
    const activeQuestionLabels = questionsData.map(q => q.id)
    const questionsToDelete = Array.from(existingQMap.keys()).filter(label => !activeQuestionLabels.includes(label))
    
    if (questionsToDelete.length > 0) {
      const idsToDelete = questionsToDelete.map(label => existingQMap.get(label))
      await supabase.from('questions').delete().in('id', idsToDelete)
      console.log(`Deleted ${questionsToDelete.length} orphaned questions.`)
    }

    let insertedQuestions = 0
    let updatedQuestions = 0
    let insertedFlashcards = 0
    let updatedFlashcards = 0

    // Process each question
    for (const q of questionsData) {
      const { id: qn_label, qn, m, c_key, has_diagram, r } = q
      let questionUuid = existingQMap.get(qn_label)

      if (questionUuid) {
        // Update existing question
        await supabase
          .from('questions')
          .update({ marks: m, concept_key: c_key, has_diagram })
          .eq('id', questionUuid)
        updatedQuestions++
      } else {
        // Insert new question
        const { data: insertedQuestion, error: qError } = await supabase
          .from('questions')
          .insert({
            paper_id: paperId,
            question_label: qn_label,
            marks: m,
            concept_key: c_key,
            has_diagram: has_diagram
          })
          .select('id')
          .single()

        if (qError) {
          console.error(`Failed to insert question ${qn_label}:`, qError)
          continue
        }
        questionUuid = insertedQuestion.id
        insertedQuestions++
      }

      // Process flashcards for this question
      if (r && Array.isArray(r)) {
        // Fetch existing flashcards
        const { data: existingCards } = await supabase
          .from('flashcards')
          .select('id, ref_id')
          .eq('question_id', questionUuid)
          
        const existingCardMap = new Map()
        existingCards?.forEach(c => existingCardMap.set(c.ref_id, c.id))

        // Track active flashcards to delete missing ones
        const activeCardRefs = r.map(c => c.id)
        const cardsToDelete = Array.from(existingCardMap.keys()).filter(ref => !activeCardRefs.includes(ref))
        
        if (cardsToDelete.length > 0) {
          const idsToDelete = cardsToDelete.map(ref => existingCardMap.get(ref))
          await supabase.from('flashcards').delete().in('id', idsToDelete)
        }

        const cardsToInsert = []

        for (const card of r) {
          const existingCardId = existingCardMap.get(card.id)
          if (existingCardId) {
            // Update existing flashcard
            await supabase
              .from('flashcards')
              .update({
                front_text: card.f,
                back_text: card.t,
                card_type: card.type,
                is_alt: card.alt || false
              })
              .eq('id', existingCardId)
            updatedFlashcards++
          } else {
            // Queue for insert
            cardsToInsert.push({
              question_id: questionUuid,
              ref_id: card.id,
              front_text: card.f,
              back_text: card.t,
              card_type: card.type,
              is_alt: card.alt || false
            })
          }
        }

        if (cardsToInsert.length > 0) {
          const { error: fError } = await supabase
            .from('flashcards')
            .insert(cardsToInsert)

          if (fError) {
            console.error(`Failed to insert flashcards for question ${qn_label}:`, fError)
          } else {
            insertedFlashcards += cardsToInsert.length
          }
        }
      }
    }

    console.log(`Successfully synced ${paperId}: Inserted ${insertedQuestions} qs / ${insertedFlashcards} cards. Updated ${updatedQuestions} qs / ${updatedFlashcards} cards.`)
  }

  console.log("\n✅ Seeding complete!")
}

main().catch(console.error)
