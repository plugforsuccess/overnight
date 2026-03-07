import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { createLogger, withCorrelationId } from '@/lib/logger';
import { z } from 'zod';

const signatureSchema = z.object({
  versionId: z.string().uuid('Invalid version ID'),
});

/**
 * GET /api/documents
 * Returns all active documents with their latest published version,
 * plus which ones the current parent has signed.
 */
export async function GET(req: NextRequest) {
  const correlationId = withCorrelationId(req);
  const log = createLogger('api/documents', correlationId);

  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  log.info('fetching documents', { parentId: auth.parentId });

  // Get all active documents with their published versions
  const { data: documents, error: docError } = await supabaseAdmin
    .from('parent_documents')
    .select(`
      id,
      slug,
      title,
      description,
      required,
      versions:document_versions(
        id,
        version,
        content,
        changelog,
        published_at
      )
    `)
    .eq('active', true)
    .order('title', { ascending: true });

  if (docError) {
    log.error('failed to fetch documents', { error: docError.message });
    return badRequest('Failed to load documents');
  }

  // Get parent's signatures
  const { data: signatures } = await supabaseAdmin
    .from('document_signatures')
    .select('id, version_id, signed_at')
    .eq('parent_id', auth.parentId);

  const signedVersionIds = new Set(
    (signatures || []).map((s: { version_id: string }) => s.version_id),
  );

  // Annotate each document with signing status
  const result = (documents || []).map((doc) => {
    const versions = (doc.versions as Array<{ id: string; version: number; content: string; changelog: string | null; published_at: string | null }>) || [];
    const latestVersion = versions
      .filter((v) => v.published_at)
      .sort((a, b) => b.version - a.version)[0] || null;

    return {
      id: doc.id,
      slug: doc.slug,
      title: doc.title,
      description: doc.description,
      required: doc.required,
      latestVersion,
      signed: latestVersion ? signedVersionIds.has(latestVersion.id) : false,
      signedVersionIds: versions
        .filter((v) => signedVersionIds.has(v.id))
        .map((v) => v.id),
    };
  });

  const response = NextResponse.json({ documents: result });
  response.headers.set('X-Correlation-ID', correlationId);
  return response;
}

/**
 * POST /api/documents
 * Sign/acknowledge a specific document version.
 * Creates an immutable signature record.
 */
export async function POST(req: NextRequest) {
  const correlationId = withCorrelationId(req);
  const log = createLogger('api/documents', correlationId);

  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid request body');
  }

  const parsed = signatureSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((e) => e.message).join(', '));
  }

  const { versionId } = parsed.data;

  // Verify the version exists and is published
  const { data: version } = await supabaseAdmin
    .from('document_versions')
    .select('id, document_id, version, published')
    .eq('id', versionId)
    .single();

  if (!version) {
    return badRequest('Document version not found');
  }

  if (!version.published) {
    return badRequest('Cannot sign an unpublished document version');
  }

  log.info('signing document', {
    parentId: auth.parentId,
    versionId,
    documentId: version.document_id,
  });

  // Create the signature (unique constraint prevents duplicates)
  const { data: signature, error: sigError } = await supabaseAdmin
    .from('document_signatures')
    .insert({
      parent_id: auth.parentId,
      version_id: versionId,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent') || null,
    })
    .select('id, signed_at')
    .single();

  if (sigError) {
    if (sigError.message?.includes('duplicate') || sigError.code === '23505') {
      log.info('document already signed', { parentId: auth.parentId, versionId });
      const response = NextResponse.json({ message: 'Already signed', alreadySigned: true });
      response.headers.set('X-Correlation-ID', correlationId);
      return response;
    }
    log.error('failed to create signature', { error: sigError.message });
    return badRequest('Failed to sign document');
  }

  log.info('document signed', {
    parentId: auth.parentId,
    signatureId: signature.id,
  });

  const response = NextResponse.json({
    signature: {
      id: signature.id,
      versionId,
      signedAt: signature.signed_at,
    },
  });
  response.headers.set('X-Correlation-ID', correlationId);
  return response;
}
