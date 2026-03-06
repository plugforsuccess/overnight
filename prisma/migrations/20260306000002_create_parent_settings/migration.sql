-- CreateTable
CREATE TABLE "parent_settings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "parent_id" UUID NOT NULL,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,
    "sms_notifications" BOOLEAN NOT NULL DEFAULT false,
    "reservation_reminders" BOOLEAN NOT NULL DEFAULT true,
    "billing_reminders" BOOLEAN NOT NULL DEFAULT true,
    "emergency_alerts" BOOLEAN NOT NULL DEFAULT true,
    "require_pickup_pin" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_check_in_out" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_pickup_changes" BOOLEAN NOT NULL DEFAULT true,
    "emergency_contact_reminder" BOOLEAN NOT NULL DEFAULT true,
    "preferred_contact_method" TEXT,
    "preferred_reminder_timing" TEXT,
    "staff_notes" TEXT,
    "language_preference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parent_settings_parent_id_key" ON "parent_settings"("parent_id");

-- AddForeignKey
ALTER TABLE "parent_settings" ADD CONSTRAINT "parent_settings_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE public.parent_settings ENABLE ROW LEVEL SECURITY;

-- RLS: Parents can only read their own settings row
CREATE POLICY parent_settings_select_own ON public.parent_settings
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

-- RLS: Parents can create their own settings row
CREATE POLICY parent_settings_insert_own ON public.parent_settings
  FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid());

-- RLS: Parents can update their own settings row
CREATE POLICY parent_settings_update_own ON public.parent_settings
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- RLS: No parent DELETE policy — lifecycle tied to parent via CASCADE.
-- Settings row is created once and persists for the life of the account.

-- RLS: Admins can manage all settings
CREATE POLICY admins_manage_parent_settings ON public.parent_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parents WHERE id = auth.uid() AND role = 'admin'));
