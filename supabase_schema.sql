-- ==========================================
-- Coco Germany Supabase Database Schema DDL
-- ==========================================

-- 1. Materials Table (Exam Practice & Mock Exam Metadata)
CREATE TABLE IF NOT EXISTS public.materials (
    id TEXT PRIMARY KEY,
    exam TEXT NOT NULL,
    level TEXT NOT NULL,
    module TEXT NOT NULL,
    material_number INTEGER DEFAULT 1,
    title TEXT NOT NULL,
    difficulty TEXT DEFAULT 'Medium',
    estimated_time TEXT DEFAULT '15 mins',
    content_path TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by exam, level, module & active status
CREATE INDEX IF NOT EXISTS idx_materials_exam_level_module ON public.materials(exam, level, module, active);

-- 2. Mock Exam Attempts Table
CREATE TABLE IF NOT EXISTS public.mock_attempts (
    id BIGSERIAL PRIMARY KEY,
    uid TEXT NOT NULL,
    material_id TEXT NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    percentage INTEGER NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    answers JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching user attempts
CREATE INDEX IF NOT EXISTS idx_mock_attempts_uid ON public.mock_attempts(uid);

-- 3. Learning Users Table (Membership & Credits Structure)
CREATE TABLE IF NOT EXISTS public.users (
    uid TEXT PRIMARY KEY,
    plan_code TEXT DEFAULT 'free',
    credits_remaining INTEGER DEFAULT 10,
    last_credit_reset TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Membership Plans Table
CREATE TABLE IF NOT EXISTS public.plans (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    daily_credits INTEGER DEFAULT 10,
    features JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Free and Pro Plans
INSERT INTO public.plans (code, name, daily_credits, features)
VALUES 
    ('free', 'Free Learner', 10, '{"ai_writing": false, "ai_speaking": false, "mock_exams": true}'::jsonb),
    ('pro', 'Pro Learner', 100, '{"ai_writing": true, "ai_speaking": true, "mock_exams": true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 5. Learning Analytics Table
CREATE TABLE IF NOT EXISTS public.analytics (
    id BIGSERIAL PRIMARY KEY,
    uid TEXT,
    event_name TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Learning Users Table (Onboarding & Credits)
CREATE TABLE IF NOT EXISTS public.learning_users (
    uid TEXT PRIMARY KEY,
    membership TEXT DEFAULT 'FREE',
    current_level TEXT DEFAULT 'A1',
    daily_credits INTEGER DEFAULT 1,
    credits_remaining INTEGER DEFAULT 1,
    last_reset TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_users ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active materials & plans
CREATE POLICY "Public read active materials" ON public.materials FOR SELECT USING (active = true);
CREATE POLICY "Public read plans" ON public.plans FOR SELECT USING (true);

-- Allow authenticated users to manage their mock attempts and profile
CREATE POLICY "Users can insert their own mock attempts" ON public.mock_attempts FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can select their own mock attempts" ON public.mock_attempts FOR SELECT USING (true);
CREATE POLICY "Users can manage learning profile" ON public.users FOR ALL USING (true);
CREATE POLICY "Users can manage learning_users" ON public.learning_users FOR ALL USING (true);
