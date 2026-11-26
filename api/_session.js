// Shared helpers for the HQ API (files starting with "_" are not deployed as routes).
const crypto = require('crypto')

const COOKIE = 'hq_session'
const SESSION_DAYS = 90
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://szdrpdjyordvqtkuuazh.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function material() {
  const pin = process.env.HQ_PIN
  const secret = process.env.HQ_SESSION_SECRET || SERVICE_KEY
  return pin && secret ? `${secret}:${pin}` : null
}

function sign(payload) {
  return crypto.createHmac('sha256', material()).update(payload).digest('base64url')
}

function createToken() {
  if (!material()) return null
  const exp = String(Date.now() + SESSION_DAYS * 86400000)
  return `${exp}.${sign(exp)}`
}

function readCookie(req, name) {
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

function isAuthed(req) {
  const token = readCookie(req, COOKIE)
  if (!token || !material()) return false
  const [exp, sig] = token.split('.')
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false
  const a = Buffer.from(sign(exp)), b = Buffer.from(sig)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function cookieHeader(value, maxAgeSeconds) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// Supabase REST call with the service key
async function rest(path, { method = 'GET', body, prefer, signal } = {}) {
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: res.ok, status: res.status, data, headers: res.headers }
}

function send(res, status, obj, extraHeaders = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v)
  res.end(JSON.stringify(obj))
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

module.exports = { COOKIE, SESSION_DAYS, SERVICE_KEY, createToken, isAuthed, cookieHeader, safeEqual, rest, send, readJson }
