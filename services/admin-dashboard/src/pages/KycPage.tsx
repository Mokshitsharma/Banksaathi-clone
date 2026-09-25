import { useState } from 'react';
import type { KycState, KycStatus, Paginated, User } from '@refera/shared-types';
import { api } from '../api';
import { Badge, ErrorBox, PageHeader, Pager, Tabs, useAction, useLoad } from '../components';
import { dateTime, tone } from '../format';

type QueueItem = User & {
  kycRecord: { aadhaarVerified: boolean; panVerified: boolean; bankVerified: boolean; panMasked: string | null; bankAccountMasked: string | null; bankIfsc: string | null; nameAsPerKyc: string | null; updatedAt: string } | null;
  _count: { kycDocuments: number };
};

const Check = ({ ok }: { ok?: boolean }) => <span className={ok ? 'check ok' : 'check'}>{ok ? '✓' : '—'}</span>;

export function KycPage() {
  const [status, setStatus] = useState<KycStatus>('pending');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, reload } = useLoad(() => api<Paginated<QueueItem>>('/admin/kyc', { query: { status, page } }), [status, page]);

  return (
    <>
      <PageHeader title="KYC review" />
      <Tabs<KycStatus>
        value={status}
        onChange={(v) => { setStatus(v); setPage(1); }}
        options={[
          { value: 'pending', label: 'Awaiting review' },
          { value: 'unverified', label: 'In progress' },
          { value: 'verified', label: 'Verified' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />
      <ErrorBox message={error} />
      <div className="card table-card">
        <table>
          <thead>
            <tr><th>Affiliate</th><th>Aadhaar</th><th>PAN</th><th>Bank</th><th>Docs</th><th>Updated</th><th /></tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name ?? '—'}</strong><div className="muted small">{u.phone}</div></td>
                <td><Check ok={u.kycRecord?.aadhaarVerified} /></td>
                <td><Check ok={u.kycRecord?.panVerified} /> <span className="small">{u.kycRecord?.panMasked}</span></td>
                <td><Check ok={u.kycRecord?.bankVerified} /> <span className="small">{u.kycRecord?.bankAccountMasked}</span></td>
                <td>{u._count.kycDocuments}</td>
                <td className="small">{u.kycRecord ? dateTime(u.kycRecord.updatedAt) : '—'}</td>
                <td className="actions"><button className="btn btn-secondary" onClick={() => setSelected(u.id)}>Review</button></td>
              </tr>
            ))}
            {data?.items.length === 0 && <tr><td colSpan={7} className="empty">Nothing in this queue.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      {selected && <KycDetail userId={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); void reload(); }} />}
    </>
  );
}

function KycDetail({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged: () => void }) {
  const { data, error } = useLoad(() => api<{ user: User; kyc: KycState & { nameAsPerKyc: string | null } }>(`/admin/kyc/${userId}`), [userId]);
  const action = useAction();
  const [reason, setReason] = useState('');

  const approve = async () => { if (await action.run(() => api(`/admin/kyc/${userId}/approve`, { method: 'POST' }))) onChanged(); };
  const reject = async () => {
    if (reason.trim().length < 3) return action.setError('Enter a rejection reason');
    if (await action.run(() => api(`/admin/kyc/${userId}/reject`, { method: 'POST', body: { reason } }))) onChanged();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <ErrorBox message={error ?? action.error} />
        {data && (
          <>
            <div className="page-header">
              <h2>{data.user.name ?? data.user.phone}</h2>
              <Badge label={data.kyc.kycStatus} tone={tone.kyc[data.kyc.kycStatus]} />
            </div>
            <dl className="dl">
              <dt>Phone</dt><dd>{data.user.phone}</dd>
              <dt>Name as per Aadhaar</dt><dd>{data.kyc.nameAsPerKyc ?? '—'}</dd>
              <dt>Aadhaar eKYC</dt><dd><Check ok={data.kyc.aadhaarVerified} /></dd>
              <dt>PAN</dt><dd><Check ok={data.kyc.panVerified} /> {data.kyc.panMasked}</dd>
              <dt>Bank</dt><dd><Check ok={data.kyc.bankVerified} /> {data.kyc.bankAccountMasked} · {data.kyc.bankIfsc}</dd>
              {data.kyc.rejectionReason && (<><dt>Last rejection</dt><dd>{data.kyc.rejectionReason}</dd></>)}
            </dl>
            <h3>Documents</h3>
            {data.kyc.documents.length === 0 && <p className="muted">No documents uploaded.</p>}
            <ul className="doc-list">
              {data.kyc.documents.map((d) => (
                <li key={d.id}>
                  <a href={d.url} target="_blank" rel="noreferrer">{d.fileName}</a> <span className="muted small">({d.type.replace('_', ' ')}, {dateTime(d.createdAt)})</span>
                </li>
              ))}
            </ul>
            {data.kyc.kycStatus === 'pending' && (
              <>
                <label>
                  Rejection reason (if rejecting)
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. PAN name does not match Aadhaar" />
                </label>
                <div className="row-end">
                  <button className="btn btn-ghost" onClick={onClose}>Close</button>
                  <button className="btn btn-danger" disabled={action.busy} onClick={reject}>Reject</button>
                  <button className="btn btn-primary" disabled={action.busy} onClick={approve}>Approve KYC</button>
                </div>
              </>
            )}
            {data.kyc.kycStatus !== 'pending' && (
              <div className="row-end"><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
