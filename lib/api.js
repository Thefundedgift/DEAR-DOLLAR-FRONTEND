'use client'

// DEAR DOLLAR API client — talks to the NestJS-contract backend.
// Uses NEXT_PUBLIC_API_URL when configured (production), falls back to /api (built-in mock backend).
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

const LS_ACCESS = 'dd_access_token'
const LS_REFRESH = 'dd_refresh_token'

export function getTokens() {
  if (typeof window === 'undefined') return { access: null, refresh: null }
  return { access: localStorage.getItem(LS_ACCESS), refresh: localStorage.getItem(LS_REFRESH) }
}

export function setTokens(access, refresh) {
  localStorage.setItem(LS_ACCESS, access)
  if (refresh) localStorage.setItem(LS_REFRESH, refresh)
}

export function clearTokens() {
  localStorage.removeItem(LS_ACCESS)
  localStorage.removeItem(LS_REFRESH)
}

let refreshPromise = null

async function tryRefresh() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const { refresh } = getTokens()
    if (!refresh) return false
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      })
      if (!res.ok) return false
      const data = await res.json()
      setTokens(data.accessToken, data.refreshToken)
      return true
    } catch (e) {
      return false
    } finally {
      setTimeout(() => { refreshPromise = null }, 100)
    }
  })()
  return refreshPromise
}

export async function api(path, { method = 'GET', body, auth = true, _retried = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const { access } = getTokens()
    if (access) headers.Authorization = `Bearer ${access}`
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch (e) { data = {} }

  if (res.status === 401 && auth && !_retried && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    const ok = await tryRefresh()
    if (ok) return api(path, { method, body, auth, _retried: true })
    clearTokens()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('dd-logout'))
  }

  if (!res.ok) {
    const msg = data?.message || `Request failed (${res.status})`
    const error = new Error(Array.isArray(msg) ? msg.join(', ') : msg)
    error.status = res.status
    throw error
  }
  return data
}
