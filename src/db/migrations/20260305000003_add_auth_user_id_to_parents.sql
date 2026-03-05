-- Migration 3: Add auth_user_id to parents
-- Converted from 20260305000003_add_auth_user_id_to_parents.js for Supabase SQL Editor

ALTER TABLE parents ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
