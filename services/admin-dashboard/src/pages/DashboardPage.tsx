import { Link } from 'react-router-dom';
import type { AdminAnalytics, LeadStatus } from '@refera/shared-types';
import { api } from '../api';
import { Badge, ErrorBox, PageHeader, useLoad } from '../components';
import { LEAD_STATUS_LABEL, money, tone } from '../format';

type Analytics = AdminAnalytics & { signupsByDay: { day: string; count: number }[] };

export function DashboardPage() {
  const { data, error } = useLoad(() => api<Analytics>('/admin/analytics'), []);
  const maxSignup = Math.max(1, ...(data?.signupsByDay.map((d) => d.count) ?? [1]));
  const totalLeads = data ? Object.values(data.leadsByStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHeader title="Overview" />
      <ErrorBox message={error} />
      <div className="stat-grid">
        <Stat label="Affiliates" value={data?.users.total} sub={`+${data?.users.last30Days ?? 0} in 30 days`} />
        <Stat label="KYC verified" value={data?.users.kycVerified} sub={<Link to="/kyc">{data?.kycPendingReview ?? 0} awaiting review</Link>} />
        <Stat label="Total leads" value={totalLeads} sub={`${data?.leadsByStatus.converted ?? 0} converted`} />
        <Stat label="Commissions pending" value={money(data?.commissions.pendingPaise)} sub={<Link to="/commissions">Review</Link>} />
        <Stat label="Commissions approved" value={money(data?.commissions.approvedPaise)} />
        <Stat label="Paid out" value={money(data?.commissions.paidOutPaise)} sub={<Link to="/payouts">{(data?.payouts.pendingCount ?? 0) + (data?.payouts.processingCount ?? 0)} payouts open</Link>} />
      </div>

      <div className="two-col">
        <section className="card">
          <h2>Leads by status</h2>
          {data &&
            (Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((s) => (
              <div key={s} className="bar-row">
                <Badge label={LEAD_STATUS_LABEL[s]} tone={tone.lead[s]} />
                <div className="bar-track">
                  <div className={`bar-fill fill-${tone.lead[s]}`} style={{ width: `${totalLeads ? (data.leadsByStatus[s] / totalLeads) * 100 : 0}%` }} />
                </div>
                <strong>{data.leadsByStatus[s]}</strong>
              </div>
            ))}
        </section>
        <section className="card">
          <h2>Signups (last 30 days)</h2>
          {data && data.signupsByDay.length === 0 && <p className="muted">No signups yet.</p>}
          <div className="spark">
            {data?.signupsByDay.map((d) => (
              <div key={d.day} className="spark-col" title={`${d.day}: ${d.count}`}>
                <div className="spark-bar" style={{ height: `${(d.count / maxSignup) * 100}%` }} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card stat">
      <div className="muted">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}
