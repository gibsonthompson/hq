// GET: signed in? | POST { pin }: sign in | DELETE: sign out
const { SESSION_DAYS, SERVICE_KEY, createToken, isAuthed, cookieHeader, safeEqual, rest, send, readJson } = require('./_session')

const MAX_FAILURES = 8
const WINDOW_MINUTES = 15

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(req.headers['x-real-ip'] || 'unknown')
}

module.exports = async (req, res) => {
  const pin = process.env.HQ_PIN

  if (req.method === 'GET') {
    return send(res, 200, { authed: isAuthed(req), configured: Boolean(pin && SERVICE_KEY) })
  }

  if (req.method === 'DELETE') {
    return send(res, 200, { authed: false }, { 'Set-Cookie': cookieHeader('', 0) })
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
  if (!pin || !SERVICE_KEY) return send(res, 503, { error: 'HQ sign-in is not set up on the server yet.' })

  const ip = clientIp(req)
  const since = new Date(Date.now() - WINDOW_MINUTES * 60000).toISOString()
  const recent = await rest(`admin_pin_attempts?select=id&app=eq.hq&ip=eq.${encodeURIComponent(ip)}&attempted_at=gte.${encodeURIComponent(since)}`)
  if (recent.ok && Array.isArray(recent.data) && recent.data.length >= MAX_FAILURES) {
    return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' })
  }

  const body = await readJson(req)
  const given = String(body.pin ?? '').replace(/\D/g, '')
  if (!given || !safeEqual(given, pin)) {
    await rest('admin_pin_attempts', { method: 'POST', body: { app: 'hq', ip } })
    await new Promise(r => setTimeout(r, 700))
    return send(res, 401, { error: 'Wrong PIN' })
  }

  await rest(`admin_pin_attempts?app=eq.hq&ip=eq.${encodeURIComponent(ip)}`, { method: 'DELETE' })
  const token = createToken()
  return send(res, 200, { authed: true }, { 'Set-Cookie': cookieHeader(token, SESSION_DAYS * 86400) })
}
