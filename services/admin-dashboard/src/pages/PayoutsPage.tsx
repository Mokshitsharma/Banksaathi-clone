import { useState } from 'react';
import type { Paginated, Payout, PayoutStatus } from '@refera/shared-types';
import { api } from '../api';
import { Badge, ErrorBox, PageHeader, Pager, Tabs, useAction, useLoad } from '../components';
import { dateTime, money, tone } from '../format';

type Row = Payout & { user: { id: string; name: string | null; phone: string; kycRecord: { bankAccountMasked: string | null; bankIfsc: string | null } | null } };

export function PayoutsPage() {
  const [status, setStatus] = useState<PayoutStatus>('pending');
  const [page, setPage] = useState(1);
  const { data, error, reload } = useLoad(() => api<Paginated<Row>>('/admin/payouts', { query: { status, page } }), [status, page]);
  const action = useAction();

  async function process(p: Row) {
    if (await action.run(() => api(`/admin/payouts/${p.id}/process`, { method: 'POST' }))) void reload();
  }
  async function complete(p: Row) {
    const transactionRef = prompt(`UTR / transaction reference for ${money(p.amountPaise)} to ${p.user.name ?? p.user.phone}:`);
    if (!transactionRef) return;
    if (await action.run(() => api(`/admin/payouts/${p.id}/complete`, { method: 'POST', body: { transactionRef } }))) void reload();
  }
  async function fail(p: Row) {
    const reason = prompt('Why did this payout fail? The amount will be returned to the affiliate balance.');
    if (!reason) return;
    if (await action.run(() => api(`/admin/payouts/${p.id}/fail`, { method: 'POST', body: { reason } }))) void reload();
  }

  return (
    <>
      <PageHeader title="Payouts" />
      <Tabs<PayoutStatus>
        value={status}
        onChange={(v) => { setStatus(v); setPage(1); }}
        options={[
          { value: 'pending', label: 'Requested' },
          { value: 'processing', label: 'Processing' },
          { value: 'completed', label: 'Completed' },
          { value: 'failed', label: 'Failed' },
        ]}
      />
      <ErrorBox message={error ?? action.error} />
      <div className="card table-card">
        <table>
          <thead><tr><th>Affiliate</th><th>Bank</th><th>Amount</th><th>Status</th><th>Reference</th><th>Requested</th><th /></tr></thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.user.name ?? '—'}</strong><div className="muted small">{p.user.phone}</div></td>
                <td className="small">{p.user.kycRecord?.bankAccountMasked ?? '—'}<div className="muted">{p.user.kycRecord?.bankIfsc}</div></td>
                <td><strong>{money(p.amountPaise)}</strong></td>
                <td><Badge label={p.status} tone={tone.payout[p.status]} /></td>
                <td className="small">{p.transactionRef ?? p.failureReason ?? '—'}</td>
                <td className="small">{dateTime(p.createdAt)}</td>
                <td className="actions">
                  {p.status === 'pending' && <button className="btn btn-secondary" disabled={action.busy} onClick={() => process(p)}>Start processing</button>}
                  {(p.status === 'pending' || p.status === 'processing') && (
                    <>
                      <button className="btn btn-primary" disabled={action.busy} onClick={() => complete(p)}>Mark paid</button>
                      <button className="btn btn-ghost danger" disabled={action.busy} onClick={() => fail(p)}>Fail</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {data?.items.length === 0 && <tr><td colSpan={7} className="empty">No payouts here.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
