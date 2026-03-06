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

-- Plans table
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select_own ON public.plans
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

-- Reservations table
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservations_select_own ON public.reservations
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY reservations_update_own ON public.reservations
  FOR UPDATE USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

-- Waitlist table
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY waitlist_select_own ON public.waitlist
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

-- Payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_select_own ON public.payments
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

-- Admin settings — read-only for authenticated users
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_settings') THEN
    EXECUTE 'ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY admin_settings_select_all ON public.admin_settings FOR SELECT USING (auth.role() = ''authenticated'')';
  END IF;
END $$;
