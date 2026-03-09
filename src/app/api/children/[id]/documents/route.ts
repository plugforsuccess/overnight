import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { childDocumentSchema } from '@/lib/validation/children';
import { supabaseAdmin } from '@/lib/supabase-server';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { id: childId } = await params;

  // Verify child belongs to parent
  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!child) return badRequest('Child not found');

  const { data, error } = await auth.supabase
    .from('child_documents')
    .select('*')
    .eq('child_id', childId)
    .eq('facility_id', auth.activeFacilityId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return badRequest('Failed to load documents');
  return NextResponse.json({ documents: data || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { id: childId } = await params;

  // Verify child belongs to parent
  const { data: child } = await auth.supabase
    .from('children')
    .select('id, facility_id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!child) return badRequest('Child not found');

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const metadataStr = formData.get('metadata') as string | null;

  if (!file) return badRequest('File is required');

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return badRequest('File size must be under 10 MB');
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return badRequest('Only PDF, JPEG, PNG, and WebP files are allowed');
  }

  // Parse and validate metadata
  let metadata;
  try {
    metadata = metadataStr ? JSON.parse(metadataStr) : {};
  } catch {
    return badRequest('Invalid metadata');
  }

  const parsed = childDocumentSchema.safeParse({
    document_type: metadata.document_type || 'other',
    file_name: file.name,
    expires_at: metadata.expires_at || null,
    notes: metadata.notes || null,
  });

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  // Server-constructed storage path — prevents path tampering
  const facilityId = child.facility_id || auth.activeFacilityId;
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const storagePath = `child-documents/${facilityId}/${childId}/${parsed.data.document_type}/${randomUUID()}.${fileExt}`;

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from('private')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return badRequest('Failed to upload file. Please try again.');
  }

  // Create signed URL (valid for 1 hour)
  const { data: urlData } = await supabaseAdmin.storage
    .from('private')
    .createSignedUrl(storagePath, 3600);

  const fileUrl = urlData?.signedUrl || storagePath;

  // Insert document record
  const { data: doc, error: insertError } = await supabaseAdmin
    .from('child_documents')
    .insert({
      child_id: childId,
      facility_id: facilityId,
      document_type: parsed.data.document_type,
      file_name: parsed.data.file_name,
      file_url: fileUrl,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: auth.userId,
      expires_at: parsed.data.expires_at,
      notes: parsed.data.notes,
    })
    .select()
    .single();

  if (insertError) {
    // Clean up uploaded file on insert failure
    await supabaseAdmin.storage.from('private').remove([storagePath]);
    return badRequest('Failed to save document record');
  }

  // Log to child_events
  await supabaseAdmin.from('child_events').insert({
    facility_id: facilityId,
    child_id: childId,
    event_type: 'document_uploaded',
    event_data: { document_type: parsed.data.document_type, document_id: doc.id },
    created_by: auth.userId,
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
