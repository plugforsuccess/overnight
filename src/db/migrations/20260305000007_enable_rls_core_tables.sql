-- Enable Row Level Security on core business tables that were missing it.
-- This prevents direct client-side access via the Supabase anon key.

-- Parents table
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;

CREATE POLICY parents_select_own ON public.parents
  FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY parents_update_own ON public.parents
  FOR UPDATE USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Children table
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

CREATE POLICY children_select_own ON public.children
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY children_insert_own ON public.children
  FOR INSERT WITH CHECK (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY children_update_own ON public.children
  FOR UPDATE USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY children_delete_own ON public.children
  FOR DELETE USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

-- Plans table (lookup/tier table — read-only for all authenticated users)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select_all ON public.plans
  FOR SELECT USING (auth.role() = 'authenticated');

-- Overnight blocks table (has parent_id — this is where plan ownership lives)
ALTER TABLE public.overnight_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY overnight_blocks_select_own ON public.overnight_blocks
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY overnight_blocks_update_own ON public.overnight_blocks
  FOR UPDATE USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

-- Reservations table (no parent_id — ownership via overnight_block_id -> overnight_blocks.parent_id)
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservations_select_own ON public.reservations
  FOR SELECT USING (
    overnight_block_id IN (
      SELECT ob.id FROM public.overnight_blocks ob
      JOIN public.parents p ON p.id = ob.parent_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY reservations_update_own ON public.reservations
  FOR UPDATE USING (
    overnight_block_id IN (
      SELECT ob.id FROM public.overnight_blocks ob
      JOIN public.parents p ON p.id = ob.parent_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- Waitlist table (has parent_id directly)
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY waitlist_select_own ON public.waitlist
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

-- Credits table (has parent_id)
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY credits_select_own ON public.credits
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

-- Nightly capacity — read-only for authenticated (needed by schedule page for spot counts)
ALTER TABLE public.nightly_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY nightly_capacity_select_all ON public.nightly_capacity
  FOR SELECT USING (auth.role() = 'authenticated');

-- Admin settings — read-only for authenticated users
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_settings') THEN
    EXECUTE 'ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY admin_settings_select_all ON public.admin_settings FOR SELECT USING (auth.role() = ''authenticated'')';
  END IF;
END $$;
