-- examtrack veritabanı
-- sqlite için yazıldı

PRAGMA foreign_keys = ON;

-- kullanıcı tablosu
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE,
    email           TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    daily_goal      INTEGER NOT NULL DEFAULT 200,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- soru ekleme kayıtları
CREATE TABLE IF NOT EXISTS question_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    subject         TEXT    NOT NULL,
    topic           TEXT    NOT NULL,
    question_count  INTEGER NOT NULL,
    has_failed      INTEGER NOT NULL DEFAULT 0,
    logged_at       TEXT    NOT NULL DEFAULT (date('now')),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_question_logs_user ON question_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_question_logs_date ON question_logs(user_id, logged_at);

-- ilerleme çubukları ders konu bazlı
CREATE TABLE IF NOT EXISTS progress_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    subject         TEXT    NOT NULL,
    topic           TEXT    NOT NULL,
    current_count   INTEGER NOT NULL DEFAULT 0,
    target_count    INTEGER NOT NULL DEFAULT 50,
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, subject, topic)
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON progress_items(user_id);

-- deneme netleri
CREATE TABLE IF NOT EXISTS exam_results (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    math_net        REAL    NOT NULL DEFAULT 0,
    turkish_net     REAL    NOT NULL DEFAULT 0,
    science_net     REAL    NOT NULL DEFAULT 0,
    social_net      REAL    NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exam_user ON exam_results(user_id);

-- zayıf konular listesi
CREATE TABLE IF NOT EXISTS weak_topics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    subject         TEXT    NOT NULL,
    topic           TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, subject, topic)
);

CREATE INDEX IF NOT EXISTS idx_weak_topics_user ON weak_topics(user_id);

-- pomodoro sayısı vs
CREATE TABLE IF NOT EXISTS user_stats (
    user_id         INTEGER PRIMARY KEY,
    week_pomodoros  INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- haftalık program 1=pazartesi 7=pazar
CREATE TABLE IF NOT EXISTS weekly_schedule (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    day_of_week     INTEGER NOT NULL,
    lesson          TEXT    NOT NULL DEFAULT '',
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_weekly_schedule_user ON weekly_schedule(user_id);
