// HQ data relay. The page sends a small description of the query; this runs it against hq_items with the
// service key, but only for a signed-in session and only for Gibson's own rows.
const { isAuthed, rest, send, readJson } = require('./_session')

const USER_KEY = 'gibson'
const COLUMN_RE = /^[a-z_][a-z0-9_]*$/
const SELECT_RE = /^[a-z_*, ]{1,200}$/
const FILTER_COLUMNS = new Set(['user_key', 'id', 'kind', 'parent', 'deleted'])

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: { message: 'Method not allowed' } })
  if (!isAuthed(req)) return send(res, 401, { error: { message: 'Sign in to HQ' } })

  const q = await readJson(req)

  if (q.action === 'select') {
    const params = new URLSearchParams()
    params.set('select', SELECT_RE.test(q.select || '') ? q.select.replace(/\s+/g, '') : '*')
    params.append('user_key', `eq.${USER_KEY}`)
    for (const f of Array.isArray(q.filters) ? q.filters : []) {
      if (f && f.op === 'eq' && FILTER_COLUMNS.has(f.column) && f.column !== 'user_key') params.append(f.column, `eq.${String(f.value)}`)
    }
    const order = (Array.isArray(q.order) ? q.order : []).filter(o => o && COLUMN_RE.test(o.column))
      .map(o => `${o.column}.${o.ascending === false ? 'desc' : 'asc'}`)
    if (order.length) params.set('order', order.join(','))
    if (Array.isArray(q.range)) {
      const from = Math.max(0, Number(q.range[0]) || 0), to = Math.max(from, Number(q.range[1]) || from)
      params.set('offset', String(from))
      params.set('limit', String(Math.min(to - from + 1, 1000)))
    } else if (q.limit) {
      params.set('limit', String(Math.min(Number(q.limit) || 1, 1000)))
    }
    const r = await rest(`hq_items?${params.toString()}`)
    if (!r.ok) return send(res, 200, { data: null, error: { message: (r.data && r.data.message) || `read failed (${r.status})` } })
    return send(res, 200, { data: r.data, error: null })
  }

  if (q.action === 'upsert') {
    const rows = (Array.isArray(q.values) ? q.values : [q.values]).filter(r => r && typeof r === 'object' && r.id)
    if (!rows.length) return send(res, 200, { data: [], error: null })
    const clean = rows.map(r => ({ id: r.id, user_key: USER_KEY, kind: r.kind ?? null, parent: r.parent ?? null, deleted: Boolean(r.deleted), data: r.data ?? {} }))
    const r = await rest('hq_items?on_conflict=id', { method: 'POST', body: clean, prefer: 'resolution=merge-duplicates,return=minimal' })
    if (!r.ok) return send(res, 200, { data: null, error: { message: (r.data && r.data.message) || `write failed (${r.status})` } })
    return send(res, 200, { data: null, error: null })
  }

  return send(res, 400, { error: { message: 'Action not allowed' } })
}
