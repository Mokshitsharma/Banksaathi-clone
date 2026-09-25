import type { LeadStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { notifyUser } from '../../providers/push';
import { createCommissionsForLead } from '../commissions/commission.engine';

/** Allowed pipeline moves: new → contacted → in_progress → converted | rejected. */
export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ['contacted', 'rejected'],
  contacted: ['in_progress', 'rejected'],
  in_progress: ['converted', 'rejected'],
  converted: [],
  rejected: [],
};

export function canTransition(from: LeadStatus, to: LeadStatus) {
  return LEAD_TRANSITIONS[from].includes(to);
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  in_progress: 'In progress',
  converted: 'Converted',
  rejected: 'Rejected',
};

export async function updateLeadStatus(
  leadId: string,
  input: { status: LeadStatus; dealAmountPaise?: number; notes?: string },
) {
  const result = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw notFound('Lead not found');
    if (!canTransition(lead.status, input.status)) {
      throw badRequest(`Cannot move a lead from "${lead.status}" to "${input.status}"`, {
        allowed: LEAD_TRANSITIONS[lead.status],
      });
    }
    // Guard against a concurrent update having already moved the lead.
    const { count } = await tx.lead.updateMany({
      where: { id: leadId, status: lead.status },
      data: {
        status: input.status,
        dealAmountPaise: input.dealAmountPaise ?? lead.dealAmountPaise,
        notes: input.notes ?? lead.notes,
      },
    });
    if (count === 0) throw badRequest('Lead was updated by someone else. Refresh and try again.');
    const updated = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
    const commissions = input.status === 'converted' ? await createCommissionsForLead(tx, updated) : [];
    return { lead: updated, commissions };
  });

  notifyUser(result.lead.referredByUserId, {
    title: `Lead ${STATUS_LABEL[result.lead.status].toLowerCase()}`,
    body: `${result.lead.leadName} is now "${STATUS_LABEL[result.lead.status]}".`,
    data: { type: 'lead_status', leadId: result.lead.id },
  });
  for (const c of result.commissions) {
    notifyUser(c.userId, {
      title: 'Commission earned',
      body: `₹${(c.amountPaise / 100).toFixed(2)} pending approval for ${result.lead.leadName}.`,
      data: { type: 'commission', commissionId: c.id },
    });
  }
  return result;
}
