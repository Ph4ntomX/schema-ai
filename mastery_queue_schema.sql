-- 1. Topics Table
CREATE TABLE IF NOT EXISTS topics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  subject TEXT NOT NULL,
  form TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Subtopics Table
CREATE TABLE IF NOT EXISTS subtopics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Flashcards Table
CREATE TABLE IF NOT EXISTS flashcards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('reference', 'evidence', 'conceptual')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. User Active Subtopics (Mastery Queue)
CREATE TABLE IF NOT EXISTS user_active_subtopics (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, subtopic_id)
);

-- 5. User Card Progress (SM-2)
CREATE TABLE IF NOT EXISTS user_card_progress (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID REFERENCES flashcards(id) ON DELETE CASCADE,
  ease_factor REAL DEFAULT 2.5 NOT NULL,
  interval INTEGER DEFAULT 0 NOT NULL,
  repetitions INTEGER DEFAULT 0 NOT NULL,
  next_review TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_reviewed TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

-- 6. Add RLS Policies
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_active_subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_card_progress ENABLE ROW LEVEL SECURITY;

-- Read access for public curated content
CREATE POLICY "Public read topics" ON topics FOR SELECT USING (true);
CREATE POLICY "Public read subtopics" ON subtopics FOR SELECT USING (true);
CREATE POLICY "Public read flashcards" ON flashcards FOR SELECT USING (true);

-- User specific access
CREATE POLICY "Users can manage their active subtopics" ON user_active_subtopics FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their progress" ON user_card_progress FOR ALL USING (auth.uid() = user_id);
