const XLSX = require('xlsx');
const { audit, isReadOnlyImpersonation, parseJson, preflight, requireAdmin, response, sb } = require('./_shared');
const { COLUMN_ALIASES, processRows } = require('./import-utils');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10000;
const ALLOWED_TYPES = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

exports.handler = async (event) => {
  const pf = preflight(event, ['POST']);
  if (pf) return pf;
  const admin = await requireAdmin(event, 'admin.imports.manage');
  if (!admin) return response(403, { error: 'Data administrator access required' });
  try {
    if (await isReadOnlyImpersonation(event, admin)) return response(403, { error: 'Imports are disabled while viewing as another user' });
    const body = parseJson(event);
    if (!body?.file_base64 || !body?.filename) return response(400, { error: 'A CSV or XLSX file is required' });
    const extension = String(body.filename).toLowerCase().split('.').pop();
    if (!['csv', 'xlsx'].includes(extension) || (body.mime_type && !ALLOWED_TYPES.includes(body.mime_type))) return response(415, { error: 'Only CSV and XLSX files are supported' });
    const buffer = Buffer.from(body.file_base64, 'base64');
    if (!buffer.length || buffer.length > MAX_BYTES) return response(413, { error: 'File must be no larger than 5 MB' });
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    if (!workbook.SheetNames.length) return response(400, { error: 'The workbook has no worksheets' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    if (!rows.length || rows.length > MAX_ROWS) return response(400, { error: `File must contain between 1 and ${MAX_ROWS} data rows` });
    const keys = Object.keys(rows[0]).map((key) => key.trim().toLowerCase());
    const missing = ['user_id', 'email', 'subscription_name'].filter((field) => !COLUMN_ALIASES[field].some((alias) => keys.includes(alias)));
    if (missing.length) return response(400, { error: `Missing required columns: ${missing.join(', ')}` });

    const result = processRows(rows);
    const totals = { rows: rows.length, accepted: result.accepted.length, ignored: result.ignored.length, rejected: result.rejected.length, duplicates: result.duplicates.length };
    if (body.preview !== false) return response(200, { preview: true, totals, ...result });
    if (result.accepted.length) await sb('member_app_access?on_conflict=normalized_email', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(result.accepted)
    });
    const batch = await sb('import_batches', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      import_type: 'members', filename: body.filename, uploaded_by: admin.email, total_rows: totals.rows,
      accepted_rows: totals.accepted, ignored_rows: totals.ignored, rejected_rows: totals.rejected,
      details: { ignored: result.ignored, rejected: result.rejected, duplicates: result.duplicates }
    }) });
    const errors = [
      ...result.ignored.map((item) => ({ import_batch_id: batch?.[0]?.id, row_number: item.row, severity: 'ignored', code: 'excluded_membership', email: item.email || null, bd_user_id: item.bd_user_id || null, membership: item.membership || null, details: item })),
      ...result.rejected.map((item) => ({ import_batch_id: batch?.[0]?.id, row_number: item.row, severity: 'error', code: item.reason, email: item.email || null, bd_user_id: item.bd_user_id || null, membership: item.membership || null, details: item })),
      ...result.duplicates.map((item) => ({ import_batch_id: batch?.[0]?.id, row_number: item.rows?.[1] || null, severity: 'warning', code: 'duplicate_email', email: item.email, details: item }))
    ];
    if (errors.length) await sb('import_errors', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(errors) });
    await audit(admin, 'members.imported', 'import_batch', batch?.[0]?.id, totals);
    return response(200, { imported: true, batch_id: batch?.[0]?.id, totals, ignored: result.ignored, rejected: result.rejected, duplicates: result.duplicates });
  } catch (error) {
    console.error('admin-member-import', error);
    return response(500, { error: 'Import failed' });
  }
};
