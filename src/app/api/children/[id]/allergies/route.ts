import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound, logAuditEvent } from '@/lib/api-auth';
import { allergiesListSchema } from '@/lib/validation/children';

/**
 * POST /api/children/:id/allergies
 * Upsert allergy list + action plans in a transactional manner.
 * Body: { allergies: AllergyInput[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const childId = params.id;

  // Verify child ownership
  const { data: child, error: childError } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .single();

  if (childError || !child) return notFound('Child not found');

  const body = await req.json();
  const parsed = allergiesListSchema.safeParse(body.allergies || []);
  if (!parsed.success) {
    return badRequest(parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '));
  }

  const allergies = parsed.data;

  // Get existing allergies for this child
  const { data: existingAllergies } = await auth.supabase
    .from('child_allergies')
    .select('id, allergen, custom_label')
    .eq('child_id', childId);

  const existingMap = new Map(
    (existingAllergies || []).map(a => [`${a.allergen}:${a.custom_label || ''}`, a.id])
  );

  const newKeys = new Set(allergies.map(a => `${a.allergen}:${a.custom_label || ''}`));

  // Delete removed allergies (cascade will delete action plans)
  const toDelete = (existingAllergies || []).filter(
    a => !newKeys.has(`${a.allergen}:${a.custom_label || ''}`)
  );

  for (const allergy of toDelete) {
    await auth.supabase.from('child_allergies').delete().eq('id', allergy.id);
  }

  // Upsert each allergy + action plan
  const results = [];
  for (const allergy of allergies) {
    const key = `${allergy.allergen}:${allergy.custom_label || ''}`;
    const existingId = existingMap.get(key);

    let allergyId: string;

    if (existingId) {
      // Update severity
      const { data, error } = await auth.supabase
        .from('child_allergies')
        .update({ severity: allergy.severity, custom_label: allergy.custom_label || null })
        .eq('id', existingId)
        .select()
        .single();

      if (error) return badRequest(error.message);
      allergyId = data.id;
    } else {
      // Insert new allergy
      const { data, error } = await auth.supabase
        .from('child_allergies')
        .insert({
          child_id: childId,
          allergen: allergy.allergen,
          custom_label: allergy.custom_label || null,
          severity: allergy.severity,
        })
        .select()
        .single();

      if (error) return badRequest(error.message);
      allergyId = data.id;
    }

    // Upsert action plan if provided
    if (allergy.action_plan) {
      const plan = allergy.action_plan;
      const { data: existingPlan } = await auth.supabase
        .from('child_allergy_action_plans')
        .select('id')
        .eq('child_allergy_id', allergyId)
        .single();

      const planData = {
        child_allergy_id: allergyId,
        treatment_first_line: plan.treatment_first_line,
        dose_instructions: plan.dose_instructions || null,
        symptoms_watch: plan.symptoms_watch || null,
        med_location: plan.med_location || null,
        requires_med_on_site: plan.requires_med_on_site,
        medication_expires_on: plan.medication_expires_on || null,
        physician_name: plan.physician_name || null,
        parent_confirmed: plan.parent_confirmed,
        parent_confirmed_at: plan.parent_confirmed ? new Date().toISOString() : null,
      };

      if (existingPlan) {
        await auth.supabase
          .from('child_allergy_action_plans')
          .update(planData)
          .eq('id', existingPlan.id);
      } else {
        await auth.supabase
          .from('child_allergy_action_plans')
          .insert(planData);
      }
    }

    results.push(allergyId);
  }

  // Audit log
  await logAuditEvent(auth.supabase, auth.userId, 'update_allergies', 'child', childId, {
    allergy_count: allergies.length,
    deleted_count: toDelete.length,
  });

  // Return updated allergies
  const { data: updated } = await auth.supabase
    .from('child_allergies')
    .select('*, child_allergy_action_plans(*)')
    .eq('child_id', childId)
    .order('created_at', { ascending: true });

  return NextResponse.json({ allergies: updated || [] });
}
