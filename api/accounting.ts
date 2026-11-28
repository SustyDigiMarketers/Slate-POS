export interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
  body?: any;
}

export interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: any) => VercelResponse;
  setHeader: (name: string, value: string | string[]) => VercelResponse;
  end: () => void;
}

import { authenticateSupabaseRequest, getServerSupabase } from '../src/lib/subscriptionServer';
import { hasAnyPermission, hasPermission, type GranularPermission } from '../src/lib/permissions';

const ACTION_PERMISSION_MAP: Record<string, GranularPermission> = {
  POST_JOURNAL: 'JOURNAL_MANAGE',
  REVERSE_JOURNAL: 'JOURNAL_MANAGE',
  CREATE_JOURNAL: 'JOURNAL_MANAGE',
  UPSERT_COA: 'COA_MANAGE',
  DELETE_COA: 'COA_MANAGE',
  TOGGLE_PERIOD_LOCK: 'FISCAL_MANAGE',
  UPSERT_BUDGET: 'BUDGETS_MANAGE',
  REVISE_BUDGET: 'BUDGETS_MANAGE',
  APPROVE_BUDGET: 'BUDGETS_APPROVE',
  SAVE_RECONCILIATION: 'BANKING_RECONCILE',
  RECORD_BULK_BATCH: 'BULK_UPDATES_MANAGE',
  CREATE_DEBIT_NOTE: 'DEBIT_NOTES_MANAGE',
  APPROVE_DEBIT_NOTE: 'DEBIT_NOTES_MANAGE',
  CANCEL_DEBIT_NOTE: 'DEBIT_NOTES_MANAGE',
};

export function isSchemaMissingError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err.details || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42703' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the')
  );
}

export function mapPgErrorResponse(err: any, fallbackMessage: string): { status: number; error: string; message: string } {
  const code = String(err?.code || '');
  const msg = String(err?.message || fallbackMessage);
  if (isSchemaMissingError(err)) {
    return { status: 503, error: 'Schema Migration Pending', message: msg };
  }
  if (code === '42501' || msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('permission denied')) {
    return { status: 403, error: 'Forbidden', message: msg };
  }
  if (code === '23505') {
    return { status: 409, error: 'Duplicate Entry', message: msg };
  }
  if (code === '23503' || code === '23502' || code === '23514' || code === '22P02') {
    return { status: 400, error: 'Validation Error', message: msg };
  }
  return { status: 500, error: 'Accounting Error', message: msg };
}

async function safeSelectQuery(
  promise: PromiseLike<{ data: any; error: any }>,
  label: string,
  warnings: string[]
): Promise<any[]> {
  try {
    const res = await promise;
    if (res?.error) {
      if (isSchemaMissingError(res.error)) {
        warnings.push(`${label}: table or relationship unavailable (${res.error.code || res.error.message})`);
      } else {
        warnings.push(`${label}: ${res.error.message}`);
      }
      return [];
    }
    return Array.isArray(res?.data) ? res.data : [];
  } catch (err: any) {
    warnings.push(`${label}: ${err?.message || 'query error'}`);
    return [];
  }
}

async function validateTenantBranch(
  supabase: any,
  orgId: string,
  branchId: string | null | undefined
): Promise<boolean> {
  if (!branchId || branchId === 'ALL' || branchId === 'main-branch') return true;
  const { data } = await supabase
    .from('stores')
    .select('id, is_active')
    .eq('id', branchId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return Boolean(data && data.is_active !== false);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers['origin'] as string | undefined) || '';
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.endsWith('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  const auth = await authenticateSupabaseRequest(authHeader);
  if (!auth.authenticated || !auth.organizationId || !auth.role) {
    return res.status(auth.statusCode || 401).json({
      error: auth.statusCode === 503 ? 'Service Unavailable' : auth.statusCode === 403 ? 'Forbidden' : 'Unauthorized',
      message: auth.error || 'Authentication required for accounting APIs.',
    });
  }

  if (
    !hasAnyPermission(auth.role, [
      'COA_MANAGE',
      'JOURNAL_MANAGE',
      'BUDGETS_MANAGE',
      'REPORTS_FINANCIAL_VIEW',
      'AUDIT_VIEW',
      'BANKING_RECONCILE',
      'BULK_UPDATES_MANAGE',
      'DEBIT_NOTES_MANAGE',
      'FISCAL_MANAGE',
      'TRANSACTIONS_VIEW',
    ])
  ) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `Role ${auth.role} is unauthorized to access accounting endpoints.`,
    });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return res.status(503).json({
      error: 'Database Unavailable',
      message: 'Supabase service client is not configured on the server.',
    });
  }

  const orgId = auth.organizationId;
  const actorId = auth.profile?.id || auth.user?.id || 'system';
  const actorName = auth.profile?.name || auth.user?.email || 'Accountant';

  if (req.method === 'GET') {
    const resourceRaw = req.query?.resource;
    const resource = (Array.isArray(resourceRaw) ? resourceRaw[0] : resourceRaw) || 'snapshot';
    const warnings: string[] = [];

    try {
      if (resource === 'coa') {
        if (!hasAnyPermission(auth.role, ['COA_MANAGE', 'JOURNAL_MANAGE', 'REPORTS_FINANCIAL_VIEW'])) {
          return res.status(403).json({ error: 'Forbidden', message: 'Missing Chart of Accounts permission.' });
        }
        const data = await safeSelectQuery(
          supabase.from('chart_of_accounts').select('*').eq('organization_id', orgId).order('code', { ascending: true }),
          'chart_of_accounts',
          warnings
        );
        return res.status(200).json({ status: 'success', data, warnings });
      }

      if (resource === 'journals') {
        if (!hasAnyPermission(auth.role, ['JOURNAL_MANAGE', 'REPORTS_FINANCIAL_VIEW', 'TRANSACTIONS_VIEW'])) {
          return res.status(403).json({ error: 'Forbidden', message: 'Missing Journal view permission.' });
        }
        const data = await safeSelectQuery(
          supabase.from('journal_entries').select('*, journal_entry_lines(*)').eq('organization_id', orgId).order('entry_date', { ascending: false }).limit(200),
          'journal_entries',
          warnings
        );
        return res.status(200).json({ status: 'success', data, warnings });
      }

      if (resource === 'gl') {
        if (!hasAnyPermission(auth.role, ['JOURNAL_MANAGE', 'REPORTS_FINANCIAL_VIEW', 'TRANSACTIONS_VIEW'])) {
          return res.status(403).json({ error: 'Forbidden', message: 'Missing General Ledger view permission.' });
        }
        const data = await safeSelectQuery(
          supabase.from('general_ledger').select('*').eq('organization_id', orgId).order('entry_date', { ascending: false }).limit(500),
          'general_ledger',
          warnings
        );
        return res.status(200).json({ status: 'success', data, warnings });
      }

      if (resource === 'debit_notes') {
        if (!hasPermission(auth.role, 'DEBIT_NOTES_MANAGE')) {
          return res.status(403).json({ error: 'Forbidden', message: 'Missing Debit Notes permission.' });
        }
        const data = await safeSelectQuery(
          supabase.from('debit_notes').select('*, debit_note_items(*)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(200),
          'debit_notes',
          warnings
        );
        return res.status(200).json({ status: 'success', data, warnings });
      }

      if (resource === 'bulk_batches') {
        if (!hasPermission(auth.role, 'BULK_UPDATES_MANAGE')) {
          return res.status(403).json({ error: 'Forbidden', message: 'Missing Bulk Updates permission.' });
        }
        const data = await safeSelectQuery(
          supabase.from('bulk_import_batches').select('*, bulk_import_errors(*)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100),
          'bulk_import_batches',
          warnings
        );
        return res.status(200).json({ status: 'success', data, warnings });
      }

      const canReadFinance = hasAnyPermission(auth.role, ['COA_MANAGE', 'JOURNAL_MANAGE', 'REPORTS_FINANCIAL_VIEW', 'TRANSACTIONS_VIEW']);
      const canReadBudgets = hasAnyPermission(auth.role, ['BUDGETS_MANAGE', 'REPORTS_FINANCIAL_VIEW']);
      const canReadRecon = hasPermission(auth.role, 'BANKING_RECONCILE');
      const canReadAudit = hasPermission(auth.role, 'AUDIT_VIEW');
      const canReadDebitNotes = hasPermission(auth.role, 'DEBIT_NOTES_MANAGE');
      const canReadBulk = hasPermission(auth.role, 'BULK_UPDATES_MANAGE');

      const [chartOfAccounts, accountingPeriods, journalEntries, generalLedger, budgets, bankReconciliations, financialAuditLogs, debitNotes, bulkImportBatches] =
        await Promise.all([
          canReadFinance
            ? safeSelectQuery(supabase.from('chart_of_accounts').select('*').eq('organization_id', orgId).order('code'), 'chart_of_accounts', warnings)
            : Promise.resolve([]),
          canReadFinance || hasPermission(auth.role, 'FISCAL_MANAGE')
            ? safeSelectQuery(supabase.from('accounting_periods').select('*').eq('organization_id', orgId).order('start_date'), 'accounting_periods', warnings)
            : Promise.resolve([]),
          canReadFinance
            ? safeSelectQuery(
                supabase.from('journal_entries').select('*, journal_entry_lines(*)').eq('organization_id', orgId).order('entry_date', { ascending: false }).limit(200),
                'journal_entries',
                warnings
              )
            : Promise.resolve([]),
          canReadFinance
            ? safeSelectQuery(
                supabase.from('general_ledger').select('*').eq('organization_id', orgId).order('entry_date', { ascending: false }).limit(500),
                'general_ledger',
                warnings
              )
            : Promise.resolve([]),
          canReadBudgets
            ? safeSelectQuery(
                supabase.from('budgets').select('*, budget_lines(*)').eq('organization_id', orgId).order('created_at', { ascending: false }),
                'budgets',
                warnings
              )
            : Promise.resolve([]),
          canReadRecon
            ? safeSelectQuery(
                supabase.from('bank_reconciliations').select('*').eq('organization_id', orgId).order('statement_date', { ascending: false }).limit(50),
                'bank_reconciliations',
                warnings
              )
            : Promise.resolve([]),
          canReadAudit
            ? safeSelectQuery(
                supabase.from('financial_audit_logs').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(150),
                'financial_audit_logs',
                warnings
              )
            : Promise.resolve([]),
          canReadDebitNotes
            ? safeSelectQuery(
                supabase.from('debit_notes').select('*, debit_note_items(*)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(200),
                'debit_notes',
                warnings
              )
            : Promise.resolve([]),
          canReadBulk
            ? safeSelectQuery(
                supabase.from('bulk_import_batches').select('*, bulk_import_errors(*)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100),
                'bulk_import_batches',
                warnings
              )
            : Promise.resolve([]),
        ]);

      return res.status(200).json({
        status: 'success',
        data: {
          chartOfAccounts,
          accountingPeriods,
          journalEntries,
          generalLedger,
          budgets,
          bankReconciliations,
          financialAuditLogs,
          debitNotes,
          bulkImportBatches,
        },
        warnings,
      });
    } catch (err: any) {
      const mapped = mapPgErrorResponse(err, 'Unable to load accounting snapshot.');
      return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
    }
  }

  if (req.method === 'POST') {
    const { action, payload } = req.body || {};

    if (!action || typeof action !== 'string') {
      return res.status(400).json({ error: 'Validation Error', message: 'Action is required.' });
    }

    if (action === 'AUDIT_LOG') {
      if (!hasAnyPermission(auth.role, ['AUDIT_VIEW', 'JOURNAL_MANAGE', 'COA_MANAGE', 'BUDGETS_MANAGE', 'DEBIT_NOTES_MANAGE', 'BANKING_RECONCILE', 'BULK_UPDATES_MANAGE', 'FISCAL_MANAGE'])) {
        return res.status(403).json({ error: 'Forbidden', message: `Role ${auth.role} cannot write financial audit logs.` });
      }
    } else if (ACTION_PERMISSION_MAP[action]) {
      if (!hasPermission(auth.role, ACTION_PERMISSION_MAP[action])) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Role ${auth.role} lacks required permission (${ACTION_PERMISSION_MAP[action]}) for ${action}.`,
        });
      }
    } else {
      return res.status(400).json({ error: 'Unsupported Action', message: `Unknown accounting action: ${action}` });
    }

    if (payload?.branchId && payload.branchId !== 'ALL' && payload.branchId !== 'main-branch') {
      const validBranch = await validateTenantBranch(supabase, orgId, payload.branchId);
      if (!validBranch) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `Branch ${payload.branchId} does not belong to organization ${orgId} or is inactive.`,
        });
      }
    }

    const safeBranchOrNull = (raw: string | null | undefined) =>
      raw && raw !== 'ALL' && raw !== 'main-branch' ? raw : null;

    try {
      if (action === 'POST_JOURNAL') {
        const journalId = payload?.journalId;
        if (!journalId) {
          return res.status(400).json({ error: 'Validation Error', message: 'journalId is required.' });
        }

        const { data: existing, error: checkErr } = await supabase
          .from('journal_entries')
          .select('id, organization_id')
          .eq('id', journalId)
          .eq('organization_id', orgId)
          .maybeSingle();

        if (checkErr) {
          const mapped = mapPgErrorResponse(checkErr, 'Failed to verify journal entry.');
          return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
        }
        if (!existing) {
          return res.status(404).json({ error: 'Not Found', message: 'Journal entry not found for this organization.' });
        }

        const { data, error } = await supabase.rpc('post_journal_entry_atomic', {
          p_journal_id: journalId,
          p_actor_id: actorId,
        });
        if (error) {
          return res.status(400).json({ error: 'Posting Rejected', message: error.message });
        }
        return res.status(200).json({ status: 'success', data });
      }

      if (action === 'REVERSE_JOURNAL') {
        const journalId = payload?.journalId;
        const reason = payload?.reason || 'Reversal posted via API';
        if (!journalId) {
          return res.status(400).json({ error: 'Validation Error', message: 'journalId is required.' });
        }

        const { data: existing, error: checkErr } = await supabase
          .from('journal_entries')
          .select('id, organization_id')
          .eq('id', journalId)
          .eq('organization_id', orgId)
          .maybeSingle();

        if (checkErr) {
          const mapped = mapPgErrorResponse(checkErr, 'Failed to verify journal entry.');
          return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
        }
        if (!existing) {
          return res.status(404).json({ error: 'Not Found', message: 'Journal entry not found for this organization.' });
        }

        const { data, error } = await supabase.rpc('reverse_journal_entry_atomic', {
          p_journal_id: journalId,
          p_reason: reason,
          p_actor_id: actorId,
        });
        if (error) {
          return res.status(400).json({ error: 'Reversal Rejected', message: error.message });
        }
        return res.status(200).json({ status: 'success', data });
      }

      if (action === 'UPSERT_COA') {
        const acct = payload;
        if (!acct?.id || !acct?.code || !acct?.name || !acct?.accountClass) {
          return res.status(400).json({ error: 'Validation Error', message: 'Missing required Chart of Accounts fields.' });
        }
        const { data, error } = await supabase
          .from('chart_of_accounts')
          .upsert({
            id: acct.id,
            organization_id: orgId,
            branch_id: acct.branchId || 'ALL',
            code: acct.code,
            name: acct.name,
            account_class: acct.accountClass,
            account_group: acct.accountGroup || 'General',
            parent_account_id: acct.parentAccountId || null,
            parent_code: acct.parentCode || null,
            normal_balance: acct.normalBalance || (acct.accountClass === 'ASSET' || acct.accountClass === 'EXPENSE' ? 'DEBIT' : 'CREDIT'),
            opening_balance: Number(acct.openingBalance || 0),
            current_balance: Number(acct.currentBalance || 0),
            tax_applicable: Boolean(acct.taxApplicable),
            gst_tag: acct.gstTag && acct.gstTag !== 'NONE' ? acct.gstTag : null,
            is_system: Boolean(acct.isSystem),
            is_active: acct.isActive !== false,
            description: acct.description || null,
            updated_at: new Date().toISOString(),
          })
          .select('*')
          .single();

        if (error) throw error;
        return res.status(200).json({ status: 'success', data });
      }

      if (action === 'DELETE_COA') {
        const accountId = payload?.accountId;
        if (!accountId) {
          return res.status(400).json({ error: 'Validation Error', message: 'accountId is required.' });
        }
        const { data: acct, error: fetchErr } = await supabase
          .from('chart_of_accounts')
          .select('id, is_system')
          .eq('id', accountId)
          .eq('organization_id', orgId)
          .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!acct) {
          return res.status(404).json({ error: 'Not Found', message: 'Ledger account not found for this organization.' });
        }
        if (acct.is_system) {
          return res.status(400).json({ error: 'Protected Account', message: 'System control accounts cannot be deleted.' });
        }

        const { count: glCount } = await supabase
          .from('general_ledger')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('account_id', accountId);

        if ((glCount || 0) > 0) {
          return res.status(409).json({
            error: 'Account In Use',
            message: 'Cannot delete ledger account with posted general ledger entries.',
          });
        }

        const { error: delErr } = await supabase
          .from('chart_of_accounts')
          .delete()
          .eq('id', accountId)
          .eq('organization_id', orgId);

        if (delErr) throw delErr;
        return res.status(200).json({ status: 'success', data: { deletedId: accountId } });
      }

      if (action === 'CREATE_JOURNAL') {
        const je = payload;
        if (!je?.id || !je?.journalNumber || !Array.isArray(je?.lines) || je.lines.length < 2) {
          return res.status(400).json({ error: 'Validation Error', message: 'Journal entry requires id, journalNumber, and at least 2 lines.' });
        }
        const totalDebit = Math.round(je.lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0) * 100) / 100;
        const totalCredit = Math.round(je.lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0) * 100) / 100;
        if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.009) {
          return res.status(400).json({
            error: 'Unbalanced Journal',
            message: `Debits (${totalDebit}) must equal Credits (${totalCredit}) and be greater than zero.`,
          });
        }

        const safeBranchId = safeBranchOrNull(je.branchId) || safeBranchOrNull(auth.profile?.branch_id);

        const { error: jeErr } = await supabase.from('journal_entries').upsert({
          id: je.id,
          organization_id: orgId,
          branch_id: safeBranchId,
          journal_number: je.journalNumber,
          entry_date: je.entryDate || new Date().toISOString().slice(0, 10),
          reference_number: je.referenceNumber || null,
          narration: je.narration || 'Manual Journal Entry',
          status: 'DRAFT',
          source_type: je.sourceType || 'MANUAL_JOURNAL',
          source_id: je.sourceId || null,
          idempotency_key: je.idempotencyKey || null,
          total_debit: totalDebit,
          total_credit: totalCredit,
          created_by: actorId,
          created_by_name: actorName,
          updated_at: new Date().toISOString(),
        });
        if (jeErr) throw jeErr;

        await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', je.id);
        const lineRows = je.lines.map((l: any, idx: number) => ({
          id: l.id || `${je.id}_l${idx + 1}`,
          journal_entry_id: je.id,
          organization_id: orgId,
          account_id: l.accountId,
          account_code: l.accountCode,
          account_name: l.accountName,
          description: l.description || null,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          party_type: l.partyType || null,
          party_id: l.partyId || null,
          party_name: l.partyName || null,
          tax_code: l.taxCode || null,
          line_order: idx + 1,
        }));
        const { error: lineErr } = await supabase.from('journal_entry_lines').insert(lineRows);
        if (lineErr) throw lineErr;

        if (je.postImmediately) {
          const { data: posted, error: postErr } = await supabase.rpc('post_journal_entry_atomic', {
            p_journal_id: je.id,
            p_actor_id: actorId,
          });
          if (postErr) {
            return res.status(400).json({ error: 'Posting Rejected', message: postErr.message });
          }
          return res.status(201).json({ status: 'success', data: posted });
        }

        return res.status(201).json({ status: 'success', data: { journalId: je.id, status: 'DRAFT' } });
      }

      if (action === 'TOGGLE_PERIOD_LOCK') {
        const { periodId, fiscalYear, name, startDate, endDate, lock } = payload || {};
        if (!periodId) {
          return res.status(400).json({ error: 'Validation Error', message: 'periodId is required.' });
        }
        const now = new Date().toISOString();
        const isLocked = Boolean(lock);

        if (fiscalYear && name && startDate && endDate) {
          const { data, error } = await supabase
            .from('accounting_periods')
            .upsert({
              id: periodId,
              organization_id: orgId,
              fiscal_year: fiscalYear,
              name,
              start_date: startDate,
              end_date: endDate,
              is_locked: isLocked,
              status: isLocked ? 'LOCKED' : 'OPEN',
              locked_by: isLocked ? actorId : null,
              locked_at: isLocked ? now : null,
              updated_at: now,
            })
            .select('*')
            .single();
          if (error) throw error;
          return res.status(200).json({ status: 'success', data });
        }

        const { data, error } = await supabase
          .from('accounting_periods')
          .update({
            is_locked: isLocked,
            status: isLocked ? 'LOCKED' : 'OPEN',
            locked_by: isLocked ? actorId : null,
            locked_at: isLocked ? now : null,
            updated_at: now,
          })
          .eq('id', periodId)
          .eq('organization_id', orgId)
          .select('*')
          .maybeSingle();

        if (error) throw error;
        return res.status(200).json({ status: 'success', data });
      }

      if (action === 'UPSERT_BUDGET' || action === 'REVISE_BUDGET') {
        const b = payload;
        if (!b?.id || !b?.name || !b?.fiscalYear || !b?.startDate || !b?.endDate) {
          return res.status(400).json({ error: 'Validation Error', message: 'Budget id, name, fiscalYear, startDate, and endDate are required.' });
        }
        const now = new Date().toISOString();
        const { data: savedBudget, error: bErr } = await supabase
          .from('budgets')
          .upsert({
            id: b.id,
            organization_id: orgId,
            branch_id: b.branchId || 'ALL',
            name: b.name,
            fiscal_year: b.fiscalYear,
            period_type: b.periodType || 'ANNUAL',
            start_date: b.startDate,
            end_date: b.endDate,
            status: action === 'REVISE_BUDGET' ? 'REVISED' : (b.status || 'DRAFT'),
            version: Array.isArray(b.revisions) ? b.revisions.length + 1 : 1,
            total_planned_revenue: Number(b.totalPlannedRevenue || 0),
            total_planned_expense: Number(b.totalPlannedExpense || 0),
            total_planned_capex: Number(b.totalPlannedCapex || 0),
            revisions: Array.isArray(b.revisions) ? b.revisions : [],
            created_by: b.createdBy || actorId,
            created_by_name: actorName,
            approved_by: b.approvedBy || null,
            approved_at: b.approvedAt || null,
            updated_at: now,
          })
          .select('*')
          .single();
        if (bErr) throw bErr;

        await supabase.from('budget_lines').delete().eq('budget_id', b.id).eq('organization_id', orgId);
        if (Array.isArray(b.lines) && b.lines.length > 0) {
          const rows = b.lines.map((l: any, idx: number) => ({
            id: l.id || `${b.id}_bl_${idx + 1}`,
            budget_id: b.id,
            organization_id: orgId,
            account_id: l.accountId,
            account_code: l.accountCode,
            account_name: l.accountName,
            account_class: l.accountClass,
            category: l.category || 'EXPENSE',
            period_label: b.periodType || 'ANNUAL',
            planned_amount: Number(l.plannedAmount || 0),
            notes: l.notes || null,
          }));
          const { error: blErr } = await supabase.from('budget_lines').insert(rows);
          if (blErr) throw blErr;
        }

        return res.status(200).json({ status: 'success', data: savedBudget });
      }

      if (action === 'APPROVE_BUDGET') {
        const budgetId = payload?.budgetId;
        if (!budgetId) {
          return res.status(400).json({ error: 'Validation Error', message: 'budgetId is required.' });
        }
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('budgets')
          .update({
            status: 'APPROVED',
            approved_by: actorId,
            approved_by_name: actorName,
            approved_at: now,
            updated_at: now,
          })
          .eq('id', budgetId)
          .eq('organization_id', orgId)
          .select('*')
          .maybeSingle();

        if (error) throw error;
        return res.status(200).json({ status: 'success', data });
      }

      if (action === 'SAVE_RECONCILIATION') {
        const r = payload;
        if (!r?.id || !r?.bankAccountId || !r?.statementDate) {
          return res.status(400).json({ error: 'Validation Error', message: 'Reconciliation id, bankAccountId, and statementDate are required.' });
        }
        const { data, error } = await supabase
          .from('bank_reconciliations')
          .upsert({
            id: r.id,
            organization_id: orgId,
            branch_id: safeBranchOrNull(r.branchId),
            bank_account_id: r.bankAccountId,
            bank_account_name: r.bankAccountName || 'Bank Account',
            statement_date: r.statementDate,
            statement_closing_balance: Number(r.statementClosingBalance || 0),
            book_closing_balance: Number(r.bookBalance ?? r.bookClosingBalance ?? 0),
            cleared_balance: Number(r.clearedBalance || 0),
            difference: Number(r.variance ?? r.difference ?? 0),
            matched_transaction_ids: Array.isArray(r.clearedTransactionIds) ? r.clearedTransactionIds : [],
            adjustment_journal_id: r.adjustmentJournalId || null,
            status: r.status || 'RECONCILED',
            notes: r.notes || null,
            reconciled_by: actorId,
            reconciled_by_name: actorName,
          })
          .select('*')
          .single();

        if (error) throw error;
        return res.status(200).json({ status: 'success', data });
      }

      if (action === 'RECORD_BULK_BATCH') {
        const b = payload;
        if (!b?.id || !b?.entityType || !b?.fileName) {
          return res.status(400).json({ error: 'Validation Error', message: 'Batch id, entityType, and fileName are required.' });
        }
        const { data: savedBatch, error: batchErr } = await supabase
          .from('bulk_import_batches')
          .upsert({
            id: b.id,
            organization_id: orgId,
            branch_id: safeBranchOrNull(b.branchId),
            target: b.entityType,
            file_name: b.fileName,
            total_rows: Number(b.totalRows || 0),
            valid_rows: Number(b.validRows || 0),
            error_rows: Number(b.errorCount || 0),
            imported_rows: Number(b.importedRows || 0),
            updated_rows: Number(b.updatedRows || 0),
            skipped_duplicates: Number(b.skippedDuplicates || 0),
            status: b.status || 'COMMITTED',
            requires_approval: Boolean(b.requiresApproval),
            journal_entry_id: b.journalEntryId || null,
            created_by: actorId,
            created_by_name: actorName,
            approved_by: b.approvedBy || null,
            completed_at: new Date().toISOString(),
          })
          .select('*')
          .single();
        if (batchErr) throw batchErr;

        if (Array.isArray(b.errors) && b.errors.length > 0) {
          await supabase.from('bulk_import_errors').delete().eq('batch_id', b.id).eq('organization_id', orgId);
          const errorRows = b.errors.slice(0, 200).map((errItem: any, idx: number) => ({
            id: `${b.id}_err_${idx + 1}`,
            batch_id: b.id,
            organization_id: orgId,
            row_number: Number(errItem.rowNumber || 0),
            field: errItem.field || 'unknown',
            message: errItem.message || 'Validation error',
            raw_value: errItem.rawValue || null,
          }));
          await supabase.from('bulk_import_errors').insert(errorRows);
        }

        return res.status(201).json({ status: 'success', data: savedBatch });
      }

      if (action === 'CREATE_DEBIT_NOTE') {
        const dn = payload;
        if (!dn?.id || !dn?.debitNoteNumber || !dn?.supplierId || !dn?.supplierName) {
          return res.status(400).json({ error: 'Validation Error', message: 'Debit note id, debitNoteNumber, supplierId, and supplierName are required.' });
        }
        const cgst = Number(dn.cgstTotal || 0);
        const sgst = Number(dn.sgstTotal || 0);
        const igst = Number(dn.igstTotal || 0);
        const { data: savedDn, error: dnErr } = await supabase
          .from('debit_notes')
          .upsert({
            id: dn.id,
            debit_note_number: dn.debitNoteNumber,
            organization_id: orgId,
            branch_id: safeBranchOrNull(dn.branchId),
            supplier_id: dn.supplierId,
            supplier_name: dn.supplierName,
            supplier_gstin: dn.supplierGstin || null,
            supplier_bill_id: dn.supplierBillId || null,
            bill_number: dn.billNumber || null,
            subtotal: Number(dn.taxableTotal || 0),
            taxable_total: Number(dn.taxableTotal || 0),
            cgst_total: cgst,
            sgst_total: sgst,
            igst_total: igst,
            gst_total: cgst + sgst + igst,
            total_debit_amount: Number(dn.totalAmount || 0),
            reason: dn.reason || 'Purchase Return',
            notes: dn.notes || null,
            status: dn.status || 'ISSUED',
            reduce_inventory: Boolean(dn.deductInventory),
            issue_date: dn.issueDate || new Date().toISOString().slice(0, 10),
            journal_entry_id: dn.journalEntryId || null,
            journal_number: dn.journalNumber || null,
            created_by: actorId,
            created_by_name: actorName,
            approved_by: dn.approvedBy || null,
            approved_by_name: dn.approvedByName || null,
            approved_at: dn.approvedAt || null,
            cancelled_by: dn.cancelledBy || null,
            cancelled_at: dn.cancelledAt || null,
            cancel_reason: dn.cancelReason || null,
            updated_at: new Date().toISOString(),
          })
          .select('*')
          .single();
        if (dnErr) throw dnErr;

        if (Array.isArray(dn.items) && dn.items.length > 0) {
          await supabase.from('debit_note_items').delete().eq('debit_note_id', dn.id).eq('organization_id', orgId);
          const itemRows = dn.items.map((item: any, idx: number) => ({
            id: item.id || `${dn.id}_dni_${idx + 1}`,
            debit_note_id: dn.id,
            organization_id: orgId,
            product_id: item.productId,
            product_name: item.productName,
            sku: item.sku || null,
            hsn: item.hsn || null,
            quantity: Number(item.quantity || 1),
            unit_price: Number(item.unitPrice || 0),
            taxable_amount: Number(item.taxableAmount || 0),
            tax_rate: Number(item.gstRate || 0),
            cgst_amount: Number(item.cgstAmount || 0),
            sgst_amount: Number(item.sgstAmount || 0),
            igst_amount: Number(item.igstAmount || 0),
            tax_amount: Number(item.cgstAmount || 0) + Number(item.sgstAmount || 0) + Number(item.igstAmount || 0),
            total: Number(item.total || 0),
          }));
          const { error: itemErr } = await supabase.from('debit_note_items').insert(itemRows);
          if (itemErr) throw itemErr;
        }

        return res.status(201).json({ status: 'success', data: savedDn });
      }

      if (action === 'APPROVE_DEBIT_NOTE') {
        const debitNoteId = payload?.debitNoteId;
        if (!debitNoteId) {
          return res.status(400).json({ error: 'Validation Error', message: 'debitNoteId is required.' });
        }
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('debit_notes')
          .update({
            status: 'APPROVED',
            approved_by: actorId,
            approved_by_name: actorName,
            approved_at: now,
            updated_at: now,
          })
          .eq('id', debitNoteId)
          .eq('organization_id', orgId)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ status: 'success', data });
      }

      if (action === 'CANCEL_DEBIT_NOTE') {
        const debitNoteId = payload?.debitNoteId;
        const reason = payload?.reason || 'Cancelled';
        if (!debitNoteId) {
          return res.status(400).json({ error: 'Validation Error', message: 'debitNoteId is required.' });
        }
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('debit_notes')
          .update({
            status: 'CANCELLED',
            cancelled_by: actorId,
            cancelled_at: now,
            cancel_reason: reason,
            updated_at: now,
          })
          .eq('id', debitNoteId)
          .eq('organization_id', orgId)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ status: 'success', data });
      }

      if (action === 'AUDIT_LOG') {
        const entry = payload;
        if (!entry?.entityType || !entry?.entityId || !entry?.action || !entry?.summary) {
          return res.status(400).json({ error: 'Validation Error', message: 'entityType, entityId, action, and summary are required.' });
        }
        const { data, error } = await supabase
          .from('financial_audit_logs')
          .insert({
            id: entry.id || `fal_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
            organization_id: orgId,
            branch_id: safeBranchOrNull(entry.branchId) || safeBranchOrNull(auth.profile?.branch_id),
            entity_type: entry.entityType,
            entity_id: entry.entityId,
            action: entry.action,
            actor_id: actorId,
            actor_name: actorName,
            actor_role: auth.role,
            summary: entry.summary,
            before_snapshot: entry.beforeSnapshot || null,
            after_snapshot: entry.afterSnapshot || null,
          })
          .select('*')
          .single();
        if (error) throw error;
        return res.status(201).json({ status: 'success', data });
      }

      return res.status(400).json({ error: 'Unsupported Action', message: `Unknown accounting action: ${action}` });
    } catch (err: any) {
      const mapped = mapPgErrorResponse(err, 'Failed to process accounting action.');
      return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
