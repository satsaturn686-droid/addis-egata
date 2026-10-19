
-- apps/api/src/db/app-auth-schema.sql

-- App-only users must be allowed to have no Telegram ID.
-- Existing Telegram users and their IDs remain unchanged.
ALTER TABLE users
  ALTER COLUMN telegram_id DROP NOT NULL;

-- Login credentials for the standalone Android app.
CREATE TABLE IF NOT EXISTS app_credentials (
  user_id UUID PRIMARY KEY
    REFERENCES users(id) ON DELETE CASCADE,

  login_identifier TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT app_credentials_identifier_length
    CHECK (
      char_length(login_identifier) BETWEEN 3 AND 255
    )
);

-- Hashed session tokens only; raw tokens are never stored.
CREATE TABLE IF NOT EXISTS app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx
  ON app_sessions(user_id);

CREATE INDEX IF NOT EXISTS app_sessions_expires_at_idx
  ON app_sessions(expires_at);
