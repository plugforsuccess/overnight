import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const startDate = url.searchParams.get('start');
    const endDate = url.searchParams.get('end');

    // Calculate date range (default: current week, Mon-Sun)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = startDate || new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset).toISOString().split('T')[0];
    const weekEnd = endDate || new Date(new Date(weekStart).getTime() + 6 * 86400000).toISOString().split('T')[0];

    // Fetch billing ledger entries in range
    let ledgerQuery = supabaseAdmin
      .from('billing_ledger')
      .select(`
        id, parent_id, reservation_night_id, child_id, amount_cents, status,
        payment_provider, care_date, description, created_at,
        parent:parents(id, first_name, last_name, email),
        child:children(id, first_name, last_name)
      `)
      .gte('care_date', weekStart)
      .lte('care_date', weekEnd)
      .order('care_date', { ascending: false });

    const { data: ledgerEntries, error: ledgerError } = await ledgerQuery;

    if (ledgerError) {
      return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    }

    const entries = ledgerEntries || [];

    // Compute metrics
    const weeklyExpected = entries
      .filter((e: any) => e.status === 'pending' || e.status === 'paid')
      .reduce((sum: number, e: any) => sum + e.amount_cents, 0);

    const collected = entries
      .filter((e: any) => e.status === 'paid')
      .reduce((sum: number, e: any) => sum + e.amount_cents, 0);

    const outstanding = entries
      .filter((e: any) => e.status === 'pending')
      .reduce((sum: number, e: any) => sum + e.amount_cents, 0);

    const failedPayments = entries.filter((e: any) => e.status === 'failed').length;

    const refunded = entries
      .filter((e: any) => e.status === 'refunded')
      .reduce((sum: number, e: any) => sum + e.amount_cents, 0);

    // Upcoming reservation revenue: future confirmed nights without billing entries
    const today = now.toISOString().split('T')[0];
    const { data: upcomingNights } = await supabaseAdmin
      .from('reservation_nights')
      .select('id, care_date, child:children(id, first_name, last_name, parent:parents(id, first_name, last_name))')
      .gt('care_date', today)
      .in('status', ['confirmed', 'pending'])
      .order('care_date')
      .limit(100);

    // Also fetch payments as fallback revenue data
    let paymentsQuery = supabaseAdmin
      .from('payments')
      .select('id, parent_id, amount_cents, status, description, created_at, parent:parents(id, first_name, last_name, email)')
      .gte('created_at', weekStart)
      .lte('created_at', weekEnd + 'T23:59:59Z')
      .order('created_at', { ascending: false });

    const { data: payments } = await paymentsQuery;

    // If no billing_ledger entries exist, derive metrics from payments table
    const usePaymentsFallback = entries.length === 0 && (payments || []).length > 0;
    let fallbackMetrics: any = null;

    if (usePaymentsFallback) {
      const paymentsList = payments || [];
      fallbackMetrics = {
        weekly_expected: paymentsList
          .filter((p: any) => p.status === 'pending' || p.status === 'succeeded')
          .reduce((sum: number, p: any) => sum + p.amount_cents, 0),
        collected: paymentsList
          .filter((p: any) => p.status === 'succeeded')
          .reduce((sum: number, p: any) => sum + p.amount_cents, 0),
        outstanding: paymentsList
          .filter((p: any) => p.status === 'pending')
          .reduce((sum: number, p: any) => sum + p.amount_cents, 0),
        failed_payments: paymentsList.filter((p: any) => p.status === 'failed').length,
      };
    }

    return NextResponse.json({
      period: { start: weekStart, end: weekEnd },
      weekly_expected: fallbackMetrics?.weekly_expected ?? weeklyExpected,
      collected: fallbackMetrics?.collected ?? collected,
      outstanding: fallbackMetrics?.outstanding ?? outstanding,
      failed_payments: fallbackMetrics?.failed_payments ?? failedPayments,
      refunded,
      upcoming_reservation_count: (upcomingNights || []).length,
      ledger_entries: entries,
      payments: usePaymentsFallback ? payments : undefined,
      source: usePaymentsFallback ? 'payments' : 'billing_ledger',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
