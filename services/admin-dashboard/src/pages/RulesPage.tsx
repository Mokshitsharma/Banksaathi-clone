import { useState, type FormEvent } from 'react';
import type { CommissionRule, CommissionType, ProductType } from '@refera/shared-types';
import { api } from '../api';
import { Badge, ErrorBox, PageHeader, useAction, useLoad } from '../components';
import { money, PRODUCT_LABEL } from '../format';

const describe = (r: CommissionRule) => (r.commissionType === 'flat' ? money(r.value) : `${r.value / 100}% of deal`);

export function RulesPage() {
  const { data, error, reload } = useLoad(() => api<CommissionRule[]>('/admin/commission-rules'), []);
  const action = useAction();
  const [form, setForm] = useState({ productType: 'loan' as ProductType, commissionType: 'percent' as CommissionType, value: '', tier: '1' });

  async function create(e: FormEvent) {
    e.preventDefault();
    const ok = await action.run(() =>
      api('/admin/commission-rules', {
        method: 'POST',
        body: { productType: form.productType, commissionType: form.commissionType, value: Number(form.value), tier: Number(form.tier) },
      }),
    );
    if (ok) {
      setForm((f) => ({ ...f, value: '' }));
      void reload();
    }
  }

  async function toggle(r: CommissionRule) {
    if (await action.run(() => api(`/admin/commission-rules/${r.id}`, { method: 'PATCH', body: { active: !r.active } }))) void reload();
  }

  async function remove(r: CommissionRule) {
    if (!confirm('Delete this rule? Existing commissions are kept.')) return;
    if (await action.run(() => api(`/admin/commission-rules/${r.id}`, { method: 'DELETE' }))) void reload();
  }

  return (
    <>
      <PageHeader title="Commission rules" />
      <p className="muted">
        When a lead is marked converted, each active rule for its product pays out: tier 1 goes to the affiliate who referred the lead, tier 2 to
        the person who invited them, and so on. Changes apply to future conversions only.
      </p>
      <ErrorBox message={error ?? action.error} />
      <form className="card form-row" onSubmit={create}>
        <label>
          Product
          <select value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value as ProductType })}>
            {Object.entries(PRODUCT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Type
          <select value={form.commissionType} onChange={(e) => setForm({ ...form, commissionType: e.target.value as CommissionType })}>
            <option value="percent">% of deal</option>
            <option value="flat">Flat ₹</option>
          </select>
        </label>
        <label>
          {form.commissionType === 'flat' ? 'Amount (₹)' : 'Percent (%)'}
          <input type="number" min="0.01" step="0.01" required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
        </label>
        <label>
          Tier
          <input type="number" min="1" max="10" required value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} />
        </label>
        <button className="btn btn-primary" disabled={action.busy}>Add rule</button>
      </form>
      <div className="card table-card">
        <table>
          <thead><tr><th>Product</th><th>Tier</th><th>Payout</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'inactive'}>
                <td>{PRODUCT_LABEL[r.productType]}</td>
                <td>{r.tier === 1 ? 'Direct (1)' : `Upline ${r.tier}`}</td>
                <td><strong>{describe(r)}</strong></td>
                <td><Badge label={r.active ? 'Active' : 'Paused'} tone={r.active ? 'success' : 'neutral'} /></td>
                <td className="actions">
                  <button className="btn btn-secondary" disabled={action.busy} onClick={() => toggle(r)}>{r.active ? 'Pause' : 'Activate'}</button>
                  <button className="btn btn-ghost danger" disabled={action.busy} onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={5} className="empty">No rules yet — conversions won't pay commissions.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
