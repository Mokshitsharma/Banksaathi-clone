import { useState } from 'react';
import type { KycStatus, Paginated, User } from '@refera/shared-types';
import { api } from '../api';
import { Badge, ErrorBox, PageHeader, Pager, useLoad } from '../components';
import { dateTime, tone } from '../format';

type Row = User & { referredBy: { id: string; name: string | null; phone: string } | null; _count: { leads: number; referrals: number } };

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [kycStatus, setKycStatus] = useState<KycStatus | ''>('');
  const [page, setPage] = useState(1);
  const { data, error } = useLoad(
    () => api<Paginated<Row>>('/admin/users', { query: { search, kycStatus: kycStatus || undefined, role: 'affiliate', page } }),
    [search, kycStatus, page],
  );

  return (
    <>
      <PageHeader title="Affiliates">
        <select value={kycStatus} onChange={(e) => { setKycStatus(e.target.value as KycStatus | ''); setPage(1); }}>
          <option value="">All KYC states</option>
          <option value="unverified">Unverified</option>
          <option value="pending">Pending review</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
        <input className="search" placeholder="Search name, phone, email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </PageHeader>
      <ErrorBox message={error} />
      <div className="card table-card">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Invited by</th><th>Leads</th><th>Team</th><th>KYC</th><th>Joined</th></tr></thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name ?? '—'}</strong><div className="muted small">{u.phone}</div></td>
                <td className="small">{u.email ?? '—'}</td>
                <td className="small">{u.referredBy ? u.referredBy.name ?? u.referredBy.phone : '—'}</td>
                <td>{u._count.leads}</td>
                <td>{u._count.referrals}</td>
                <td><Badge label={u.kycStatus} tone={tone.kyc[u.kycStatus]} /></td>
                <td className="small">{dateTime(u.createdAt)}</td>
              </tr>
            ))}
            {data?.items.length === 0 && <tr><td colSpan={7} className="empty">No affiliates found.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
