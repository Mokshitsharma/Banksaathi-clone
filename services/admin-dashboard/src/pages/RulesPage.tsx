import { useState, type FormEvent } from 'react';
import type { CommissionRule, CommissionType, ProductType } from '@refera/shared-types';
import { api } from '../api';
import { Badge, ErrorBox, PageHeader, useAction, useLoad } from '../components';
import { money, PRODUCT_LABEL } from '../format';

const describe = (r: CommissionRule) => (r.commissionType === 'flat' ? money(r.value) : `${r.value / 100}% of deal`);

interface RuleForm {
  productType: ProductType;
  commissionType: CommissionType;
  value: string;
  tier: string;
  title: string;
  description: string;
}

const EMPTY: RuleForm = { productType: 'loan', commissionType: 'percent', value: '', tier: '1', title: '', description: '' };

/** Both paise (flat) and basis points (percent) display as value / 100. */
const toForm = (r: CommissionRule): RuleForm => ({
  productType: r.productType,
  commissionType: r.commissionType,
  value: String(r.value / 100),
  tier: String(r.tier),
  title: r.title ?? '',
  description: r.description ?? '',
});

export function RulesPage() {
  const { data, error, reload } = useLoad(() => api<CommissionRule[]>('/admin/commission-rules'), []);
  const action = useAction();
  const [form, setForm] = useState<RuleForm>(EMPTY);
  const [editing, setEditing] = useState<CommissionRule | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    const ok = await action.run(() =>
      api('/admin/commission-rules', {
        method: 'POST',
        body: { ...form, value: Number(form.value), tier: Number(form.tier) },
      }),
    );
    if (ok) {
      setForm((f) => ({ ...EMPTY, productType: f.productType, commissionType: f.commissionType }));
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
      <PageHeader title="Commission rules & offers" />
      <p className="muted">
        When a lead is marked converted, each active rule for its product pays out: tier 1 goes to the affiliate who referred the lead, tier 2 to
        the person who invited them, and so on. Active rules appear as offers in the mobile app, using the title and description below.
        Changes to amounts apply to future conversions only.
      </p>
      <ErrorBox message={error ?? action.error} />
      <form className="card rule-form" onSubmit={create}>
        <h2>New rule</h2>
        <RuleFields form={form} onChange={setForm} />
        <div className="row-end">
          <button className="btn btn-primary" disabled={action.busy}>Add rule</button>
        </div>
      </form>
      <div className="card table-card">
        <table>
          <thead><tr><th>Offer</th><th>Product</th><th>Tier</th><th>Payout</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'inactive'}>
                <td>
                  {r.title ? <strong>{r.title}</strong> : <span className="muted">No title (the app shows a generated one)</span>}
                  {r.description && <div className="muted small clamp-2">{r.description}</div>}
                </td>
                <td>{PRODUCT_LABEL[r.productType]}</td>
                <td>{r.tier === 1 ? 'Direct (1)' : `Upline ${r.tier}`}</td>
                <td><strong>{describe(r)}</strong></td>
                <td><Badge label={r.active ? 'Active' : 'Paused'} tone={r.active ? 'success' : 'neutral'} /></td>
                <td className="actions">
                  <button className="btn btn-secondary" disabled={action.busy} onClick={() => setEditing(r)}>Edit</button>
                  <button className="btn btn-ghost" disabled={action.busy} onClick={() => toggle(r)}>{r.active ? 'Pause' : 'Activate'}</button>
                  <button className="btn btn-ghost danger" disabled={action.busy} onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={6} className="empty">No rules yet — conversions won't pay commissions.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <EditRuleDialog rule={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </>
  );
}

function RuleFields({ form, onChange, lockProduct }: { form: RuleForm; onChange: (f: RuleForm) => void; lockProduct?: boolean }) {
  const set = (patch: Partial<RuleForm>) => onChange({ ...form, ...patch });
  return (
    <>
      <div className="form-row">
        <label>
          Product
          <select value={form.productType} disabled={lockProduct} onChange={(e) => set({ productType: e.target.value as ProductType })}>
            {Object.entries(PRODUCT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Type
          <select value={form.commissionType} onChange={(e) => set({ commissionType: e.target.value as CommissionType })}>
            <option value="percent">% of deal</option>
            <option value="flat">Flat ₹</option>
          </select>
        </label>
        <label>
          {form.commissionType === 'flat' ? 'Amount (₹)' : 'Percent (%)'}
          <input type="number" min="0.01" step="0.01" max={form.commissionType === 'percent' ? 100 : undefined} required value={form.value} onChange={(e) => set({ value: e.target.value })} />
        </label>
        <label>
          Tier
          <input type="number" min="1" max="10" required value={form.tier} onChange={(e) => set({ tier: e.target.value })} />
        </label>
      </div>
      <label>
        Offer title <span className="muted small">(shown to affiliates)</span>
        <input maxLength={80} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Refer a credit card, earn ₹1,500" />
      </label>
      <label>
        Description <span className="muted small">({form.description.length}/500)</span>
        <textarea
          maxLength={500}
          rows={3}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="e.g. Earn a flat ₹1,500 for every friend who gets a credit card issued through your referral."
        />
      </label>
    </>
  );
}

function EditRuleDialog({ rule, onClose, onSaved }: { rule: CommissionRule; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<RuleForm>(() => toForm(rule));
  const action = useAction();

  async function save(e: FormEvent) {
    e.preventDefault();
    const ok = await action.run(() =>
      api(`/admin/commission-rules/${rule.id}`, {
        method: 'PATCH',
        body: {
          commissionType: form.commissionType,
          value: Number(form.value),
          tier: Number(form.tier),
          title: form.title,
          description: form.description,
        },
      }),
    );
    if (ok) onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal modal-wide" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>Edit {PRODUCT_LABEL[rule.productType].toLowerCase()} rule</h2>
        <ErrorBox message={action.error} />
        <RuleFields form={form} onChange={setForm} lockProduct />
        <div className="row-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={action.busy}>Save</button>
        </div>
      </form>
    </div>
  );
}
