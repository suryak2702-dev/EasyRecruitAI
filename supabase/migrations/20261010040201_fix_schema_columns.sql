/*
# Fix schema column mismatches

1. Add `profile_complete` boolean column to `app_users` (defaults to false)
2. Add `resume_text` text column to `job_applications` (nullable, for storing extracted resume text)
3. These columns are needed by the Next.js API routes to match the frontend type expectations.
*/

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS profile_complete boolean DEFAULT false;

ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS resume_text text;
