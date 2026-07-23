import Dexie, { type Table } from 'dexie'

export interface LocalQuestion {
  id: string
  paper_id: string
  question_label: string
  marks: number
  concept_key: string
  has_diagram: boolean
}

export interface LocalFlashcard {
  id: string
  question_id: string
  ref_id: string
  front_text: string
  back_text: string
  card_type: string
  is_alt: boolean
}

export interface LocalUserProgress {
  user_id: string
  flashcard_id: string
  ease_factor: number
  interval: number
  next_review_at: string
  last_reviewed_at: string
}

export interface SyncQueueItem {
  id?: number
  action: string
  payload: any
  timestamp: string
}

export class SchemaAIDatabase extends Dexie {
  questions!: Table<LocalQuestion, string>
  flashcards!: Table<LocalFlashcard, string>
  user_progress!: Table<LocalUserProgress, string[]>
  sync_queue!: Table<SyncQueueItem, number>

  constructor() {
    super('SchemaAIDatabase')
    this.version(2).stores({
      questions: 'id, paper_id, concept_key',
      flashcards: 'id, question_id',
      user_progress: '[user_id+flashcard_id]',
      sync_queue: '++id, action, timestamp'
    })
  }
}

export const db = new SchemaAIDatabase()
