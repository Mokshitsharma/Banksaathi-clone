import { useState } from 'react';
import type { Commission, CommissionStatus, Paginated, ProductType } from '@refera/shared-types';
import { api } from '../api';
import { Badge, ErrorBox, PageHeader, Pager, Tabs, useAction, useLoad } from '../components';
import { dateTime, money, PRODUCT_LABEL, tone } from '../format';

type Row = Commission & { lead: { id: string; leadName: string; productType: ProductType; dealAmountPaise: number | null } };

export function CommissionsPage() {
  const [status, setStatus] = useState<CommissionStatus>('pending');
  const [page, setPage] = useState(1);
  const { data, error, reload } = useLoad(() => api<Paginated<Row>>('/admin/commissions', { query: { status, page } }), [status, page]);
  const action = useAction();

  async function act(c: Row, verb: 'approve' | 'reject') {
    if (verb === 'reject' && !confirm(`Reject ${money(c.amountPaise)} commission for ${c.user?.name ?? c.user?.phone}?`)) return;
    if (await action.run(() => api(`/admin/commissions/${c.id}/${verb}`, { method: 'POST' }))) void reload();
  }

  return (
    <>
      <PageHeader title="Commissions" />
      <Tabs<CommissionStatus>
        value={status}
        onChange={(v) => { setStatus(v); setPage(1); }}
        options={[
          { value: 'pending', label: 'Pending approval' },
          { value: 'approved', label: 'Approved' },
          { value: 'paid', label: 'Paid' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />
      <ErrorBox message={error ?? action.error} />
      <div className="card table-card">
        <table>
          <thead>
            <tr><th>Affiliate</th><th>Lead</th><th>Tier</th><th>Deal</th><th>Amount</th><th>Status</th><th>Created</th><th /></tr>
          </thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.user?.name ?? '—'}</strong><div className="muted small">{c.user?.phone}</div></td>
                <td>{c.lead.leadName}<div className="muted small">{PRODUCT_LABEL[c.lead.productType]}</div></td>
                <td>{c.tier === 1 ? 'Direct' : `Level ${c.tier}`}</td>
                <td>{c.lead.dealAmountPaise != null ? money(c.lead.dealAmountPaise) : '—'}</td>
                <td><strong>{money(c.amountPaise)}</strong></td>
                <td><Badge label={c.status} tone={tone.commission[c.status]} /></td>
                <td className="small">{dateTime(c.createdAt)}</td>
                <td className="actions">
                  {c.status === 'pending' && (
                    <>
                      <button className="btn btn-primary" disabled={action.busy} onClick={() => act(c, 'approve')}>Approve</button>
                      <button className="btn btn-ghost danger" disabled={action.busy} onClick={() => act(c, 'reject')}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {data?.items.length === 0 && <tr><td colSpan={8} className="empty">No commissions here.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
