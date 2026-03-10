'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';

export function useRevenueEntries(agencyId) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEntries = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('revenue_entries')
      .select('*')
      .eq('agency_id', agencyId)
      .order('date', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setEntries(data || []);
    }
    setLoading(false);
  }, [agencyId]);

  const addEntry = useCallback(async (entry) => {
    if (!agencyId) return { error: 'No agency ID' };

    const { error: insertError } = await supabase
      .from('revenue_entries')
      .insert({
        agency_id: agencyId,
        date: entry.date,
        product: entry.product,
        premium: entry.premium,
        policy_count: entry.policyCount ?? 1,
        tier: entry.tier ?? 'monoline',
        source: 'manual',
        note: entry.note ?? null,
        policy_no: entry.policy_no ?? null,
      });

    if (!insertError) {
      await fetchEntries();
    }
    return { error: insertError?.message ?? null };
  }, [agencyId, fetchEntries]);

  const addEntries = useCallback(async (newEntries) => {
    if (!agencyId) return { error: 'No agency ID' };

    const rows = newEntries.map(e => ({
      agency_id: agencyId,
      date:         e.date,
      product:      e.product,
      premium:      e.premium,
      policy_count: e.policyCount ?? 1,
      tier:         e.tier ?? 'monoline',
      source:       'upload',   // always "upload" — overwrites "manual" on conflict
      note:         e.note ?? null,
      policy_no:    e.policy_no ?? null,
    }));

    const { error: upsertError } = await supabase
      .from('revenue_entries')
      .upsert(rows, {
        onConflict: 'agency_id,policy_no',
        ignoreDuplicates: false,   // false = update existing rows
      });

    if (!upsertError) {
      await fetchEntries();
    }
    return { error: upsertError?.message ?? null };
  }, [agencyId, fetchEntries]);

  const updateEntry = useCallback(async (id, updates) => {
    const { error: updateError } = await supabase
      .from('revenue_entries')
      .update(updates)
      .eq('id', id);

    if (!updateError) {
      await fetchEntries();
    }
    return { error: updateError?.message ?? null };
  }, [fetchEntries]);

  const deleteEntry = useCallback(async (id) => {
    const { error: deleteError } = await supabase
      .from('revenue_entries')
      .delete()
      .eq('id', id);

    if (!deleteError) {
      await fetchEntries();
    }
    return { error: deleteError?.message ?? null };
  }, [fetchEntries]);

  return {
    entries,
    loading,
    error,
    fetchEntries,
    addEntry,
    addEntries,
    updateEntry,
    deleteEntry,
  };
}
