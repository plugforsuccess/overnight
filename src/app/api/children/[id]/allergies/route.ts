import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound, logAuditEvent, verifyGuardianAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
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

  // Verify guardian access to this child
  const guardian = await verifyGuardianAccess(auth.userId, childId);
  if (!guardian) {
    // Fallback: parent_id check for backward compatibility
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', childId).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = allergiesListSchema.safeParse(body.allergies || []);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; '));
  }

  const allergies = parsed.data;

  // Get existing allergies for this child
  const { data: existingAllergies } = await supabaseAdmin
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
    await supabaseAdmin.from('child_allergies').delete().eq('id', allergy.id);
  }

  // Upsert each allergy + action plan
  const results = [];
  for (const allergy of allergies) {
    const key = `${allergy.allergen}:${allergy.custom_label || ''}`;
    const existingId = existingMap.get(key);

    let allergyId: string;

    if (existingId) {
      // Update severity
      const { data, error } = await supabaseAdmin
        .from('child_allergies')
        .update({ severity: allergy.severity, custom_label: allergy.custom_label || null })
        .eq('id', existingId)
        .select()
        .single();

      if (error) return badRequest(error.message);
      allergyId = data.id;
    } else {
      // Insert new allergy
      const { data, error } = await supabaseAdmin
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

    // Upsert action plan (required for every allergy)
    {
      const plan = allergy.action_plan;
      const { data: existingPlan } = await supabaseAdmin
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
        await supabaseAdmin
          .from('child_allergy_action_plans')
          .update(planData)
          .eq('id', existingPlan.id);
      } else {
        await supabaseAdmin
          .from('child_allergy_action_plans')
          .insert(planData);
      }
    }

    results.push(allergyId);
  }

  // Audit log
  await logAuditEvent(supabaseAdmin, auth.userId, 'update_allergies', 'child', childId, {
    allergy_count: allergies.length,
    deleted_count: toDelete.length,
  });

  // Return updated allergies
  const { data: updated } = await supabaseAdmin
    .from('child_allergies')
    .select('*, child_allergy_action_plans(*)')
    .eq('child_id', childId)
    .order('created_at', { ascending: true });

  return NextResponse.json({ allergies: updated || [] });
}
