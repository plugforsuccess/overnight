-- CreateTable: centers
-- A physical care facility location.
CREATE TABLE "centers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "address_line_1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "centers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "centers_slug_key" ON "centers"("slug");

-- CreateTable: programs
-- A care offering at a center (e.g., "Overnight Care").
CREATE TABLE "programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "care_type" TEXT NOT NULL DEFAULT 'overnight',
    "start_time" TEXT NOT NULL DEFAULT '21:00',
    "end_time" TEXT NOT NULL DEFAULT '07:00',
    "age_min_months" INTEGER,
    "age_max_months" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "programs_care_type_check" CHECK (
        "care_type" IN ('overnight', 'daycare', 'drop_in')
    )
);

-- CreateIndex
CREATE INDEX "idx_programs_center_id" ON "programs"("center_id");

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_center_id_fkey"
    FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE;
