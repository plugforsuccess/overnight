# Prisma Schema Inventory

## Center -> `centers`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| name | String | NO |  |  |
| slug | String | NO |  |  |
| timezone | String | NO | "America/New_York" |  |
| address_line_1 | String | YES |  |  |
| city | String | YES |  |  |
| state | String | YES |  |  |
| postal_code | String | YES |  |  |
| is_active | Boolean | NO | true |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| programs | Program | NO |  |  |
| program_capacities | ProgramCapacity | NO |  |  |
| capacity_overrides | CapacityOverride | NO |  |  |

## Program -> `programs`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| center_id | String | NO |  |  |
| name | String | NO |  |  |
| care_type | String | NO | "overnight" |  |
| start_time | String | NO | "21:00" |  |
| end_time | String | NO | "07:00" |  |
| age_min_months | Int | YES |  |  |
| age_max_months | Int | YES |  |  |
| is_active | Boolean | NO | true |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| center | Center | NO |  |  |
| program_capacities | ProgramCapacity | NO |  |  |
| capacity_overrides | CapacityOverride | NO |  |  |

## ProgramCapacity -> `program_capacity`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| center_id | String | NO |  |  |
| program_id | String | NO |  |  |
| care_date | DateTime | NO |  |  |
| capacity_total | Int | NO |  |  |
| capacity_reserved | Int | NO | 0 |  |
| capacity_waitlisted | Int | NO | 0 |  |
| status | String | NO | "open" |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| center | Center | NO |  |  |
| program | Program | NO |  |  |
| reservation_nights | ReservationNight | NO |  |  |

Unique: (program_id, care_date)

Indexes: (care_date, status)

## CapacityOverride -> `capacity_overrides`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| center_id | String | NO |  |  |
| program_id | String | NO |  |  |
| care_date | DateTime | NO |  |  |
| override_type | String | NO |  |  |
| capacity_override | Int | YES |  |  |
| reason_code | String | NO |  |  |
| reason_text | String | YES |  |  |
| is_active | Boolean | NO | true |  |
| created_by_user_id | String | NO |  |  |
| updated_by_user_id | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| center | Center | NO |  |  |
| program | Program | NO |  |  |
| events | CapacityOverrideEvent | NO |  |  |

Indexes: (center_id, care_date), (program_id, care_date), (is_active, care_date), (created_by_user_id)

## CapacityOverrideEvent -> `capacity_override_events`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| capacity_override_id | String | NO |  |  |
| center_id | String | NO |  |  |
| program_id | String | NO |  |  |
| care_date | DateTime | NO |  |  |
| actor_user_id | String | NO |  |  |
| event_type | String | NO |  |  |
| event_at | DateTime | NO | now( |  |
| metadata | Json | NO | "{}" |  |
| capacity_override | CapacityOverride | NO |  |  |

Indexes: (capacity_override_id, event_at), (center_id, care_date), (event_type, event_at), (actor_user_id)

## Parent -> `parents`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO |  | PK |
| first_name | String | NO |  |  |
| last_name | String | NO |  |  |
| email | String | NO |  |  |
| phone | String | YES |  |  |
| address | String | YES |  |  |
| role | String | NO | "parent" |  |
| is_admin | Boolean | NO | false |  |
| stripe_customer_id | String | YES |  |  |
| name | String | YES |  |  |
| center_id | String | YES |  |  |
| onboarding_status | String | NO | "started" |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| children | Child | NO |  |  |
| overnight_blocks | OvernightBlock | NO |  |  |
| waitlist_entries | WaitlistEntry | NO |  |  |
| credits | Credit | NO |  |  |
| payments | Payment | NO |  |  |
| subscriptions | Subscription | NO |  |  |
| audit_logs | AuditLog | NO |  |  |
| pickup_verifications | PickupEvent | NO |  |  |
| settings | ParentSettings | YES |  |  |
| staff_memberships | CenterStaffMembership | NO |  |  |
| billing_ledger | BillingLedger | NO |  |  |

## Child -> `children`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| parent_id | String | NO |  |  |
| first_name | String | NO |  |  |
| last_name | String | NO |  |  |
| middle_name | String | YES |  |  |
| preferred_name | String | YES |  |  |
| date_of_birth | DateTime | YES |  |  |
| gender | String | YES |  |  |
| name | String | YES |  |  |
| allergies | String | YES |  |  |
| photo_url | String | YES |  |  |
| medical_notes | String | YES |  |  |
| notes | String | YES |  |  |
| active | Boolean | NO | true |  |
| archived_at | DateTime | YES |  |  |
| center_id | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| parent | Parent | NO |  |  |
| overnight_blocks | OvernightBlock | NO |  |  |
| reservations | Reservation | NO |  |  |
| waitlist_entries | WaitlistEntry | NO |  |  |
| child_allergies | ChildAllergy | NO |  |  |
| emergency_contacts | ChildEmergencyContact | NO |  |  |
| authorized_pickups | ChildAuthorizedPickup | NO |  |  |
| pickup_events | PickupEvent | NO |  |  |
| medical_profile | ChildMedicalProfile | YES |  |  |
| events | ChildEvent | NO |  |  |
| attendance_sessions | ChildAttendanceSession | NO |  |  |
| incident_reports | IncidentReport | NO |  |  |
| reservation_nights | ReservationNight | NO |  |  |
| billing_ledger | BillingLedger | NO |  |  |

Indexes: (parent_id)

## ChildAllergy -> `child_allergies`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| child_id | String | NO |  |  |
| allergen | String | NO |  |  |
| custom_label | String | YES |  |  |
| severity | String | NO | "UNKNOWN" |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| child | Child | NO |  |  |
| action_plan | ChildAllergyActionPlan | YES |  |  |

Unique: (child_id, allergen, custom_label)

## ChildAllergyActionPlan -> `child_allergy_action_plans`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| child_allergy_id | String | NO |  |  |
| treatment_first_line | String | NO | "NONE" |  |
| dose_instructions | String | YES |  |  |
| symptoms_watch | Json | YES |  |  |
| med_location | String | YES |  |  |
| requires_med_on_site | Boolean | NO | false |  |
| medication_expires_on | DateTime | YES |  |  |
| physician_name | String | YES |  |  |
| parent_confirmed | Boolean | NO | false |  |
| parent_confirmed_at | DateTime | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| child_allergy | ChildAllergy | NO |  |  |

## ChildMedicalProfile -> `child_medical_profiles`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| child_id | String | NO |  |  |
| center_id | String | YES |  |  |
| has_allergies | Boolean | NO | false |  |
| has_medications | Boolean | NO | false |  |
| has_medical_conditions | Boolean | NO | false |  |
| allergies_summary | String | YES |  |  |
| medications_summary | String | YES |  |  |
| medical_conditions_summary | String | YES |  |  |
| physician_name | String | YES |  |  |
| physician_phone | String | YES |  |  |
| hospital_preference | String | YES |  |  |
| special_instructions | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| child | Child | NO |  |  |

## ChildEmergencyContact -> `child_emergency_contacts`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| child_id | String | NO |  |  |
| center_id | String | YES |  |  |
| first_name | String | NO |  |  |
| last_name | String | NO |  |  |
| relationship | String | NO |  |  |
| phone | String | NO |  |  |
| phone_alt | String | YES |  |  |
| email | String | YES |  |  |
| is_primary | Boolean | NO | false |  |
| priority | Int | NO |  |  |
| authorized_for_pickup | Boolean | NO | false |  |
| archived_at | DateTime | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| child | Child | NO |  |  |

Unique: (child_id, priority), (child_id, phone)

## ChildAuthorizedPickup -> `child_authorized_pickups`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| child_id | String | NO |  |  |
| center_id | String | YES |  |  |
| first_name | String | NO |  |  |
| last_name | String | NO |  |  |
| relationship | String | NO |  |  |
| phone | String | NO |  |  |
| email | String | YES |  |  |
| dob | DateTime | YES |  |  |
| pickup_pin_hash | String | YES |  |  |
| photo_id_url | String | YES |  |  |
| is_emergency_contact | Boolean | NO | false |  |
| is_active | Boolean | NO | true |  |
| archived_at | DateTime | YES |  |  |
| id_verified | Boolean | NO | false |  |
| id_verified_at | DateTime | YES |  |  |
| id_verified_by | String | YES |  |  |
| notes | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| child | Child | NO |  |  |
| pickup_events | PickupEvent | NO |  |  |

## ChildEvent -> `child_events`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| child_id | String | NO |  |  |
| center_id | String | YES |  |  |
| event_type | String | NO |  |  |
| event_data | Json | NO | "{}" |  |
| created_by | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| child | Child | NO |  |  |

Indexes: (child_id, created_at), (event_type)

## ChildAttendanceSession -> `child_attendance_sessions`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| child_id | String | NO |  |  |
| center_id | String | YES |  |  |
| reservation_id | String | YES |  |  |
| check_in_at | DateTime | YES |  |  |
| check_out_at | DateTime | YES |  |  |
| checked_in_by | String | YES |  |  |
| checked_out_by | String | YES |  |  |
| pickup_person_name | String | YES |  |  |
| pickup_relationship | String | YES |  |  |
| pickup_verified | Boolean | NO | false |  |
| status | String | NO | "scheduled" |  |
| notes | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| child | Child | NO |  |  |
| reservation | Reservation | YES |  |  |
| incident_reports | IncidentReport | NO |  |  |
| pickup_verification | PickupVerification | YES |  |  |

Indexes: (child_id, created_at), (status)

## ReservationEvent -> `reservation_events`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| reservation_id | String | NO |  |  |
| event_type | String | NO |  |  |
| event_data | Json | NO | "{}" |  |
| created_by | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| reservation | Reservation | NO |  |  |

Indexes: (reservation_id, created_at), (event_type)

## IncidentReport -> `incident_reports`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| child_id | String | NO |  |  |
| attendance_session_id | String | YES |  |  |
| center_id | String | YES |  |  |
| severity | String | NO |  |  |
| category | String | NO |  |  |
| summary | String | NO |  |  |
| details | String | YES |  |  |
| reported_by | String | YES |  |  |
| parent_notified_at | DateTime | YES |  |  |
| resolved_at | DateTime | YES |  |  |
| closed_at | DateTime | YES |  |  |
| status | String | NO | "open" |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| child | Child | NO |  |  |
| attendance_session | ChildAttendanceSession | YES |  |  |

Indexes: (child_id, created_at), (status), (severity)

## CenterStaffMembership -> `center_staff_memberships`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| user_id | String | NO |  |  |
| center_id | String | NO |  |  |
| role | String | NO |  |  |
| active | Boolean | NO | true |  |
| archived_at | DateTime | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| user | Parent | NO |  |  |

Unique: (user_id, center_id)

Indexes: (center_id, active)

## PickupVerification -> `pickup_verifications`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| attendance_session_id | String | NO |  |  |
| authorized_pickup_id | String | YES |  |  |
| verified_name | String | NO |  |  |
| verified_relationship | String | NO |  |  |
| verification_method | String | NO |  |  |
| verified_by | String | YES |  |  |
| verified_at | DateTime | NO | now( |  |
| notes | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| attendance_session | ChildAttendanceSession | NO |  |  |

Indexes: (verified_at)

## Plan -> `plans`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| name | String | NO |  |  |
| nights_per_week | Int | NO |  |  |
| weekly_price_cents | Int | NO |  |  |
| active | Boolean | NO | true |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| overnight_blocks | OvernightBlock | NO |  |  |

Unique: (nights_per_week)

## OvernightBlock -> `overnight_blocks`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| week_start | DateTime | NO |  |  |
| parent_id | String | NO |  |  |
| child_id | String | NO |  |  |
| plan_id | String | YES |  |  |
| nights_per_week | Int | NO |  |  |
| weekly_price_cents | Int | NO |  |  |
| multi_child_discount_pct | Int | NO | 0 |  |
| status | String | NO | "active" |  |
| payment_status | String | NO | "pending" |  |
| stripe_subscription_id | String | YES |  |  |
| stripe_invoice_id | String | YES |  |  |
| caregiver_notes | String | YES |  |  |
| archived_at | DateTime | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| parent | Parent | NO |  |  |
| child | Child | NO |  |  |
| plan | Plan | YES |  |  |
| reservations | Reservation | NO |  |  |
| credits | Credit | NO |  |  |
| payments | Payment | NO |  |  |

Indexes: (week_start), (parent_id, week_start), (child_id, week_start)

## Reservation -> `reservations`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| child_id | String | NO |  |  |
| date | DateTime | NO |  |  |
| overnight_block_id | String | NO |  |  |
| status | String | NO | "pending_payment" |  |
| admin_override | Boolean | NO | false |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| child | Child | NO |  |  |
| overnight_block | OvernightBlock | NO |  |  |
| attendance_sessions | ChildAttendanceSession | NO |  |  |
| reservation_events | ReservationEvent | NO |  |  |
| reservation_nights | ReservationNight | NO |  |  |

Indexes: (date), (overnight_block_id)

## NightlyCapacity -> `nightly_capacity`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| date | DateTime | NO |  | PK |
| capacity | Int | NO | 6 |  |
| min_enrollment | Int | NO | 4 |  |
| confirmed_count | Int | NO | 0 |  |
| status | String | NO | "open" |  |
| override_capacity | Int | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |

## WaitlistEntry -> `waitlist`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| date | DateTime | NO |  |  |
| child_id | String | NO |  |  |
| parent_id | String | NO |  |  |
| status | String | NO | "waiting" |  |
| offered_at | DateTime | YES |  |  |
| expires_at | DateTime | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| child | Child | NO |  |  |
| parent | Parent | NO |  |  |

Indexes: (date, status, created_at), (parent_id)

## Payment -> `payments`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| parent_id | String | NO |  |  |
| plan_id | String | YES |  |  |
| amount_cents | Int | NO |  |  |
| status | String | NO | "pending" |  |
| description | String | YES |  |  |
| stripe_payment_intent_id | String | YES |  |  |
| stripe_invoice_id | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| parent | Parent | NO |  |  |
| overnight_block | OvernightBlock | YES |  |  |

Indexes: (parent_id), (status)

## BillingLedger -> `billing_ledger`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| parent_id | String | NO |  |  |
| reservation_night_id | String | YES |  |  |
| child_id | String | YES |  |  |
| amount_cents | Int | NO | 0 |  |
| status | String | NO | "pending" |  |
| payment_provider | String | YES | "stripe" |  |
| stripe_payment_intent_id | String | YES |  |  |
| description | String | YES |  |  |
| care_date | DateTime | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| parent | Parent | NO |  |  |
| reservation_night | ReservationNight | YES |  |  |
| child | Child | YES |  |  |

Indexes: (parent_id), (status), (care_date), (reservation_night_id)

## AdminSettings -> `admin_settings`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| max_capacity | Int | NO | 6 |  |
| min_enrollment | Int | NO | 4 |  |
| pricing_tiers | Json | NO | "[{\"nights\":3,\"price_cents\":30000},{\"nights\":4,\"price_cents\":36000},{\"nights\":5,\"price_cents\":42500}]" |  |
| operating_nights | Json | NO | "[\"sunday\",\"monday\",\"tuesday\",\"wednesday\",\"thursday\"]" |  |
| billing_day | String | NO | "friday" |  |
| billing_time | String | NO | "12:00" |  |
| waitlist_confirm_hours | Int | NO | 24 |  |
| overnight_start_time | String | NO | "21:00" |  |
| overnight_end_time | String | NO | "07:00" |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |

## Credit -> `credits`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| parent_id | String | NO |  |  |
| amount_cents | Int | NO |  |  |
| reason | String | NO |  |  |
| related_block_id | String | YES |  |  |
| related_date | DateTime | YES |  |  |
| source_weekly_price_cents | Int | YES |  |  |
| source_plan_nights | Int | YES |  |  |
| applied | Boolean | NO | false |  |
| applied_at | DateTime | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| parent | Parent | NO |  |  |
| related_block | OvernightBlock | YES |  |  |

Indexes: (parent_id, applied), (related_date)

## AuditLog -> `audit_log`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| actor_id | String | YES |  |  |
| action | String | NO |  |  |
| entity_type | String | NO |  |  |
| entity_id | String | YES |  |  |
| metadata | Json | NO | "{}" |  |
| created_at | DateTime | NO | now( |  |
| actor | Parent | YES |  |  |

Indexes: (entity_type, entity_id), (created_at)

## PickupEvent -> `pickup_events`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("uuid_generate_v4( | PK |
| child_id | String | NO |  |  |
| pickup_person_id | String | YES |  |  |
| verified_by_staff_id | String | YES |  |  |
| verification_method | String | NO |  |  |
| notes | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| child | Child | NO |  |  |
| pickup_person | ChildAuthorizedPickup | YES |  |  |
| verified_by | Parent | YES |  |  |

Indexes: (child_id, created_at)

## ParentSettings -> `parent_settings`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("uuid_generate_v4( | PK |
| parent_id | String | NO |  |  |
| email_notifications | Boolean | NO | true |  |
| sms_notifications | Boolean | NO | false |  |
| reservation_reminders | Boolean | NO | true |  |
| billing_reminders | Boolean | NO | true |  |
| emergency_alerts | Boolean | NO | true |  |
| require_pickup_pin | Boolean | NO | true |  |
| notify_on_check_in_out | Boolean | NO | true |  |
| notify_on_pickup_changes | Boolean | NO | true |  |
| emergency_contact_reminder | Boolean | NO | true |  |
| preferred_contact_method | String | YES |  |  |
| preferred_reminder_timing | String | YES |  |  |
| staff_notes | String | YES |  |  |
| language_preference | String | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| parent | Parent | NO |  |  |

## Config -> `config`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| key | String | NO |  | PK |
| value | String | NO |  |  |

## StripePrice -> `stripe_prices`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| tier | String | NO |  |  |
| price_id | String | NO |  |  |
| mode | String | NO |  |  |
| updated_at | DateTime | NO | now( |  |

Unique: (tier, mode)

## Subscription -> `subscriptions`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| parent_id | String | NO |  |  |
| stripe_subscription_id | String | NO |  |  |
| plan_tier | String | NO |  |  |
| status | String | NO | "active" |  |
| stripe_status | String | YES |  |  |
| next_billing_date | DateTime | YES |  |  |
| current_period_end | DateTime | YES |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| parent | Parent | NO |  |  |
| pending_plan_change | PendingPlanChange | YES |  |  |
| billing_events | BillingEvent | NO |  |  |

## PendingPlanChange -> `pending_plan_changes`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| subscription_id | String | NO |  |  |
| new_plan_tier | String | NO |  |  |
| effective_date | DateTime | NO |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| subscription | Subscription | NO |  |  |

## BillingEvent -> `billing_events`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| stripe_event_id | String | NO |  |  |
| event_type | String | NO |  |  |
| subscription_id | String | YES |  |  |
| payload | Json | NO |  |  |
| livemode | Boolean | NO | false |  |
| stripe_created_at | DateTime | YES |  |  |
| status | String | NO | "received" |  |
| error | String | YES |  |  |
| processed_at | DateTime | YES |  |  |
| created_at | DateTime | NO | now( |  |
| subscription | Subscription | YES |  |  |

## ReservationNight -> `reservation_nights`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| reservation_id | String | NO |  |  |
| child_id | String | NO |  |  |
| program_capacity_id | String | YES |  |  |
| care_date | DateTime | NO |  |  |
| status | String | NO | "pending" |  |
| capacity_snapshot | Int | NO |  |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| reservation | Reservation | NO |  |  |
| child | Child | NO |  |  |
| program_capacity | ProgramCapacity | YES |  |  |
| attendance_record | AttendanceRecord | YES |  |  |
| billing_ledger | BillingLedger | NO |  |  |

Unique: (reservation_id, care_date), (child_id, care_date)

Indexes: (reservation_id), (care_date)

## IdempotencyKey -> `idempotency_keys`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| key | String | NO |  | PK |
| user_id | String | YES |  |  |
| request_path | String | NO |  |  |
| response_status | Int | NO |  |  |
| response_body | Json | NO | "{}" |  |
| created_at | DateTime | NO | now( |  |
| expires_at | DateTime | NO | dbgenerated("(now( |  |

Indexes: (expires_at), (user_id)

## AttendanceRecord -> `attendance_records`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| reservation_night_id | String | NO |  |  |
| center_id | String | YES |  |  |
| child_id | String | NO |  |  |
| parent_id | String | NO |  |  |
| care_date | DateTime | NO |  |  |
| attendance_status | String | NO | "expected" |  |
| expected_arrival_at | DateTime | YES |  |  |
| checked_in_at | DateTime | YES |  |  |
| checked_in_by_user_id | String | YES |  |  |
| check_in_method | String | YES |  |  |
| arrival_notes | String | YES |  |  |
| expected_departure_at | DateTime | YES |  |  |
| checked_out_at | DateTime | YES |  |  |
| checked_out_by_user_id | String | YES |  |  |
| check_out_method | String | YES |  |  |
| checked_out_to_pickup_id | String | YES |  |  |
| pickup_verification_status | String | YES |  |  |
| departure_notes | String | YES |  |  |
| no_show_marked_at | DateTime | YES |  |  |
| no_show_marked_by_user_id | String | YES |  |  |
| cancellation_after_cutoff | Boolean | NO | false |  |
| late_arrival_minutes | Int | NO | 0 |  |
| created_at | DateTime | NO | now( |  |
| updated_at | DateTime | NO | now( |  |
| reservation_night | ReservationNight | NO |  |  |
| events | AttendanceEvent | NO |  |  |

Indexes: (center_id, care_date), (child_id, care_date), (attendance_status, care_date), (parent_id)

## AttendanceEvent -> `attendance_events`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| attendance_record_id | String | NO |  |  |
| reservation_night_id | String | NO |  |  |
| center_id | String | YES |  |  |
| child_id | String | NO |  |  |
| actor_user_id | String | YES |  |  |
| event_type | String | NO |  |  |
| event_at | DateTime | NO | now( |  |
| metadata | Json | NO | "{}" |  |
| attendance_record | AttendanceRecord | NO |  |  |

Indexes: (attendance_record_id, event_at), (reservation_night_id, event_at), (center_id, event_at), (event_type, event_at)

## HealthCheckRun -> `health_check_runs`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| run_type | String | NO |  |  |
| started_at | DateTime | NO | now( |  |
| completed_at | DateTime | YES |  |  |
| status | String | NO | "running" |  |
| triggered_by_user_id | String | YES |  |  |
| summary | Json | NO | "{}" |  |
| created_at | DateTime | NO | now( |  |
| issues | HealthIssue | NO |  |  |

Indexes: (status, started_at), (triggered_by_user_id)

## HealthIssue -> `health_issues`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | String | NO | dbgenerated("gen_random_uuid( | PK |
| health_check_run_id | String | NO |  |  |
| issue_type | String | NO |  |  |
| severity | String | NO |  |  |
| status | String | NO | "open" |  |
| center_id | String | YES |  |  |
| program_id | String | YES |  |  |
| care_date | DateTime | YES |  |  |
| reservation_night_id | String | YES |  |  |
| attendance_record_id | String | YES |  |  |
| child_id | String | YES |  |  |
| metadata | Json | NO | "{}" |  |
| detected_at | DateTime | NO | now( |  |
| resolved_at | DateTime | YES |  |  |
| resolved_by_user_id | String | YES |  |  |
| resolution_notes | String | YES |  |  |
| health_check_run | HealthCheckRun | NO |  |  |

Indexes: (health_check_run_id), (severity, status), (issue_type, status), (care_date)
