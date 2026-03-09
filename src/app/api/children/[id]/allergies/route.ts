import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound, logAuditEvent } from '@/lib/api-auth';
import { allergiesListSchema } from '@/lib/validation/children';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const childId = params.id;
  const { data: child, error: childError } = await auth.supabase
    .from('children')
    .select('id, facility_id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();
  if (childError || !child) return notFound('Child not found');

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = allergiesListSchema.safeParse(body.allergies || []);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; '));
  }
  const allergies = parsed.data;

  const { data: existingAllergies, error: existingErr } = await auth.supabase
    .from('child_allergies')
    .select('id, allergen, custom_label')
    .eq('child_id', childId);
  if (existingErr) return badRequest(existingErr.message);

  const existingMap = new Map((existingAllergies || []).map(a => [`${a.allergen}:${a.custom_label || ''}`, a.id]));
  const newKeys = new Set(allergies.map(a => `${a.allergen}:${a.custom_label || ''}`));
  const toDelete = (existingAllergies || []).filter(a => !newKeys.has(`${a.allergen}:${a.custom_label || ''}`));

  for (const allergy of allergies) {
    if (allergy.severity === 'SEVERE' && !allergy.action_plan?.treatment_first_line) {
      return badRequest(`Severe allergy ${allergy.allergen} requires action plan metadata`);
    }
  }

  for (const allergy of toDelete) {
    const { error } = await auth.supabase.from('child_allergies').delete().eq('id', allergy.id);
    if (error) return badRequest(error.message);
  }

  for (const allergy of allergies) {
    const key = `${allergy.allergen}:${allergy.custom_label || ''}`;
    const existingId = existingMap.get(key);
    let allergyId = existingId || '';

    if (existingId) {
      const { data, error } = await auth.supabase
        .from('child_allergies')
        .update({ severity: allergy.severity, custom_label: allergy.custom_label || null })
        .eq('id', existingId)
        .select()
        .single();
      if (error) return badRequest(error.message);
      allergyId = data.id;
    } else {
      const { data, error } = await auth.supabase
        .from('child_allergies')
        .insert({ child_id: childId, allergen: allergy.allergen, custom_label: allergy.custom_label || null, severity: allergy.severity })
        .select()
        .single();
      if (error) return badRequest(error.message);
      allergyId = data.id;
      await auth.supabase.from('child_events').insert({
        child_id: childId,
        facility_id: child.facility_id,
        event_type: 'allergy_added',
        event_data: { allergen: allergy.allergen, severity: allergy.severity },
        created_by: auth.userId,
      });
    }

    const plan = allergy.action_plan;
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

    const { data: existingPlan } = await auth.supabase
      .from('child_allergy_action_plans')
      .select('id')
      .eq('child_allergy_id', allergyId)
      .maybeSingle();

    const planMutation = existingPlan
      ? await auth.supabase.from('child_allergy_action_plans').update(planData).eq('id', existingPlan.id).select().single()
      : await auth.supabase.from('child_allergy_action_plans').insert(planData).select().single();

    if (planMutation.error) {
      return NextResponse.json({ error: 'Failed to save allergy action plan', detail: planMutation.error.message }, { status: 400 });
    }

    await auth.supabase.from('child_events').insert({
      child_id: childId,
      facility_id: child.facility_id,
      event_type: 'allergy_action_plan_saved',
      event_data: { allergy_id: allergyId },
      created_by: auth.userId,
    });
  }

  await logAuditEvent(auth.supabase, auth.userId, 'update_allergies', 'child', childId, { allergy_count: allergies.length, deleted_count: toDelete.length });

  const { data: updated } = await auth.supabase
    .from('child_allergies')
    .select('*, child_allergy_action_plans(*)')
    .eq('child_id', childId)
    .order('created_at', { ascending: true });

  return NextResponse.json({ allergies: updated || [] });
}
