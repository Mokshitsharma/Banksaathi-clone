import { useState } from 'react';
import type { Lead, LeadStatus, Paginated } from '@refera/shared-types';
import { api } from '../api';
import { Badge, ErrorBox, PageHeader, Pager, Tabs, useAction, useLoad } from '../components';
import { dateTime, LEAD_STATUS_LABEL, money, PRODUCT_LABEL, tone } from '../format';

const NEXT: Record<LeadStatus, LeadStatus[]> = {
  new: ['contacted', 'rejected'],
  contacted: ['in_progress', 'rejected'],
  in_progress: ['converted', 'rejected'],
  converted: [],
  rejected: [],
};

type Filter = LeadStatus | 'all';

export function LeadsPage() {
  const [filter, setFilter] = useState<Filter>('new');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [converting, setConverting] = useState<Lead | null>(null);
  const action = useAction();

  const { data, error, reload } = useLoad(
    () =>
      api<Paginated<Lead>>('/leads', {
        query: { status: filter === 'all' ? undefined : filter, search, page, pageSize: 25 },
      }),
    [filter, search, page],
  );

  async function move(lead: Lead, status: LeadStatus, extra: { dealAmount?: number; notes?: string } = {}) {
    if (status === 'rejected' && !confirm(`Reject lead for ${lead.leadName}?`)) return;
    const ok = await action.run(() => api(`/admin/leads/${lead.id}/status`, { method: 'PATCH', body: { status, ...extra } }));
    if (ok) {
      setConverting(null);
      void reload();
    }
  }

  return (
    <>
      <PageHeader title="Lead queue">
        <input className="search" placeholder="Search name or phone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </PageHeader>
      <Tabs<Filter>
        value={filter}
        onChange={(v) => { setFilter(v); setPage(1); }}
        options={[
          { value: 'new', label: 'New' },
          { value: 'contacted', label: 'Contacted' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'converted', label: 'Converted' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'all', label: 'All' },
        ]}
      />
      <ErrorBox message={error ?? action.error} />
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Lead</th>
              <th>Product</th>
              <th>Referred by</th>
              <th>Deal</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((l) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.leadName}</strong>
                  <div className="muted small">{l.leadPhone}</div>
                  {l.notes && <div className="muted small clamp">{l.notes}</div>}
                </td>
                <td>{PRODUCT_LABEL[l.productType]}</td>
                <td>
                  {l.referredBy?.name ?? '—'}
                  <div className="muted small">{l.referredBy?.phone}</div>
                </td>
                <td>{l.dealAmountPaise != null ? money(l.dealAmountPaise) : '—'}</td>
                <td><Badge label={LEAD_STATUS_LABEL[l.status]} tone={tone.lead[l.status]} /></td>
                <td className="small">{dateTime(l.createdAt)}</td>
                <td className="actions">
                  {NEXT[l.status].map((s) => (
                    <button
                      key={s}
                      className={s === 'rejected' ? 'btn btn-ghost danger' : 'btn btn-secondary'}
                      disabled={action.busy}
                      onClick={() => (s === 'converted' ? setConverting(l) : move(l, s))}
                    >
                      {s === 'rejected' ? 'Reject' : `→ ${LEAD_STATUS_LABEL[s]}`}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
            {data?.items.length === 0 && (
              <tr><td colSpan={7} className="empty">No leads here.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      {converting && <ConvertDialog lead={converting} busy={action.busy} onCancel={() => setConverting(null)} onConfirm={(extra) => move(converting, 'converted', extra)} />}
    </>
  );
}

function ConvertDialog({ lead, busy, onCancel, onConfirm }: { lead: Lead; busy: boolean; onCancel: () => void; onConfirm: (x: { dealAmount?: number; notes?: string }) => void }) {
  const [amount, setAmount] = useState(lead.dealAmountPaise != null ? String(lead.dealAmountPaise / 100) : '');
  const [notes, setNotes] = useState('');
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="card modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm({ dealAmount: amount ? Number(amount) : undefined, notes: notes || undefined });
        }}
      >
        <h2>Convert {lead.leadName}</h2>
        <p className="muted">Commissions are created automatically from the active rules for {PRODUCT_LABEL[lead.productType].toLowerCase()}.</p>
        <label>
          Final deal amount (₹) — loan disbursed / card limit / premium
          <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Required for % rules" />
        </label>
        <label>
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="row-end">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>Mark converted</button>
        </div>
      </form>
    </div>
  );
}
