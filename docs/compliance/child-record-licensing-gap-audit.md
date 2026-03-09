# Child Record Licensing Gap Audit

**Audit Date:** 2026-03-09
**Standard:** Georgia DECAL Rules for Family Child Care Learning Homes / Overnight Care
**Scope:** Database schema, API routes, UI workflows, RLS policies, enforcement logic
**Auditor:** Automated compliance review (Claude)

---

## Executive Summary

The platform has **strong coverage** for core child-file records but has **critical gaps** in immunization records and medication authorization that would fail a Georgia-style licensing inspection. Parent contact information is structurally present but **lacks a dedicated UI workflow**. Physician information is stored as optional free-text with no enforcement. Document upload infrastructure is **entirely absent**.

| Verdict | Count |
|---------|-------|
| Supported | 4 |
| Partially Supported | 3 |
| Missing | 2 |

**Licensing Risk Level: HIGH** — Two fully missing record categories and three partially-supported categories would constitute findings during an inspection.

---

## Record-by-Record Audit

### 1. Child Name and Birthdate

**Status: Supported**

#### Schema Location
- **Model:** `Child` (`prisma/schema.prisma:203–242`)
- **Table:** `children`
- **Fields:** `first_name` (String, required), `last_name` (String, required), `middle_name` (String, optional), `preferred_name` (String, optional), `date_of_birth` (Date, nullable at DB level)

#### UI Location
- **Page:** `/dashboard/children` (`src/app/dashboard/children/page.tsx`)
- **Component:** `ChildFormBasics` (`src/components/children/ChildFormBasics.tsx`)
- **Tab:** "Basics" — first tab shown when a child is selected

#### API Location
- **Create:** `POST /api/children` (`src/app/api/children/route.ts`)
- **Update:** `PUT /api/children` (`src/app/api/children/route.ts`)
- **Read:** `GET /api/children/[id]/details` (`src/app/api/children/[id]/details/route.ts`)

#### RLS / Access Control
- Parent can only read/write their own children (`parent_id = auth.uid()`)
- Admin can read all children via staff membership

#### Licensing Risk
- `date_of_birth` is nullable at the database level (`DateTime?`), though the Zod validation schema (`childBasicsSchema`) requires it on create/update. A child row could theoretically exist without a DOB if inserted outside the API (e.g., direct DB insert, migration). **Low risk** — validation covers the application path.
- Middle name and preferred name are optional, which is acceptable.

#### Required Fix
- **Minor:** Add a `NOT NULL` constraint on `date_of_birth` in the database to prevent bypass via direct inserts. This aligns the DB constraint with the Zod validation.

---

### 2. Parent Contact Information

**Status: Partially Supported**

#### Schema Location
- **Model:** `Parent` (`prisma/schema.prisma:169–200`)
- **Table:** `parents`
- **Fields:** `first_name` (String, required), `last_name` (String, required), `email` (String, required, unique), `phone` (String, nullable), `address` (String, nullable)

#### UI Location
- **No dedicated parent profile edit page exists.** Parent name and email are collected at signup. Phone and address are nullable with no UI form to manage them post-signup.
- The admin safety dashboard (`src/app/admin/safety/page.tsx`) displays parent contact info for staff reference.

#### API Location
- Parent record is auto-created by the `handle_new_user()` Postgres trigger when a user signs up via Supabase Auth.
- **No dedicated `PATCH /api/parents` or `/api/profile` route exists** for parents to update their phone or address.

#### RLS / Access Control
- Parents can read their own row. No explicit write policy for parent self-update was identified in the API routes.

#### Licensing Risk: HIGH
- **Phone number is nullable and has no UI to set it.** Georgia licensing requires parent contact phone on file. If a parent signs up with only email, there is no mechanism to collect their phone number.
- **Address is nullable and has no UI.** Some licensing frameworks require parent home address on file.
- Parent contact info is not enforced during onboarding — the `onboarding_status` state machine does not include a "parent phone required" gate.

#### Required Fix
- **Schema:** Make `phone` required (non-nullable) or add an onboarding enforcement check.
- **API:** Add `PATCH /api/profile` route for parents to update their own contact info.
- **UI:** Add a "Parent Profile" tab or page at `/dashboard/profile` with fields for phone, address, and name edits.
- **Enforcement:** Add a parent phone validation step to onboarding. The `onboarding_status` transition to `parent_profile_complete` should verify phone is set.
- **Validation:** Add Zod schema for parent profile updates with phone validation (10-11 digits).

---

### 3. Physician Contact Information

**Status: Partially Supported**

#### Schema Location
- **Model:** `ChildMedicalProfile` (`prisma/schema.prisma:291–317`)
- **Table:** `child_medical_profiles`
- **Fields:** `physician_name` (String, nullable), `physician_phone` (String, nullable), `hospital_preference` (String, nullable)
- **Also:** `ChildAllergyActionPlan.physician_name` (String, nullable) — per-allergy physician, separate from primary physician

#### UI Location
- **No dedicated physician info UI exists.** The medical profile API supports `physician_name`, `physician_phone`, and `hospital_preference` fields, but:
  - The children management page (`/dashboard/children`) has tabs for Basics, Allergies, Emergency Contacts, and Authorized Pickups — **there is no "Medical Profile" or "Physician" tab**.
  - The `ChildAllergiesEditor` component includes a `physician_name` field within each allergy action plan, but this is per-allergy, not the child's primary physician.
  - **There is no UI anywhere for parents to enter `physician_phone` or `hospital_preference`.**

#### API Location
- **Read:** `GET /api/children/[id]/medical-profile`
- **Write:** `POST /api/children/[id]/medical-profile`
- The API accepts `physician_name`, `physician_phone`, `hospital_preference`, `special_instructions` — but no UI calls these endpoints for physician-specific data.

#### RLS / Access Control
- Parent-scoped via child ownership verification in the API route.

#### Licensing Risk: HIGH
- **Schema exists but UI does not.** This is a classic compliance gap — the data model supports it, but staff and parents have no way to enter or view it through the application.
- Georgia regulations require physician name and phone on file for each child. The system currently allows it but does not surface it, enforce it, or make it auditable.

#### Required Fix
- **UI:** Add a "Medical & Physician" tab to the `/dashboard/children` page. Include fields for:
  - Physician name (required)
  - Physician phone (required)
  - Hospital preference (optional)
  - Special instructions (optional)
- **Enforcement:** Require `physician_name` and `physician_phone` to be non-empty before onboarding can reach `complete` status.
- **Schema:** Consider making `physician_name` and `physician_phone` non-nullable with defaults, or add an onboarding check.

---

### 4. Emergency Contact

**Status: Supported**

#### Schema Location
- **Model:** `ChildEmergencyContact` (`prisma/schema.prisma:321–345`)
- **Table:** `child_emergency_contacts`
- **Fields:** `first_name`, `last_name` (required), `relationship` (required), `phone` (required), `phone_alt` (nullable), `email` (nullable), `is_primary` (Boolean), `priority` (Int 1-2), `authorized_for_pickup` (Boolean)
- **Constraint:** DB trigger `enforce_max_two_emergency_contacts` limits to 2 per child
- **Unique constraints:** `(child_id, priority)` and `(child_id, phone)` prevent duplicates

#### UI Location
- **Page:** `/dashboard/children` → "Emergency Contacts" tab
- **Component:** `EmergencyContactsEditor` (`src/components/children/EmergencyContactsEditor.tsx`)
- Full CRUD: add, edit, delete contacts with inline form
- Fields: First Name, Last Name, Relationship (dropdown), Phone (formatted), Alt Phone, Priority (1-2), Authorized for Pickup + PIN

#### API Location
- **List:** `GET /api/children/[id]/emergency-contacts`
- **Create:** `POST /api/children/[id]/emergency-contacts`
- **Update:** `PATCH /api/emergency-contacts/[id]`
- **Delete:** `DELETE /api/emergency-contacts/[id]`

#### RLS / Access Control
- Parent-scoped via child ownership check in API. Admin access via safety dashboard.

#### Licensing Risk: LOW
- Onboarding requires at least one emergency contact before reaching `complete` status (verified in `PATCH /api/onboarding-status`).
- Relationships are captured. Phone is required. Priority system works.
- **Minor concern:** Maximum of 2 contacts. Some licensing bodies prefer 3+. Georgia DECAL typically requires at least 2, which is supported.

#### Required Fix
- None required for basic compliance. Consider allowing 3+ contacts for stricter jurisdictions.

---

### 5. Authorized Pickup Persons

**Status: Supported**

#### Schema Location
- **Model:** `ChildAuthorizedPickup` (`prisma/schema.prisma:348–376`)
- **Table:** `child_authorized_pickups`
- **Fields:** `first_name`, `last_name`, `relationship`, `phone` (all required), `email` (nullable), `dob` (nullable), `pickup_pin_hash` (hashed PIN), `photo_id_url` (nullable), `is_emergency_contact` (Boolean), `is_active` (Boolean), `id_verified` / `id_verified_at` / `id_verified_by`, `notes`

#### UI Location
- **Page:** `/dashboard/children` → "Authorized Pickups" tab
- **Component:** `AuthorizedPickupsEditor` (`src/components/children/AuthorizedPickupsEditor.tsx`)
- Full CRUD with PIN management, ID verification badge display
- **Also:** `AuthorizedPickupsPanel` (`src/components/ui/AuthorizedPickupsPanel.tsx`) — read-only display in booking flow

#### API Location
- **List:** `GET /api/children/[id]/authorized-pickups`
- **Create:** `POST /api/children/[id]/authorized-pickups`
- **Update:** `PATCH /api/authorized-pickups/[id]`
- **Delete:** `DELETE /api/authorized-pickups/[id]`
- **Verification:** `POST /api/admin/pickup-verification` (PIN check with rate limiting)
- **Attendance pickup:** `POST /api/attendance/[id]/pickup-verification`

#### RLS / Access Control
- Parent-scoped for CRUD. Admin-scoped for PIN verification. Rate-limited (3 attempts / 15 min lockout).

#### Licensing Risk: LOW
- Well-implemented with PIN verification, ID verification tracking, and audit trail via `pickup_events` and `pickup_verifications` tables.
- Emergency contacts can be auto-promoted to authorized pickups.

#### Required Fix
- None required. This is one of the strongest areas of the system.

---

### 6. Immunization Record

**Status: Missing**

#### Schema Location
- **No model, table, or field exists for immunization records.** There is no `Immunization`, `VaccineRecord`, `ImmunizationDocument`, or similar model in the Prisma schema.
- The `medical_notes` field on `Child` (free-text, 500 chars max) could theoretically hold immunization notes, but this is not a structured or auditable record.

#### UI Location
- **No UI exists.** No upload flow, no structured form, no immunization checklist.

#### API Location
- **No API exists.** No route handles immunization data.

#### RLS / Access Control
- N/A

#### Licensing Risk: CRITICAL
- **Georgia DECAL requires a current Certificate of Immunization (Form 3231) on file for every enrolled child.** This is one of the most commonly cited deficiencies during inspections.
- The system has no mechanism to store, verify, or track immunization records.
- Without document upload capability, there is no way to store a scanned immunization form.

#### Required Fix
- **Schema (Option A — Structured):** Create an `ImmunizationRecord` model:
  ```prisma
  model ImmunizationRecord {
    id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    child_id          String   @db.Uuid
    vaccine_name      String
    dose_number       Int?
    date_administered DateTime? @db.Date
    provider_name     String?
    notes             String?
    created_at        DateTime @default(now()) @db.Timestamptz(6)
    updated_at        DateTime @default(now()) @updatedAt @db.Timestamptz(6)

    child Child @relation(fields: [child_id], references: [id], onDelete: Cascade)

    @@map("immunization_records")
  }
  ```
- **Schema (Option B — Document Upload, Recommended):** Create a `ChildDocument` model for uploading scanned immunization certificates (see Section 9 below for unified document model). Georgia licensing accepts a scanned Form 3231.
- **API:** Add `GET/POST /api/children/[id]/immunizations` or `GET/POST /api/children/[id]/documents`
- **UI:** Add an "Immunizations" or "Documents" tab to `/dashboard/children` with:
  - File upload for immunization certificate (PDF/image)
  - Optional structured vaccine entry form
  - Expiration/review date tracking
  - Status indicator (current / expired / missing)
- **Enforcement:** Block booking or check-in if no immunization record is on file. Add to onboarding requirements.
- **RLS:** Parent can upload/view their own child's records. Admin/staff can view all.
- **Audit:** Log upload/update events to `child_events` ledger.

---

### 7. Allergy / Medical Information

**Status: Supported**

#### Schema Location
- **Models:** `ChildAllergy` (`prisma/schema.prisma:247–263`), `ChildAllergyActionPlan` (`prisma/schema.prisma:266–286`), `ChildMedicalProfile` (`prisma/schema.prisma:291–317`)
- **Tables:** `child_allergies`, `child_allergy_action_plans`, `child_medical_profiles`
- **Allergy fields:** `allergen` (15-value enum), `custom_label`, `severity` (4-level enum)
- **Action plan fields:** `treatment_first_line` (6-value enum), `dose_instructions`, `symptoms_watch` (JSONB array), `med_location`, `requires_med_on_site`, `medication_expires_on`, `physician_name`, `parent_confirmed`, `parent_confirmed_at`
- **Medical profile fields:** `has_allergies`, `has_medications`, `has_medical_conditions`, `allergies_summary`, `medications_summary`, `medical_conditions_summary`, `special_instructions`

#### UI Location
- **Page:** `/dashboard/children` → "Allergies & Plans" tab
- **Component:** `ChildAllergiesEditor` (`src/components/children/ChildAllergiesEditor.tsx`)
- Full allergy management: add/remove allergies, set severity, configure action plans with treatment type, dosing, medication location, expiry, physician, symptoms to watch
- Parent confirmation required before saving
- Safety dashboard (`/admin/safety`) displays allergy badges with severity color-coding
- `ChildSnapshotCard` shows allergy badges on dashboard
- `TodoAlertsFeed` warns about missing action plans on severe allergies

#### API Location
- **Allergies:** `POST /api/children/[id]/allergies` (full upsert with transaction)
- **Medical Profile:** `GET/POST /api/children/[id]/medical-profile`
- **Composite:** `GET /api/children/[id]/details` includes allergies + action plans

#### RLS / Access Control
- Parent-scoped for write. Admin read via safety dashboard.

#### Licensing Risk: LOW
- This is exceptionally well-implemented with structured enums, action plans, medication tracking, and parent confirmation.
- Medical profile captures conditions and medications summaries.
- Onboarding requires medical acknowledgement (`medical_ack_complete` step).

#### Required Fix
- None for allergy/medical info. The physician fields on the medical profile need UI exposure (covered in Record #3 above).

---

### 8. Medication Authorization

**Status: Missing**

#### Schema Location
- **No dedicated medication authorization model exists.**
- Related but insufficient fields:
  - `ChildAllergyActionPlan.requires_med_on_site` (Boolean) — tracks whether medication must be present
  - `ChildAllergyActionPlan.dose_instructions` (String) — free-text dosing
  - `ChildAllergyActionPlan.medication_expires_on` (Date) — expiry tracking
  - `ChildAllergyActionPlan.med_location` (String) — where the medication is stored
  - `ChildMedicalProfile.medications_summary` (String) — free-text summary
- These fields support **allergy-related emergency medications** but do NOT cover:
  - Routine medications (daily prescriptions, inhalers for non-allergy asthma, etc.)
  - Parent-signed medication administration authorization forms
  - Medication administration logs (when was it given, by whom, what dose)
  - Medication inventory (what medications are on-site, quantities, expiry)

#### UI Location
- Allergy action plans include medication fields, but there is no standalone medication authorization workflow.
- No medication administration log UI.
- No consent/signature capture for medication authorization.

#### API Location
- No dedicated medication authorization routes.

#### RLS / Access Control
- N/A

#### Licensing Risk: CRITICAL
- **Georgia DECAL requires written parental authorization before any medication can be administered to a child in care.** This includes:
  - A signed medication authorization form (name of medication, dosage, time, route, duration)
  - Medication administration records (log of each administration event)
- The current system only partially addresses emergency allergy medications via action plans. Routine medications are not supported at all.
- An inspector would find no mechanism for parents to authorize daily medications or for staff to log administration events.

#### Required Fix
- **Schema:** Create medication authorization and administration models:
  ```prisma
  model MedicationAuthorization {
    id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    child_id           String    @db.Uuid
    center_id          String?   @db.Uuid
    medication_name    String
    dosage             String
    route              String    // oral, topical, inhaled, injection, other
    frequency          String    // e.g., "every 4 hours", "twice daily", "as needed"
    start_date         DateTime  @db.Date
    end_date           DateTime? @db.Date
    special_instructions String?
    prescribing_physician String?
    parent_authorized    Boolean  @default(false)
    parent_authorized_at DateTime? @db.Timestamptz(6)
    document_url         String?  // signed authorization form upload
    is_active            Boolean  @default(true)

    created_at DateTime @default(now()) @db.Timestamptz(6)
    updated_at DateTime @default(now()) @updatedAt @db.Timestamptz(6)

    child   Child @relation(fields: [child_id], references: [id], onDelete: Cascade)
    administration_logs MedicationAdministrationLog[]

    @@map("medication_authorizations")
  }

  model MedicationAdministrationLog {
    id                        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    medication_authorization_id String  @db.Uuid
    child_id                  String   @db.Uuid
    administered_at           DateTime @db.Timestamptz(6)
    administered_by           String   @db.Uuid
    dose_given                String
    notes                     String?
    parent_notified           Boolean  @default(false)

    created_at DateTime @default(now()) @db.Timestamptz(6)

    authorization MedicationAuthorization @relation(fields: [medication_authorization_id], references: [id], onDelete: Cascade)

    @@index([child_id, administered_at])
    @@map("medication_administration_logs")
  }
  ```
- **API:** Add CRUD routes for `/api/children/[id]/medications` and `/api/children/[id]/medications/[mid]/administer`
- **UI:** Add "Medications" tab to child profile with:
  - List of active medication authorizations
  - Authorization form (medication name, dosage, frequency, physician, parent confirmation)
  - Document upload for signed authorization forms
  - Administration log view (for admin/staff)
- **Enforcement:** Require active parent authorization before staff can log medication administration.
- **Audit:** Log all medication events to `child_events` ledger. This is a high-liability area.

---

### 9. Incident / Illness Reports

**Status: Supported**

#### Schema Location
- **Model:** `IncidentReport` (`prisma/schema.prisma:458–486`)
- **Table:** `incident_reports`
- **Fields:** `child_id` (required FK), `attendance_session_id` (nullable FK), `center_id` (nullable), `severity` (low/medium/high/critical), `category` (injury/illness/behavioral/medication_error/safety/other), `summary` (required), `details` (nullable), `reported_by` (UUID), `parent_notified_at` (timestamp), `resolved_at` / `closed_at` (timestamps), `status` (open/investigating/resolved/closed)
- **Audit:** `ChildEvent` model provides append-only event ledger linked to child incidents

#### UI Location
- **Admin:** `/admin/incidents` page (`src/app/admin/incidents/page.tsx`) — incident monitoring with severity filters
- **Admin:** Safety dashboard (`/admin/safety`) includes incident visibility
- **API-only for creation:** Incidents are created via API, typically by admin/staff during attendance sessions

#### API Location
- **List (child-scoped):** `GET /api/children/[id]/incidents`
- **Create:** `POST /api/children/[id]/incidents`
- **Admin aggregate:** `GET /api/admin/incidents`
- Creation automatically appends to `child_events` ledger for immutable audit trail

#### RLS / Access Control
- Child ownership check on create. Admin can view all incidents.
- Parent notification timestamp tracked (`parent_notified_at`).

#### Licensing Risk: LOW
- Well-structured with severity levels, categories, status tracking, parent notification, and immutable audit trail.
- Historically preserved — incidents are never deleted, only closed.
- Linked to attendance sessions for temporal context.

#### Required Fix
- **Minor:** Consider adding a parent-facing incident view so parents can review incident history for their child (currently admin-only creation and viewing). Some licensing frameworks require parent acknowledgement/signature on incident reports.
- **Minor:** Add `witness_name` and `action_taken` fields if not already captured in `details` free-text.

---

## Relationship Audit

| Question | Answer | Status |
|----------|--------|--------|
| Does each child have at least one linked parent/guardian? | Yes — `children.parent_id` is a required FK to `parents`. `ON DELETE CASCADE`. | **Pass** |
| Can one child have multiple emergency contacts? | Yes — up to 2, enforced by DB trigger `enforce_max_two_emergency_contacts`. Unique on `(child_id, priority)`. | **Pass** |
| Can one child have multiple authorized pickups? | Yes — no hard limit in schema (API limits to 5). | **Pass** |
| Are physician records child-specific? | Yes — `child_medical_profiles` is 1:1 with child via `child_id UNIQUE`. Per-allergy physician also available on action plans. | **Pass** |
| Are incident/illness reports child-specific and historically preserved? | Yes — `incident_reports.child_id` FK, plus immutable `child_events` ledger. Incidents are never deleted. | **Pass** |
| Is medication authorization versioned or timestamped? | **No — medication authorization does not exist as a model.** Allergy action plans have `parent_confirmed_at` but this only covers allergy meds. | **Fail** |
| Can immunization records be stored as structured data, document upload, or both? | **No — no immunization model or document upload exists.** | **Fail** |

---

## Enforcement Audit

| Record | Required During Onboarding | Required Before Booking/Check-in | Validation Present | Risk |
|--------|---------------------------|----------------------------------|-------------------|------|
| Child name + DOB | Yes (Zod validation on create) | N/A | Yes — `childBasicsSchema` | Low |
| Parent contact (phone) | **No** — phone is nullable, no onboarding gate | **No** | **No** | **High** |
| Physician info | **No** — optional fields, no onboarding gate | **No** | No — nullable in schema and validation | **High** |
| Emergency contact | Yes — onboarding requires ≥1 before `complete` | Implicitly (onboarding blocks booking) | Yes — schema + API + onboarding check | Low |
| Authorized pickups | **No** — not an onboarding requirement | **No** | Partial — validated on create but not required | Medium |
| Immunization record | **N/A — does not exist** | **N/A** | **N/A** | **Critical** |
| Allergy / medical info | Yes — `medical_ack_complete` onboarding step | Implicitly | Yes — `medicalAckSchema` | Low |
| Medication authorization | **N/A — does not exist** | **N/A** | **N/A** | **Critical** |
| Incident reports | N/A (created operationally) | N/A | Yes — schema + API validation | Low |

---

## UI / Workflow Audit

| Workflow | Status | Location | Notes |
|----------|--------|----------|-------|
| Creating a child profile | **Implemented** | `/dashboard/children` + `ChildFormBasics` | Full CRUD with validation |
| Adding/editing allergies and medical notes | **Implemented** | `/dashboard/children` → Allergies tab + `ChildAllergiesEditor` | Excellent — structured enums, action plans, parent confirmation |
| Adding emergency contacts | **Implemented** | `/dashboard/children` → Emergency Contacts tab + `EmergencyContactsEditor` | Full CRUD, priority system, pickup authorization |
| Adding authorized pickups | **Implemented** | `/dashboard/children` → Authorized Pickups tab + `AuthorizedPickupsEditor` | Full CRUD with PIN management and ID verification |
| Uploading immunization records | **Not implemented** | N/A | No upload capability, no structured form, no document storage |
| Recording physician info | **Schema exists, no UI** | API: `/api/children/[id]/medical-profile` | Fields exist in `child_medical_profiles` but no tab/form surfaces them |
| Uploading/signing medication authorization | **Not implemented** | N/A | No model, no API, no UI |
| Logging incident/illness events | **Implemented** | `/admin/incidents` + API routes | Admin-only creation, severity tracking, parent notification |
| Editing parent profile (phone, address) | **Not implemented** | N/A | No parent profile edit page; phone/address are nullable with no UI |
| Viewing medical profile (physician, hospital, special instructions) | **Schema exists, no UI** | API exists | Data can be written via API but parents cannot see or edit it in the app |

---

## Answers to Specific Questions

### 1. Does the system currently support all required child file records?

**No.** Two record categories are entirely missing (immunization records, medication authorization), and three are only partially supported (parent contact, physician contact, medication-related workflows).

### 2. Which records are missing entirely?

1. **Immunization records** — No model, table, API, or UI. Critical licensing requirement.
2. **Medication authorization** — No dedicated model for routine medication consent, administration logging, or signed authorization forms. Only allergy-specific emergency medication is partially covered via action plans.

### 3. Which records are only partially supported?

1. **Parent contact information** — Email is captured at signup; phone and address are nullable with no UI to set them and no onboarding enforcement.
2. **Physician contact information** — Schema fields exist on `child_medical_profiles` (physician_name, physician_phone, hospital_preference) but there is no UI tab, no enforcement, and the fields are all optional.
3. **Medication authorization (allergy-specific)** — Allergy action plans cover emergency meds (EpiPen, inhaler) with parent confirmation, but routine/daily medications have no support whatsoever.

### 4. Which records exist in schema but lack UI/workflow support?

1. **Physician info** — `child_medical_profiles.physician_name`, `physician_phone`, `hospital_preference`, `special_instructions` all exist with a working API (`GET/POST /api/children/[id]/medical-profile`) but no UI component exposes these fields to parents.
2. **Medical profile summaries** — `medications_summary`, `medical_conditions_summary` exist in schema and API but have limited UI exposure (only through the medical acknowledgement flow, not as an editable profile section).

### 5. Which records need required-field enforcement before licensing review?

1. **Parent phone number** — Must be non-nullable or enforced during onboarding before `parent_profile_complete`.
2. **Child date of birth** — Should be `NOT NULL` at database level (currently nullable in schema, required only by Zod).
3. **Physician name and phone** — Must be required during onboarding or before first booking/check-in.
4. **At least one authorized pickup** — Should be enforced during onboarding (currently not checked).
5. **Immunization record on file** — Must be required before booking/check-in once the feature is built.
6. **Medication authorization** — Must be required before staff can administer any medication once the feature is built.

### 6. What is the minimum schema change set needed to become inspection-ready?

#### Priority 1: Critical (Blocking for Licensing)

1. **Add `ChildDocument` model** — Unified document storage for immunization certificates, medication authorization forms, and other required documents:
   ```prisma
   model ChildDocument {
     id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
     child_id      String   @db.Uuid
     center_id     String?  @db.Uuid
     document_type String   // immunization_certificate, medication_authorization,
                            // photo_id, consent_form, other
     file_name     String
     file_url      String   // Supabase Storage URL
     file_size     Int?
     mime_type     String?
     uploaded_by   String   @db.Uuid
     expires_at    DateTime? @db.Timestamptz(6)
     verified      Boolean  @default(false)
     verified_by   String?  @db.Uuid
     verified_at   DateTime? @db.Timestamptz(6)
     notes         String?
     is_active     Boolean  @default(true)

     created_at DateTime @default(now()) @db.Timestamptz(6)
     updated_at DateTime @default(now()) @updatedAt @db.Timestamptz(6)

     child Child @relation(fields: [child_id], references: [id], onDelete: Cascade)

     @@index([child_id, document_type])
     @@map("child_documents")
   }
   ```

2. **Add `MedicationAuthorization` model** — As specified in Record #8 above.

3. **Add `MedicationAdministrationLog` model** — As specified in Record #8 above.

4. **Add Supabase Storage bucket** — `child-documents` bucket with RLS policies scoped to parent ownership and staff access.

#### Priority 2: High (Required for Enforcement)

5. **Make `children.date_of_birth` non-nullable** — `ALTER TABLE children ALTER COLUMN date_of_birth SET NOT NULL;`

6. **Make `parents.phone` effectively required** — Either `NOT NULL` constraint or onboarding enforcement gate.

7. **Add physician enforcement** — Onboarding status check should verify `physician_name` and `physician_phone` are set on each child's medical profile before allowing `complete`.

8. **Add authorized pickup onboarding check** — Require at least one authorized pickup before onboarding `complete`.

#### Priority 3: Medium (Recommended for Inspection Confidence)

9. **Add immunization status tracking to child** — Boolean flag or enum (`current`, `expired`, `exempt`, `missing`) on `Child` or `ChildMedicalProfile` for quick compliance dashboards.

10. **Add parent-facing incident view** — Allow parents to see incident history for their children.

11. **Add `witness_name` and `action_taken` fields to `IncidentReport`** — Explicit fields rather than relying on `details` free-text.

#### SQL Migration Plan

```sql
-- Migration: Add child documents, medication authorization, and enforcement constraints

-- 1. Child documents
CREATE TABLE child_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  center_id UUID REFERENCES centers(id),
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INT,
  mime_type TEXT,
  uploaded_by UUID NOT NULL,
  expires_at TIMESTAMPTZ,
  verified BOOLEAN DEFAULT false,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_child_documents_child_type ON child_documents(child_id, document_type);

-- 2. Medication authorizations
CREATE TABLE medication_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  center_id UUID REFERENCES centers(id),
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  route TEXT NOT NULL,
  frequency TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  special_instructions TEXT,
  prescribing_physician TEXT,
  parent_authorized BOOLEAN DEFAULT false,
  parent_authorized_at TIMESTAMPTZ,
  document_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_med_auth_child ON medication_authorizations(child_id);

-- 3. Medication administration logs
CREATE TABLE medication_administration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_authorization_id UUID NOT NULL REFERENCES medication_authorizations(id) ON DELETE CASCADE,
  child_id UUID NOT NULL,
  administered_at TIMESTAMPTZ NOT NULL,
  administered_by UUID NOT NULL,
  dose_given TEXT NOT NULL,
  notes TEXT,
  parent_notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_med_admin_child_time ON medication_administration_logs(child_id, administered_at);

-- 4. Enforce date_of_birth NOT NULL
ALTER TABLE children ALTER COLUMN date_of_birth SET NOT NULL;

-- 5. RLS policies for new tables
ALTER TABLE child_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_administration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage their children's documents"
  ON child_documents FOR ALL
  USING (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()));

CREATE POLICY "Parents can manage their children's medication authorizations"
  ON medication_authorizations FOR ALL
  USING (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()));

CREATE POLICY "Staff can view medication administration logs"
  ON medication_administration_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM center_staff_memberships
    WHERE user_id = auth.uid() AND active = true
  ));

-- 6. updated_at triggers for new tables
CREATE TRIGGER set_updated_at_child_documents
  BEFORE UPDATE ON child_documents
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER set_updated_at_medication_authorizations
  BEFORE UPDATE ON medication_authorizations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

#### UI Components to Add

1. **`MedicalProfileEditor`** — New component for `/dashboard/children` → "Medical & Physician" tab
   - Physician name (required text)
   - Physician phone (required, phone validation)
   - Hospital preference (optional text)
   - Special instructions (optional textarea)
   - Medications summary (required if `has_medications`)
   - Medical conditions summary (required if `has_medical_conditions`)

2. **`DocumentUploader`** — Generic document upload component
   - File picker (PDF, JPG, PNG)
   - Document type selector
   - Expiration date (optional)
   - Upload to Supabase Storage
   - Verification status display

3. **`ImmunizationPanel`** — New tab or section in child profile
   - Upload immunization certificate
   - Status indicator (current / expired / missing)
   - Expiry tracking

4. **`MedicationAuthorizationEditor`** — New tab in child profile
   - List active authorizations
   - Add/edit authorization form
   - Document upload for signed forms
   - Parent confirmation checkbox

5. **`ParentProfileEditor`** — New page at `/dashboard/profile`
   - Name, phone (required), address, email (read-only)

#### Validation Rules to Add

```typescript
// Parent profile
export const parentProfileSchema = z.object({
  first_name: z.string().trim().min(1).max(50),
  last_name: z.string().trim().min(1).max(50),
  phone: phoneSchema, // required, 10-11 digits
  address: z.string().max(200).optional().nullable(),
});

// Medication authorization
export const medicationAuthorizationSchema = z.object({
  medication_name: z.string().trim().min(1).max(100),
  dosage: z.string().trim().min(1).max(100),
  route: z.enum(['oral', 'topical', 'inhaled', 'injection', 'other']),
  frequency: z.string().trim().min(1).max(100),
  start_date: z.string().refine(val => !isNaN(new Date(val).getTime())),
  end_date: z.string().optional().nullable(),
  special_instructions: z.string().max(500).optional().nullable(),
  prescribing_physician: z.string().max(100).optional().nullable(),
  parent_authorized: z.boolean().refine(val => val === true, {
    message: 'Parent authorization is required',
  }),
});

// Document upload
export const childDocumentSchema = z.object({
  document_type: z.enum([
    'immunization_certificate',
    'medication_authorization',
    'photo_id',
    'consent_form',
    'other',
  ]),
  file_name: z.string().min(1),
  expires_at: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
```

#### Audit Logging Recommendations

1. All document uploads/deletions should be logged to `child_events` with `event_type: 'document_uploaded' | 'document_deleted'`.
2. All medication authorization changes should be logged to `child_events` with `event_type: 'medication_authorized' | 'medication_deauthorized'`.
3. All medication administration events should be logged to `child_events` with `event_type: 'medication_administered'`.
4. Immunization status changes should be logged to `child_events`.
5. Parent profile changes (especially phone number changes) should be logged to `audit_log`.

#### Document Upload Requirement

**Yes, document upload is required.** Georgia DECAL requires physical or electronic copies of:
- Certificate of Immunization (Form 3231)
- Signed medication authorization forms
- Potentially: enrollment agreement, custody documentation

Supabase Storage should be configured with a `child-documents` bucket. Files should be scoped by `child_id` in the storage path (e.g., `children/{child_id}/immunization-cert.pdf`).

---

## Summary Matrix

| # | Record | Status | Schema | API | UI | Enforcement | Licensing Risk |
|---|--------|--------|--------|-----|----|----|-----|
| 1 | Child name + DOB | Supported | `children` table | CRUD routes | ChildFormBasics | Zod validation (DB allows null DOB) | Low |
| 2 | Parent contact | Partially Supported | `parents` table (phone nullable) | No profile edit route | No profile UI | Not enforced | **High** |
| 3 | Physician contact | Partially Supported | `child_medical_profiles` | GET/POST medical-profile | **No UI** | Not enforced | **High** |
| 4 | Emergency contact | Supported | `child_emergency_contacts` | Full CRUD | EmergencyContactsEditor | Onboarding gate | Low |
| 5 | Authorized pickups | Supported | `child_authorized_pickups` | Full CRUD + PIN verify | AuthorizedPickupsEditor | Not enforced in onboarding | Low |
| 6 | Immunization record | **Missing** | No model | No routes | No UI | N/A | **Critical** |
| 7 | Allergy / medical | Supported | `child_allergies` + `action_plans` + `medical_profiles` | Full CRUD | ChildAllergiesEditor | Onboarding gate | Low |
| 8 | Medication authorization | **Missing** | No model | No routes | No UI | N/A | **Critical** |
| 9 | Incident / illness reports | Supported | `incident_reports` + `child_events` | CRUD + admin aggregate | Admin incidents page | Operational (not onboarding) | Low |
