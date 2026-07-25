import Dexie, { type Table } from 'dexie'

export interface LocalTopic {
  id: string
  subject: string
  form: number
  title: string
}

export interface LocalSubtopic {
  id: string
  topic_id: string
  title: string
}

export interface LocalFlashcard {
  id: string
  subtopic_id: string
  type: string
  question: string
  answer: string
}

export interface LocalUserActiveSubtopic {
  user_id: string
  subtopic_id: string
  added_at: string
}

export interface LocalUserCardProgress {
  user_id: string
  card_id: string
  ease_factor: number
  interval: number
  repetitions: number
  next_review: string
  last_reviewed: string
}

export interface SyncQueueItem {
  id?: number
  action: string
  payload: any
  timestamp: string
}

export class SchemaAIDatabase extends Dexie {
  topics!: Table<LocalTopic, string>
  subtopics!: Table<LocalSubtopic, string>
  flashcards!: Table<LocalFlashcard, string>
  user_active_subtopics!: Table<LocalUserActiveSubtopic, string[]>
  user_card_progress!: Table<LocalUserCardProgress, string[]>
  sync_queue!: Table<SyncQueueItem, number>

  constructor() {
    super('SchemaAIDatabase')
    this.version(3).stores({
      topics: 'id, subject, form',
      subtopics: 'id, topic_id',
      flashcards: 'id, subtopic_id, type',
      user_active_subtopics: '[user_id+subtopic_id], user_id, subtopic_id',
      user_card_progress: '[user_id+card_id], user_id, card_id',
      sync_queue: '++id, action, timestamp'
    })
  }
}

export const db = new SchemaAIDatabase()
