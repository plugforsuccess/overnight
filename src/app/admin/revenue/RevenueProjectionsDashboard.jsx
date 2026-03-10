'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRevenueEntries } from '@/hooks/useRevenueEntries';

// Commission rates by product and tier
const COMMISSION_RATES = {
  auto: { monoline: 0.10, multiline: 0.12 },
  home: { monoline: 0.12, multiline: 0.15 },
  life: { monoline: 0.40, multiline: 0.40 },
  commercial: { monoline: 0.10, multiline: 0.12 },
};

function calcCommission(premium, product, tier) {
  const productKey = (product || '').toLowerCase();
  const tierKey = (tier || 'monoline').toLowerCase();
  const rates = COMMISSION_RATES[productKey] ?? { monoline: 0.10, multiline: 0.12 };
  const rate = rates[tierKey] ?? rates.monoline;
  return Math.round((premium || 0) * rate * 100) / 100;
}

function fmt(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

function sourceBadge(source) {
  if (source === 'upload') {
    return (
      <span style={{
        display: 'inline-block', padding: '1px 7px', borderRadius: 10,
        fontSize: 11, fontWeight: 600, background: '#DBEAFE', color: '#1D4ED8',
      }}>upload</span>
    );
  }
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 10,
      fontSize: 11, fontWeight: 600, background: '#F3F4F6', color: '#374151',
    }}>manual</span>
  );
}

const TH_STYLE = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#94A3B8',
  background: '#1E293B',
  borderBottom: '1px solid #334155',
};

function SortTh({ col, label, sortCol, sortDir, onSort }) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{ ...TH_STYLE, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <span style={{ fontSize: 9, color: active ? '#E2E8F0' : '#334155', lineHeight: 1 }}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  );
}

const PERIOD_OPTIONS = [
  { label: 'This Month', value: 'month' },
  { label: 'YTD', value: 'ytd' },
];

const PRODUCTS = ['Auto', 'Home', 'Life', 'Commercial'];
const TIERS = ['monoline', 'multiline'];

export default function RevenueProjectionsDashboard({ agencyId }) {
  // Period filter
  const [period, setPeriod] = useState('month');

  // Sort state
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  // Add entry form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formValues, setFormValues] = useState({
    date: new Date().toISOString().slice(0, 10),
    product: 'Auto',
    tier: 'monoline',
    premium: '',
    note: '',
    policy_no: '',
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const { entries, loading, error, fetchEntries, addEntry, addEntries, deleteEntry } =
    useRevenueEntries(agencyId);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Date range for current period
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (period === 'month') {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
    } else {
      return {
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      };
    }
  }, [period]);

  // Filtered entries for current period
  const filtered = useMemo(() => {
    return entries.filter(e => e.date >= startDate && e.date <= endDate);
  }, [entries, startDate, endDate]);

  // Sorted entries
  const sortedEntries = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case 'date':       av = a.date;       bv = b.date;       break;
        case 'product':    av = a.product;    bv = b.product;    break;
        case 'tier':       av = a.tier;       bv = b.tier;       break;
        case 'premium':    av = a.premium;    bv = b.premium;    break;
        case 'commission':
          av = calcCommission(a.premium, a.product, a.tier);
          bv = calcCommission(b.premium, b.product, b.tier);
          break;
        case 'source':     av = a.source;     bv = b.source;     break;
        default:           av = a.date;       bv = b.date;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir]);

  // Summary metrics
  const { totalPremium, totalCommission, entryCount } = useMemo(() => {
    return filtered.reduce(
      (acc, e) => ({
        totalPremium: acc.totalPremium + (e.premium || 0),
        totalCommission: acc.totalCommission + calcCommission(e.premium, e.product, e.tier),
        entryCount: acc.entryCount + 1,
      }),
      { totalPremium: 0, totalCommission: 0, entryCount: 0 }
    );
  }, [filtered]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'date' ? 'desc' : 'asc');
    }
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!formValues.premium || isNaN(Number(formValues.premium))) {
      setFormError('Premium must be a valid number.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const { error: saveError } = await addEntry({
      date: formValues.date,
      product: formValues.product,
      tier: formValues.tier,
      premium: Number(formValues.premium),
      note: formValues.note || null,
      policy_no: formValues.policy_no || null,
    });
    setSaving(false);
    if (saveError) {
      setFormError(saveError);
    } else {
      setShowAddForm(false);
      setFormValues({
        date: new Date().toISOString().slice(0, 10),
        product: 'Auto',
        tier: 'monoline',
        premium: '',
        note: '',
        policy_no: '',
      });
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(Boolean);
      if (lines.length < 2) throw new Error('CSV appears to be empty.');

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      const rows = lines.slice(1).map(line => {
        const values = line.split(',');
        return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? '').trim()]));
      });

      const mappedEntries = rows
        .filter(r => r.date && r.premium)
        .map(r => ({
          date: r.date,
          product: r.product || 'Auto',
          tier: r.tier || 'monoline',
          premium: Number(r.premium) || 0,
          policyCount: Number(r.policy_count) || 1,
          note: r.note || null,
          policy_no: r.policy_no || r.policy_number || null,
        }));

      if (mappedEntries.length === 0) throw new Error('No valid rows found in CSV.');

      const { error: uploadErr } = await addEntries(mappedEntries);
      if (uploadErr) throw new Error(uploadErr);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const thStyle = TH_STYLE;

  const tdStyle = {
    padding: '10px 12px',
    fontSize: 13,
    color: '#CBD5E1',
    borderBottom: '1px solid #1E293B',
  };

  return (
    <div style={{ background: '#0F172A', minHeight: '100vh', color: '#E2E8F0', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>Revenue Projections</h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0' }}>
            {period === 'month' ? 'This Month' : 'Year to Date'} · {filtered.length} entries
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                background: period === opt.value ? '#3B82F6' : '#1E293B',
                color: period === opt.value ? '#fff' : '#94A3B8',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Entries', value: entryCount },
          { label: 'Total Premium', value: fmt(totalPremium) },
          { label: 'Est. Commission', value: fmt(totalCommission) },
        ].map(card => (
          <div key={card.label} style={{ background: '#1E293B', borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <button
          onClick={() => setShowAddForm(f => !f)}
          style={{
            padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: '#3B82F6', color: '#fff', fontSize: 13, fontWeight: 500,
          }}
        >
          + Add Entry
        </button>

        <label style={{
          padding: '7px 16px', borderRadius: 6, cursor: 'pointer',
          background: '#1E293B', color: '#94A3B8', fontSize: 13, fontWeight: 500, border: '1px solid #334155',
        }}>
          {uploading ? 'Uploading…' : 'Upload CSV'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>

        {uploadError && (
          <span style={{ color: '#F87171', fontSize: 12 }}>{uploadError}</span>
        )}
      </div>

      {/* Add entry form */}
      {showAddForm && (
        <form
          onSubmit={handleAddEntry}
          style={{
            background: '#1E293B', borderRadius: 10, padding: 20, marginBottom: 20,
            display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12,
          }}
        >
          {[
            { name: 'date', label: 'Date', type: 'date' },
            { name: 'policy_no', label: 'Policy #', type: 'text', placeholder: 'optional' },
          ].map(f => (
            <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase' }}>{f.label}</label>
              <input
                type={f.type}
                value={formValues[f.name]}
                placeholder={f.placeholder}
                onChange={ev => setFormValues(v => ({ ...v, [f.name]: ev.target.value }))}
                style={{
                  background: '#0F172A', border: '1px solid #334155', borderRadius: 6,
                  padding: '6px 10px', color: '#E2E8F0', fontSize: 13,
                }}
              />
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase' }}>Product</label>
            <select
              value={formValues.product}
              onChange={ev => setFormValues(v => ({ ...v, product: ev.target.value }))}
              style={{
                background: '#0F172A', border: '1px solid #334155', borderRadius: 6,
                padding: '6px 10px', color: '#E2E8F0', fontSize: 13,
              }}
            >
              {PRODUCTS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase' }}>Tier</label>
            <select
              value={formValues.tier}
              onChange={ev => setFormValues(v => ({ ...v, tier: ev.target.value }))}
              style={{
                background: '#0F172A', border: '1px solid #334155', borderRadius: 6,
                padding: '6px 10px', color: '#E2E8F0', fontSize: 13,
              }}
            >
              {TIERS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase' }}>Premium ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formValues.premium}
              onChange={ev => setFormValues(v => ({ ...v, premium: ev.target.value }))}
              style={{
                background: '#0F172A', border: '1px solid #334155', borderRadius: 6,
                padding: '6px 10px', color: '#E2E8F0', fontSize: 13,
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase' }}>Note</label>
            <input
              type="text"
              value={formValues.note}
              onChange={ev => setFormValues(v => ({ ...v, note: ev.target.value }))}
              style={{
                background: '#0F172A', border: '1px solid #334155', borderRadius: 6,
                padding: '6px 10px', color: '#E2E8F0', fontSize: 13,
              }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '7px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: '#22C55E', color: '#fff', fontSize: 13, fontWeight: 500,
              }}
            >
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              style={{
                padding: '7px 14px', borderRadius: 6, border: '1px solid #334155',
                cursor: 'pointer', background: 'transparent', color: '#94A3B8', fontSize: 13,
              }}
            >
              Cancel
            </button>
            {formError && <span style={{ color: '#F87171', fontSize: 12 }}>{formError}</span>}
          </div>
        </form>
      )}

      {/* Entries table */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#64748B', padding: 40 }}>Loading entries…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', color: '#F87171', padding: 40 }}>{error}</div>
      ) : sortedEntries.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#64748B', padding: 40 }}>
          No entries for this period. Add one above or upload a CSV.
        </div>
      ) : (
        <div style={{ background: '#1E293B', borderRadius: 10, overflow: 'hidden', border: '1px solid #334155' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <SortTh col="date"       label="Date"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="product"    label="Product"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="tier"       label="Tier"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="premium"    label="Premium"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="commission" label="Commission" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="source"     label="Source"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <th style={{ ...thStyle, cursor: 'default' }}>Note</th>
                <th style={{ ...thStyle, cursor: 'default', width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((e, i) => (
                <tr key={e.id ?? i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td style={tdStyle}>{e.date}</td>
                  <td style={tdStyle}>{e.product}</td>
                  <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{e.tier}</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{fmt(e.premium)}</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', color: '#34D399' }}>
                    {fmt(calcCommission(e.premium, e.product, e.tier))}
                  </td>
                  <td style={tdStyle}>{sourceBadge(e.source)}</td>
                  <td style={{ ...tdStyle, color: '#64748B', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.note || '—'}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => deleteEntry(e.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#475569', fontSize: 14, padding: '2px 6px',
                      }}
                      title="Delete entry"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
