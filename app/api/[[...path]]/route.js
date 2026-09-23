import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

// ============================================================
// DEAR DOLLAR — Mock NestJS-contract Backend (REST API)
// Mirrors the production NestJS backend contract so the customer
// frontend can later switch NEXT_PUBLIC_API_URL to the real API.
// ============================================================

let client = null
async function getDb() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
  }
  return client.db(process.env.DB_NAME || 'deardollar')
}

const ACCESS_TTL_MS = 30 * 60 * 1000 // 30 min
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MOCK_ADMIN_APPROVE_MS = 45 * 1000 // mock admin verifies after 45s

function json(data, status = 200) {
  return NextResponse.json(data, { status })
}
function err(message, status = 400) {
  return json({ statusCode: status, message, error: true }, status)
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const check = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'))
}
function genToken() {
  return crypto.randomBytes(32).toString('hex')
}

const MOBILE_RE = /^[6-9]\d{9}$/
function validPassword(p) {
  return typeof p === 'string' && p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p)
}

function sanitizeUser(u) {
  return {
    id: u.id,
    mobile: u.mobile,
    name: u.name || null,
    createdAt: u.createdAt,
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function maskAccount(acc) {
  if (!acc) return null
  return 'XXXXXX' + acc.slice(-4)
}
function maskUpi(upi) {
  if (!upi) return null
  const [name, handle] = upi.split('@')
  if (!handle) return upi.slice(0, 2) + '****'
  return name.slice(0, 2) + '****@' + handle
}

// ---------- Seed ----------
async function ensureSeed(db) {
  const count = await db.collection('listings').countDocuments()
  if (count === 0) {
    const now = new Date().toISOString()
    await db.collection('listings').insertMany([
      { id: uuidv4(), type: 'BUY', title: 'Starter Pack', priceInr: 40, dollars: 9, rate: round2(40 / 9), active: true, createdAt: now },
      { id: uuidv4(), type: 'BUY', title: 'Value Pack', priceInr: 100, dollars: 24, rate: round2(100 / 24), active: true, createdAt: now },
      { id: uuidv4(), type: 'BUY', title: 'Pro Pack', priceInr: 500, dollars: 130, rate: round2(500 / 130), active: true, createdAt: now },
      { id: uuidv4(), type: 'BUY', title: 'Mega Pack', priceInr: 1000, dollars: 270, rate: round2(1000 / 270), active: true, createdAt: now },
      { id: uuidv4(), type: 'SELL', title: 'Quick Sell', priceInr: 20, dollars: 10, rate: round2(20 / 10), active: true, createdAt: now },
      { id: uuidv4(), type: 'SELL', title: 'Bulk Demand', priceInr: 90, dollars: 50, rate: round2(90 / 50), active: true, createdAt: now },
      { id: uuidv4(), type: 'SELL', title: 'Whale Demand', priceInr: 850, dollars: 500, rate: round2(850 / 500), active: true, createdAt: now },
    ])
  }
  const links = await db.collection('settings').findOne({ key: 'community_links' })
  if (!links) {
    await db.collection('settings').insertOne({
      key: 'community_links',
      telegram: { url: 'https://t.me/deardollar_official', enabled: true },
      discord: { url: 'https://discord.gg/deardollar', enabled: true },
    })
  }
  const pay = await db.collection('settings').findOne({ key: 'payment' })
  if (!pay) {
    await db.collection('settings').insertOne({ key: 'payment', upiId: 'deardollar@ybl', payeeName: 'DEAR DOLLAR' })
  }
}

// ---------- Auth helper ----------
async function getAuthUser(request, db) {
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const session = await db.collection('sessions').findOne({ accessToken: token, active: true })
  if (!session) return null
  if (new Date(session.accessExpiresAt).getTime() < Date.now()) return null
  const user = await db.collection('users').findOne({ id: session.userId })
  return user
}

async function createSession(db, userId) {
  const accessToken = genToken()
  const refreshToken = genToken()
  const now = Date.now()
  await db.collection('sessions').insertOne({
    id: uuidv4(),
    userId,
    accessToken,
    refreshToken,
    accessExpiresAt: new Date(now + ACCESS_TTL_MS).toISOString(),
    refreshExpiresAt: new Date(now + REFRESH_TTL_MS).toISOString(),
    active: true,
    createdAt: new Date(now).toISOString(),
  })
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_MS / 1000 }
}

async function addNotification(db, userId, type, title, message) {
  await db.collection('notifications').insertOne({
    id: uuidv4(), userId, type, title, message, read: false, createdAt: new Date().toISOString(),
  })
}

async function addTxn(db, userId, type, currency, amount, status, description, refId) {
  const txn = {
    id: uuidv4(), userId, type, currency, amount, status, description, refId: refId || null,
    createdAt: new Date().toISOString(),
  }
  await db.collection('transactions').insertOne(txn)
  return txn
}

// ---------- Mock admin: lazily auto-verify pending items after delay ----------
async function processMockAdmin(db, userId) {
  const cutoff = new Date(Date.now() - MOCK_ADMIN_APPROVE_MS).toISOString()

  // Deposits: PENDING (UTR submitted) -> APPROVED, credit wallet
  const deposits = await db.collection('deposits').find({ userId, status: 'PENDING', utrSubmittedAt: { $lt: cutoff } }).toArray()
  for (const d of deposits) {
    await db.collection('deposits').updateOne({ id: d.id }, { $set: { status: 'APPROVED', verifiedAt: new Date().toISOString() } })
    await db.collection('users').updateOne({ id: userId }, { $inc: { moneyAvailable: d.amount, moneyPending: -d.amount } })
    await db.collection('transactions').updateOne({ refId: d.id }, { $set: { status: 'COMPLETED' } })
    await addNotification(db, userId, 'DEPOSIT_VERIFIED', 'Deposit Verified', `Your deposit of ₹${d.amount} has been verified and credited to your Money Wallet.`)
  }

  // Orders: PENDING -> APPROVED
  const orders = await db.collection('orders').find({ userId, status: 'PENDING', createdAt: { $lt: cutoff } }).toArray()
  for (const o of orders) {
    await db.collection('orders').updateOne({ id: o.id }, { $set: { status: 'APPROVED', approvedAt: new Date().toISOString() } })
    if (o.type === 'BUY') {
      await db.collection('users').updateOne({ id: userId }, { $inc: { dollarBalance: o.dollars, dollarPending: -o.dollars } })
      await addNotification(db, userId, 'BUY_APPROVED', 'Buy Approved', `Your purchase of $${o.dollars} dollar has been approved and credited to your Point Wallet.`)
    } else {
      await db.collection('users').updateOne({ id: userId }, { $inc: { moneyAvailable: o.amountInr, moneyPending: -o.amountInr } })
      await addNotification(db, userId, 'SELL_APPROVED', 'Sell Approved', `Your sell of $${o.dollars} dollar has been approved. ₹${o.amountInr} credited to your Money Wallet.`)
    }
    await db.collection('transactions').updateOne({ refId: o.id }, { $set: { status: 'COMPLETED' } })
  }

  // Withdrawals: PENDING -> COMPLETED
  const wds = await db.collection('withdrawals').find({ userId, status: 'PENDING', createdAt: { $lt: cutoff } }).toArray()
  for (const w of wds) {
    await db.collection('withdrawals').updateOne({ id: w.id }, { $set: { status: 'COMPLETED', completedAt: new Date().toISOString() } })
    await db.collection('transactions').updateOne({ refId: w.id }, { $set: { status: 'COMPLETED' } })
    await addNotification(db, userId, 'WITHDRAWAL_COMPLETED', 'Withdrawal Completed', `Your withdrawal of ₹${w.amount} has been settled to your bank account.`)
  }
}

// ============================================================
// Router
// ============================================================
async function handler(request, { params }) {
  const { path = [] } = await params
  const route = path.join('/')
  const method = request.method

  try {
    const db = await getDb()
    await ensureSeed(db)

    let body = {}
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      try { body = await request.json() } catch (e) { body = {} }
    }
    const url = new URL(request.url)

    // ---------- Public routes ----------
    if (route === '' && method === 'GET') {
      return json({ message: 'DEAR DOLLAR API', status: 'ok', poweredBy: 'INTERNET ZONE' })
    }

    if (route === 'community-links' && method === 'GET') {
      const s = await db.collection('settings').findOne({ key: 'community_links' })
      const links = []
      if (s?.telegram?.enabled && s.telegram.url) links.push({ platform: 'telegram', url: s.telegram.url })
      if (s?.discord?.enabled && s.discord.url) links.push({ platform: 'discord', url: s.discord.url })
      return json({ links })
    }

    // ---- AUTH ----
    if (route === 'auth/register' && method === 'POST') {
      const { mobile, password, confirmPassword } = body
      if (!mobile || !MOBILE_RE.test(String(mobile))) return err('Please enter a valid Indian mobile number (10 digits, starts with 6-9)')
      if (!validPassword(password)) return err('Password must be at least 8 characters and contain letters and numbers')
      if (confirmPassword !== undefined && confirmPassword !== password) return err('Passwords do not match')
      const existing = await db.collection('users').findOne({ mobile: String(mobile) })
      if (existing) return err('An account with this mobile number already exists', 409)
      const user = {
        id: uuidv4(),
        mobile: String(mobile),
        passwordHash: hashPassword(password),
        name: null,
        moneyAvailable: 0,
        moneyPending: 0,
        dollarBalance: 0,
        dollarPending: 0,
        createdAt: new Date().toISOString(),
      }
      await db.collection('users').insertOne(user)
      const tokens = await createSession(db, user.id)
      await addNotification(db, user.id, 'WELCOME', 'Welcome to DEAR DOLLAR', 'Your account has been created. Add money to start buying $Dollar!')
      return json({ user: sanitizeUser(user), ...tokens }, 201)
    }

    if (route === 'auth/login' && method === 'POST') {
      const { mobile, password } = body
      if (!mobile || !password) return err('Mobile number and password are required')
      const user = await db.collection('users').findOne({ mobile: String(mobile) })
      if (!user || !verifyPassword(password, user.passwordHash)) return err('Invalid mobile number or password', 401)
      const tokens = await createSession(db, user.id)
      return json({ user: sanitizeUser(user), ...tokens })
    }

    if (route === 'auth/refresh' && method === 'POST') {
      const { refreshToken } = body
      if (!refreshToken) return err('Refresh token required', 401)
      const session = await db.collection('sessions').findOne({ refreshToken, active: true })
      if (!session || new Date(session.refreshExpiresAt).getTime() < Date.now()) return err('Invalid or expired refresh token', 401)
      await db.collection('sessions').updateOne({ id: session.id }, { $set: { active: false } })
      const tokens = await createSession(db, session.userId)
      return json(tokens)
    }

    if (route === 'auth/forgot-password' && method === 'POST') {
      const { mobile } = body
      if (!mobile || !MOBILE_RE.test(String(mobile))) return err('Please enter a valid Indian mobile number')
      return json({ message: 'If an account exists with this mobile number, password reset instructions have been sent.' })
    }

    // ---------- Protected routes ----------
    const user = await getAuthUser(request, db)
    if (!user) return err('Unauthorized', 401)

    if (route === 'auth/logout' && method === 'POST') {
      const auth = request.headers.get('authorization') || ''
      const token = auth.slice(7)
      await db.collection('sessions').updateOne({ accessToken: token }, { $set: { active: false } })
      return json({ message: 'Logged out successfully' })
    }

    if (route === 'auth/me' && method === 'GET') {
      await processMockAdmin(db, user.id)
      const fresh = await db.collection('users').findOne({ id: user.id })
      return json({ user: sanitizeUser(fresh) })
    }

    if (route === 'users/me' && method === 'PUT') {
      const { name } = body
      await db.collection('users').updateOne({ id: user.id }, { $set: { name: name || null } })
      const fresh = await db.collection('users').findOne({ id: user.id })
      return json({ user: sanitizeUser(fresh) })
    }

    // ---- WALLET ----
    if (route === 'wallet' && method === 'GET') {
      await processMockAdmin(db, user.id)
      const fresh = await db.collection('users').findOne({ id: user.id })
      return json({
        money: { available: round2(fresh.moneyAvailable), pending: round2(fresh.moneyPending) },
        dollar: { balance: round2(fresh.dollarBalance), pending: round2(fresh.dollarPending) },
      })
    }

    if (route === 'transactions' && method === 'GET') {
      await processMockAdmin(db, user.id)
      const type = url.searchParams.get('type')
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
      const q = { userId: user.id }
      if (type) q.type = type
      const txns = await db.collection('transactions').find(q, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(limit).toArray()
      return json({ transactions: txns })
    }

    // ---- DEPOSITS (ADD MONEY) ----
    if (route === 'deposits' && method === 'POST') {
      const amount = Number(body.amount)
      if (!amount || amount < 10) return err('Minimum deposit amount is ₹10')
      if (amount > 100000) return err('Maximum deposit amount is ₹1,00,000')
      const pay = await db.collection('settings').findOne({ key: 'payment' })
      const deposit = {
        id: uuidv4(), userId: user.id, amount: round2(amount),
        status: 'AWAITING_PAYMENT', utr: null,
        upiId: pay.upiId, payeeName: pay.payeeName,
        createdAt: new Date().toISOString(), utrSubmittedAt: null, verifiedAt: null,
      }
      await db.collection('deposits').insertOne(deposit)
      const { _id, ...rest } = deposit
      return json({ deposit: rest, upiString: `upi://pay?pa=${pay.upiId}&pn=${encodeURIComponent(pay.payeeName)}&am=${amount}&cu=INR&tn=DD-${deposit.id.slice(0, 8)}` }, 201)
    }

    if (route.match(/^deposits\/[\w-]+\/utr$/) && method === 'POST') {
      const depositId = route.split('/')[1]
      const utr = String(body.utr || '').trim()
      if (!/^\d{12}$/.test(utr)) return err('UTR must be a 12-digit number')
      const deposit = await db.collection('deposits').findOne({ id: depositId, userId: user.id })
      if (!deposit) return err('Deposit not found', 404)
      if (deposit.status !== 'AWAITING_PAYMENT') return err('UTR already submitted for this deposit')
      await db.collection('deposits').updateOne({ id: depositId }, { $set: { status: 'PENDING', utr, utrSubmittedAt: new Date().toISOString() } })
      await db.collection('users').updateOne({ id: user.id }, { $inc: { moneyPending: deposit.amount } })
      await addTxn(db, user.id, 'UPI_DEPOSIT', 'INR', deposit.amount, 'PENDING', `UPI Deposit of ₹${deposit.amount} — awaiting admin verification`, depositId)
      const fresh = await db.collection('deposits').findOne({ id: depositId }, { projection: { _id: 0 } })
      return json({ deposit: fresh, message: 'UTR submitted. Payment pending admin verification.' })
    }

    if (route === 'deposits' && method === 'GET') {
      await processMockAdmin(db, user.id)
      const deposits = await db.collection('deposits').find({ userId: user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(50).toArray()
      return json({ deposits })
    }

    // ---- LISTINGS ----
    if (route === 'listings' && method === 'GET') {
      const type = url.searchParams.get('type') || 'BUY'
      const listings = await db.collection('listings').find({ type, active: true }, { projection: { _id: 0 } }).sort({ priceInr: 1 }).toArray()
      return json({ listings })
    }

    // ---- ORDERS: QUOTE (backend performs all calculations) ----
    if (route === 'orders/quote' && method === 'POST') {
      const { type, listingId } = body
      const dollars = Number(body.dollars)
      if (!['BUY', 'SELL'].includes(type)) return err('Invalid order type')
      if (!dollars || dollars <= 0) return err('Enter a valid dollar amount')
      const listing = await db.collection('listings').findOne({ id: listingId, type, active: true })
      if (!listing) return err('Listing not found or inactive', 404)
      const rate = listing.rate
      const amountInr = round2(dollars * rate)
      const fresh = await db.collection('users').findOne({ id: user.id })
      const quote = {
        type, listingId, dollars: round2(dollars), rate, amountInr,
        currentMoney: round2(fresh.moneyAvailable),
        currentDollars: round2(fresh.dollarBalance),
      }
      if (type === 'BUY') {
        quote.moneyAfter = round2(fresh.moneyAvailable - amountInr)
        quote.dollarsAfter = round2(fresh.dollarBalance + dollars)
        quote.sufficient = fresh.moneyAvailable >= amountInr
      } else {
        quote.moneyAfter = round2(fresh.moneyAvailable + amountInr)
        quote.dollarsAfter = round2(fresh.dollarBalance - dollars)
        quote.sufficient = fresh.dollarBalance >= dollars
      }
      return json({ quote })
    }

    if (route === 'orders' && method === 'POST') {
      const { type, listingId } = body
      const dollars = Number(body.dollars)
      if (!['BUY', 'SELL'].includes(type)) return err('Invalid order type')
      if (!dollars || dollars <= 0) return err('Enter a valid dollar amount')
      const listing = await db.collection('listings').findOne({ id: listingId, type, active: true })
      if (!listing) return err('Listing not found or inactive', 404)
      const rate = listing.rate
      const amountInr = round2(dollars * rate)
      const fresh = await db.collection('users').findOne({ id: user.id })
      const order = {
        id: uuidv4(), userId: user.id, type, listingId, listingTitle: listing.title,
        dollars: round2(dollars), rate, amountInr,
        status: 'PENDING', createdAt: new Date().toISOString(), approvedAt: null,
      }
      if (type === 'BUY') {
        if (fresh.moneyAvailable < amountInr) return err('Insufficient money wallet balance. Please add money first.')
        await db.collection('users').updateOne({ id: user.id }, { $inc: { moneyAvailable: -amountInr, dollarPending: dollars } })
        await addTxn(db, user.id, 'DOLLAR_PURCHASE', 'INR', amountInr, 'PENDING', `Buy $${dollars} dollar @ ₹${rate}/$ — pending approval`, order.id)
      } else {
        if (fresh.dollarBalance < dollars) return err('Insufficient $Dollar balance.')
        await db.collection('users').updateOne({ id: user.id }, { $inc: { dollarBalance: -dollars, moneyPending: amountInr } })
        await addTxn(db, user.id, 'DOLLAR_SELL', 'DOLLAR', dollars, 'PENDING', `Sell $${dollars} dollar @ ₹${rate}/$ — expecting ₹${amountInr}`, order.id)
      }
      await db.collection('orders').insertOne(order)
      const { _id, ...rest } = order
      return json({ order: rest, message: `${type === 'BUY' ? 'Buy' : 'Sell'} request submitted. Pending admin approval.` }, 201)
    }

    if (route === 'orders' && method === 'GET') {
      await processMockAdmin(db, user.id)
      const type = url.searchParams.get('type')
      const q = { userId: user.id }
      if (type) q.type = type
      const orders = await db.collection('orders').find(q, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(50).toArray()
      return json({ orders })
    }

    // ---- BANK DETAILS ----
    if (route === 'bank-details' && method === 'GET') {
      const bd = await db.collection('bankDetails').findOne({ userId: user.id })
      if (!bd) return json({ bankDetails: null })
      return json({
        bankDetails: {
          accountHolder: bd.accountHolder,
          bankName: bd.bankName,
          accountNumberMasked: maskAccount(bd.accountNumber),
          ifsc: bd.ifsc,
          upiIdMasked: maskUpi(bd.upiId),
          updatedAt: bd.updatedAt,
        },
      })
    }

    if (route === 'bank-details' && method === 'PUT') {
      const { accountHolder, bankName, accountNumber, ifsc, upiId } = body
      if (!accountHolder || !bankName || !accountNumber || !ifsc) return err('Account holder, bank name, account number and IFSC are required')
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc)) return err('Invalid IFSC code format')
      if (!/^\d{9,18}$/.test(String(accountNumber))) return err('Account number must be 9-18 digits')
      await db.collection('bankDetails').updateOne(
        { userId: user.id },
        { $set: { accountHolder, bankName, accountNumber: String(accountNumber), ifsc: ifsc.toUpperCase(), upiId: upiId || null, updatedAt: new Date().toISOString() }, $setOnInsert: { id: uuidv4(), userId: user.id } },
        { upsert: true }
      )
      return json({ message: 'Bank details saved successfully' })
    }

    // ---- WITHDRAWALS ----
    if (route === 'withdrawals' && method === 'POST') {
      const amount = Number(body.amount)
      if (!amount || amount < 100) return err('Minimum withdrawal amount is ₹100')
      const bd = await db.collection('bankDetails').findOne({ userId: user.id })
      if (!bd) return err('Please add your bank details before requesting a withdrawal')
      const fresh = await db.collection('users').findOne({ id: user.id })
      if (fresh.moneyAvailable < amount) return err('Insufficient available balance')
      const wd = {
        id: uuidv4(), userId: user.id, amount: round2(amount), status: 'PENDING',
        bank: { bankName: bd.bankName, accountNumberMasked: maskAccount(bd.accountNumber) },
        createdAt: new Date().toISOString(),
      }
      await db.collection('users').updateOne({ id: user.id }, { $inc: { moneyAvailable: -amount } })
      await db.collection('withdrawals').insertOne(wd)
      await addTxn(db, user.id, 'SETTLEMENT', 'INR', amount, 'PENDING', `Withdrawal of ₹${amount} to ${bd.bankName} ${maskAccount(bd.accountNumber)}`, wd.id)
      const { _id, ...rest } = wd
      return json({ withdrawal: rest, message: 'Withdrawal request submitted. Pending processing.' }, 201)
    }

    if (route === 'withdrawals' && method === 'GET') {
      await processMockAdmin(db, user.id)
      const wds = await db.collection('withdrawals').find({ userId: user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(50).toArray()
      return json({ withdrawals: wds })
    }

    // ---- NOTIFICATIONS ----
    if (route === 'notifications' && method === 'GET') {
      await processMockAdmin(db, user.id)
      const notifications = await db.collection('notifications').find({ userId: user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(50).toArray()
      const unread = notifications.filter((n) => !n.read).length
      return json({ notifications, unread })
    }

    if (route === 'notifications/mark-read' && method === 'POST') {
      await db.collection('notifications').updateMany({ userId: user.id, read: false }, { $set: { read: true } })
      return json({ message: 'All notifications marked as read' })
    }

    return err(`Route not found: ${method} /api/${route}`, 404)
  } catch (e) {
    console.error('API Error:', e)
    return err('Internal server error', 500)
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
