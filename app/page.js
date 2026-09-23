'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import QRCode from 'qrcode'
import { Toaster, toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Home, TrendingUp, TrendingDown, Wallet, User, Bell, Eye, EyeOff, ArrowLeft, Copy,
  Plus, IndianRupee, DollarSign, Clock, CheckCircle2, XCircle, Landmark, LogOut,
  Send, MessageCircle, ChevronRight, Loader2, ArrowDownToLine, ArrowUpFromLine, RefreshCw, ShieldCheck,
} from 'lucide-react'
import { api, getTokens, setTokens, clearTokens } from '@/lib/api'

// ============ helpers ============
const fmtInr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const fmtDollar = (n) => '$' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}
const MOBILE_RE = /^[6-9]\d{9}$/

const STATUS_STYLES = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  AWAITING_PAYMENT: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
}
const StatusBadge = ({ status }) => (
  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] || STATUS_STYLES.AWAITING_PAYMENT}`}>
    {String(status || '').replace('_', ' ')}
  </span>
)

const Card = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur ${className}`}>{children}</div>
)

const EmptyState = ({ icon: Icon, text }) => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
      <Icon className="w-5 h-5 text-slate-500" />
    </div>
    <p className="text-sm text-slate-500">{text}</p>
  </div>
)

const Spinner = () => (
  <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
)

const Logo = ({ size = 'md' }) => (
  <div className="flex items-center gap-2.5">
    <div className={`${size === 'lg' ? 'w-14 h-14 rounded-2xl' : 'w-9 h-9 rounded-xl'} bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30`}>
      <DollarSign className={size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'} strokeWidth={2.5} />
    </div>
    <div>
      <p className={`font-extrabold tracking-tight leading-none ${size === 'lg' ? 'text-2xl' : 'text-base'}`}>DEAR <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">DOLLAR</span></p>
      <p className={`text-slate-500 leading-none ${size === 'lg' ? 'text-[11px] mt-1' : 'text-[9px] mt-0.5'} uppercase tracking-widest`}>Powered by Internet Zone</p>
    </div>
  </div>
)

const TXN_ICONS = {
  UPI_DEPOSIT: { icon: ArrowDownToLine, color: 'text-emerald-400 bg-emerald-500/10' },
  DOLLAR_PURCHASE: { icon: TrendingUp, color: 'text-indigo-400 bg-indigo-500/10' },
  DOLLAR_SELL: { icon: TrendingDown, color: 'text-fuchsia-400 bg-fuchsia-500/10' },
  REFUND: { icon: RefreshCw, color: 'text-amber-400 bg-amber-500/10' },
  SETTLEMENT: { icon: ArrowUpFromLine, color: 'text-rose-400 bg-rose-500/10' },
}
const TXN_LABELS = {
  UPI_DEPOSIT: 'UPI Deposit', DOLLAR_PURCHASE: '$Dollar Purchase', DOLLAR_SELL: '$Dollar Sell',
  REFUND: 'Refund', SETTLEMENT: 'Settlement',
}

const TxnRow = ({ txn }) => {
  const meta = TXN_ICONS[txn.type] || TXN_ICONS.REFUND
  const Icon = meta.icon
  const isCredit = txn.type === 'UPI_DEPOSIT' || txn.type === 'REFUND'
  return (
    <div className="flex items-center gap-3 py-3" data-testid="txn-row">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}>
        <Icon className="w-4.5 h-4.5 w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{TXN_LABELS[txn.type] || txn.type}</p>
        <p className="text-[11px] text-slate-500">{fmtDate(txn.createdAt)}</p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${isCredit ? 'text-emerald-400' : 'text-white'}`}>
          {isCredit ? '+' : '-'}{txn.currency === 'DOLLAR' ? fmtDollar(txn.amount) : fmtInr(txn.amount)}
        </p>
        <StatusBadge status={txn.status} />
      </div>
    </div>
  )
}

// ============ Community Links (fetched from backend, hidden if disabled) ============
const CommunityLinks = ({ compact = false }) => {
  const [links, setLinks] = useState([])
  useEffect(() => {
    api('/community-links', { auth: false }).then((d) => setLinks(d.links || [])).catch(() => {})
  }, [])
  if (!links.length) return null
  return (
    <div className={`flex gap-2 ${compact ? '' : 'flex-col'}`} data-testid="community-links">
      {links.map((l) => (
        <a key={l.platform} href={l.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors flex-1">
          {l.platform === 'telegram' ? <Send className="w-4 h-4 text-sky-400" /> : <MessageCircle className="w-4 h-4 text-violet-400" />}
          <span className="text-xs font-semibold capitalize">{l.platform === 'telegram' ? 'Telegram' : 'Discord'}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 ml-auto" />
        </a>
      ))}
    </div>
  )
}

// ============ AUTH SCREENS ============
const AuthScreen = ({ onAuthed }) => {
  const [mode, setMode] = useState('login')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [resetSent, setResetSent] = useState(false)

  const validate = () => {
    const e = {}
    if (!MOBILE_RE.test(mobile)) e.mobile = 'Enter a valid 10-digit Indian mobile number (starts with 6-9)'
    if (mode !== 'forgot') {
      if (mode === 'register') {
        if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) e.password = 'Min 8 characters with letters and numbers'
        if (confirm !== password) e.confirm = 'Passwords do not match'
      } else if (!password) {
        e.password = 'Password is required'
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      if (mode === 'forgot') {
        const d = await api('/auth/forgot-password', { method: 'POST', body: { mobile }, auth: false })
        setResetSent(true)
        toast.success(d.message)
      } else {
        const path = mode === 'login' ? '/auth/login' : '/auth/register'
        const body = mode === 'login' ? { mobile, password } : { mobile, password, confirmPassword: confirm }
        const d = await api(path, { method: 'POST', body, auth: false })
        setTokens(d.accessToken, d.refreshToken)
        setPassword(''); setConfirm('')
        onAuthed(d.user)
        toast.success(mode === 'login' ? 'Welcome back!' : 'Account created successfully!')
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (m) => { setMode(m); setErrors({}); setResetSent(false); setPassword(''); setConfirm('') }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/25 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-fuchsia-600/20 rounded-full blur-3xl" />
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto px-6 py-10 relative z-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo size="lg" />
          <p className="text-slate-400 text-sm mt-4">India's trusted $Dollar marketplace.<br />Add money via UPI. Buy & sell instantly.</p>
        </div>

        <Card className="p-6">
          <h1 className="text-lg font-bold mb-1">
            {mode === 'login' ? 'Login to your account' : mode === 'register' ? 'Create your account' : 'Forgot password'}
          </h1>
          <p className="text-xs text-slate-500 mb-5">
            {mode === 'login' ? 'Use your mobile number and password' : mode === 'register' ? 'Register with your mobile number' : 'We will help you reset your password'}
          </p>

          {resetSent ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm text-slate-300">If an account exists with this mobile number, password reset instructions have been sent.</p>
              <Button variant="ghost" className="mt-4 text-indigo-400" onClick={() => switchMode('login')}>Back to login</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Mobile Number</label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-white/10 bg-white/5 text-sm text-slate-400">+91</span>
                  <Input data-testid="auth-mobile-input" type="tel" inputMode="numeric" maxLength={10} placeholder="9876543210"
                    value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                    className="rounded-l-none bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                </div>
                {errors.mobile && <p className="text-[11px] text-rose-400 mt-1">{errors.mobile}</p>}
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Password</label>
                  <div className="relative">
                    <Input data-testid="auth-password-input" type={showPw ? 'text' : 'password'} placeholder="••••••••"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      className="bg-white/5 border-white/10 text-white pr-10 placeholder:text-slate-600" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-[11px] text-rose-400 mt-1">{errors.password}</p>}
                </div>
              )}

              {mode === 'register' && (
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Confirm Password</label>
                  <Input data-testid="auth-confirm-input" type={showPw ? 'text' : 'password'} placeholder="Re-enter password"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                  {errors.confirm && <p className="text-[11px] text-rose-400 mt-1">{errors.confirm}</p>}
                </div>
              )}

              <Button data-testid="auth-submit-btn" onClick={submit} disabled={loading}
                className="w-full h-11 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 font-bold shadow-lg shadow-indigo-500/25">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'login' ? 'Login' : mode === 'register' ? 'Create Account' : 'Send Reset Instructions'}
              </Button>

              {mode === 'login' && (
                <div className="flex justify-between text-xs">
                  <button data-testid="forgot-password-link" onClick={() => switchMode('forgot')} className="text-slate-400 hover:text-white">Forgot password?</button>
                  <button data-testid="goto-register-link" onClick={() => switchMode('register')} className="text-indigo-400 font-semibold hover:text-indigo-300">New here? Register</button>
                </div>
              )}
              {mode !== 'login' && (
                <p className="text-xs text-center text-slate-400">
                  Already have an account?{' '}
                  <button data-testid="goto-login-link" onClick={() => switchMode('login')} className="text-indigo-400 font-semibold">Login</button>
                </p>
              )}
            </div>
          )}
        </Card>

        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-600">
          <ShieldCheck className="w-3.5 h-3.5" /> Secured with backend JWT authentication
        </div>
        <div className="mt-4"><CommunityLinks compact /></div>
      </div>
    </div>
  )
}

// ============ ADD MONEY OVERLAY ============
const AddMoneyOverlay = ({ onClose, onDone }) => {
  const [step, setStep] = useState(1)
  const [amount, setAmount] = useState('')
  const [deposit, setDeposit] = useState(null)
  const [upiString, setUpiString] = useState('')
  const [qr, setQr] = useState('')
  const [utr, setUtr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (upiString) QRCode.toDataURL(upiString, { width: 260, margin: 1, color: { dark: '#0f0f23', light: '#ffffff' } }).then(setQr).catch(() => {})
  }, [upiString])

  const createDeposit = async () => {
    const amt = Number(amount)
    if (!amt || amt < 10) return toast.error('Minimum deposit amount is ₹10')
    setLoading(true)
    try {
      const d = await api('/deposits', { method: 'POST', body: { amount: amt } })
      setDeposit(d.deposit); setUpiString(d.upiString); setStep(2)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  const submitUtr = async () => {
    if (!/^\d{12}$/.test(utr)) return toast.error('UTR must be a 12-digit number')
    setLoading(true)
    try {
      await api(`/deposits/${deposit.id}/utr`, { method: 'POST', body: { utr } })
      setStep(3)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  const copy = (text) => { navigator.clipboard?.writeText(text); toast.success('Copied!') }

  return (
    <div className="fixed inset-0 z-50 bg-[#070812] overflow-y-auto">
      <div className="max-w-md mx-auto px-5 py-5 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button data-testid="addmoney-back-btn" onClick={step === 3 ? onDone : onClose} className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="font-bold">Add Money</h2>
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <Card className="p-6">
              <label className="text-xs text-slate-400 mb-2 block">Enter Amount (₹)</label>
              <div className="relative">
                <IndianRupee className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input data-testid="addmoney-amount-input" type="number" inputMode="numeric" placeholder="0" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-10 h-14 text-2xl font-bold bg-white/5 border-white/10 text-white" />
              </div>
              <div className="flex gap-2 mt-4">
                {[100, 500, 1000, 5000].map((a) => (
                  <button key={a} onClick={() => setAmount(String(a))}
                    className="flex-1 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold hover:border-indigo-500/50">
                    ₹{a.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </Card>
            <Button data-testid="addmoney-create-btn" onClick={createDeposit} disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-indigo-500 to-violet-600 font-bold">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Proceed to Pay'}
            </Button>
            <p className="text-[11px] text-slate-500 text-center">You will pay via UPI and submit the UTR number for verification.</p>
          </div>
        )}

        {step === 2 && deposit && (
          <div className="space-y-4">
            <Card className="p-6 text-center">
              <p className="text-xs text-slate-400">Amount to pay</p>
              <p className="text-3xl font-extrabold mt-1">{fmtInr(deposit.amount)}</p>
              {qr && (
                <div className="mt-4 bg-white p-3 rounded-2xl inline-block">
                  <img src={qr} alt="UPI QR Code" className="w-52 h-52" data-testid="upi-qr" />
                </div>
              )}
              <div className="mt-4 flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-sm font-mono font-semibold" data-testid="upi-id">{deposit.upiId}</span>
                <button onClick={() => copy(deposit.upiId)} className="text-indigo-400"><Copy className="w-4 h-4" /></button>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">Pay to <b>{deposit.payeeName}</b> using any UPI app (GPay, PhonePe, Paytm)</p>
            </Card>

            <Card className="p-5">
              <label className="text-xs text-slate-400 mb-2 block">After paying, enter the 12-digit UTR / Transaction Reference number</label>
              <Input data-testid="utr-input" inputMode="numeric" maxLength={12} placeholder="e.g. 305412876590" value={utr}
                onChange={(e) => setUtr(e.target.value.replace(/\D/g, ''))}
                className="bg-white/5 border-white/10 text-white font-mono" />
              <Button data-testid="utr-submit-btn" onClick={submitUtr} disabled={loading} className="w-full mt-3 h-11 bg-gradient-to-r from-indigo-500 to-violet-600 font-bold">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit UTR'}
              </Button>
            </Card>
          </div>
        )}

        {step === 3 && (
          <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="font-bold text-lg" data-testid="payment-pending-title">Payment Pending</h3>
            <p className="text-sm text-slate-400 mt-2">Your UTR has been submitted. The admin team will verify your payment shortly. Your wallet will be credited after verification.</p>
            <div className="mt-4"><StatusBadge status="PENDING" /></div>
            <Button data-testid="addmoney-done-btn" onClick={onDone} className="w-full mt-6 h-11 bg-white/10 hover:bg-white/20 font-bold">Done</Button>
          </Card>
        )}
      </div>
    </div>
  )
}

// ============ TRADE (BUY / SELL) ============
const TradeTab = ({ type, wallet, onTraded }) => {
  const [listings, setListings] = useState(null)
  const [selected, setSelected] = useState(null)
  const [dollars, setDollars] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoting, setQuoting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const isBuy = type === 'BUY'

  useEffect(() => {
    setListings(null); setSelected(null); setQuote(null); setDollars('')
    api(`/listings?type=${type}`).then((d) => {
      setListings(d.listings || [])
      if (d.listings?.length) setSelected(d.listings[0])
    }).catch((e) => { toast.error(e.message); setListings([]) })
  }, [type])

  useEffect(() => { setQuote(null) }, [dollars, selected])

  const getQuote = async () => {
    const d = Number(dollars)
    if (!d || d <= 0) return toast.error('Enter a valid dollar amount')
    if (!selected) return toast.error('Select a listing first')
    setQuoting(true)
    try {
      const res = await api('/orders/quote', { method: 'POST', body: { type, listingId: selected.id, dollars: d } })
      setQuote(res.quote)
    } catch (e) { toast.error(e.message) } finally { setQuoting(false) }
  }

  const placeOrder = async () => {
    setSubmitting(true)
    try {
      const res = await api('/orders', { method: 'POST', body: { type, listingId: selected.id, dollars: Number(dollars) } })
      toast.success(res.message)
      setConfirmOpen(false); setQuote(null); setDollars('')
      onTraded()
    } catch (e) { toast.error(e.message) } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h2 className="text-xl font-extrabold">{isBuy ? 'Buy $Dollar' : 'Sell $Dollar'}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{isBuy ? 'Choose an active listing and enter how many dollars you want' : 'Choose an active demand and enter how many dollars to sell'}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 text-xs">
        <Card className="p-3">
          <p className="text-slate-500">Money Wallet</p>
          <p className="font-bold text-sm mt-0.5">{fmtInr(wallet?.money?.available)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-slate-500">$Dollar Balance</p>
          <p className="font-bold text-sm mt-0.5">{fmtDollar(wallet?.dollar?.balance)}</p>
        </Card>
      </div>

      {listings === null ? <Spinner /> : listings.length === 0 ? (
        <EmptyState icon={isBuy ? TrendingUp : TrendingDown} text={`No active ${isBuy ? '' : 'demand '}listings right now`} />
      ) : (
        <div className="space-y-2.5" data-testid="listings-container">
          {listings.map((l) => (
            <button key={l.id} onClick={() => setSelected(l)}
              className={`w-full text-left p-4 rounded-2xl border transition-all ${selected?.id === l.id ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10' : 'border-white/10 bg-white/[0.04]'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">{l.title}</p>
                  <p className="font-extrabold text-lg mt-0.5">{fmtInr(l.priceInr)} = <span className={isBuy ? 'text-indigo-400' : 'text-fuchsia-400'}>{fmtDollar(l.dollars)}</span></p>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">₹{l.rate}/$</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {listings?.length > 0 && (
        <Card className="p-5">
          <label className="text-xs text-slate-400 mb-2 block">{isBuy ? 'How many $Dollar do you want to buy?' : 'How many $Dollar do you want to sell?'}</label>
          <div className="relative">
            <DollarSign className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input data-testid="trade-dollars-input" type="number" inputMode="decimal" placeholder="0" value={dollars}
              onChange={(e) => setDollars(e.target.value)}
              className="pl-10 h-12 text-xl font-bold bg-white/5 border-white/10 text-white" />
          </div>
          <Button data-testid="trade-quote-btn" onClick={getQuote} disabled={quoting} className="w-full mt-3 h-11 bg-white/10 hover:bg-white/20 font-semibold">
            {quoting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get Quote'}
          </Button>

          {quote && (
            <div className="mt-4 p-4 rounded-xl bg-white/[0.04] border border-white/10 space-y-2 text-sm" data-testid="quote-card">
              <div className="flex justify-between"><span className="text-slate-400">$Dollar</span><span className="font-bold">{fmtDollar(quote.dollars)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Rate</span><span className="font-bold">₹{quote.rate} / $</span></div>
              <div className="flex justify-between"><span className="text-slate-400">{isBuy ? 'You Pay' : 'Expected Amount'}</span><span className="font-extrabold text-indigo-400">{fmtInr(quote.amountInr)}</span></div>
              <div className="h-px bg-white/10 my-1" />
              <div className="flex justify-between text-xs"><span className="text-slate-500">Current {isBuy ? 'Money Wallet' : '$Dollar'}</span><span>{isBuy ? fmtInr(quote.currentMoney) : fmtDollar(quote.currentDollars)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">{isBuy ? 'Money Wallet After' : 'Expected Wallet After'}</span><span className={quote.sufficient ? 'text-emerald-400' : 'text-rose-400'}>{isBuy ? fmtInr(quote.moneyAfter) : fmtInr(quote.moneyAfter)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">$Dollar After</span><span>{fmtDollar(quote.dollarsAfter)}</span></div>
              {!quote.sufficient && (
                <p className="text-[11px] text-rose-400 pt-1">{isBuy ? 'Insufficient money wallet balance. Add money first.' : 'Insufficient $Dollar balance.'}</p>
              )}
              <Button data-testid="trade-submit-btn" onClick={() => setConfirmOpen(true)} disabled={!quote.sufficient}
                className={`w-full mt-2 h-11 font-bold ${isBuy ? 'bg-gradient-to-r from-indigo-500 to-violet-600' : 'bg-gradient-to-r from-fuchsia-500 to-purple-600'}`}>
                {isBuy ? 'Buy Now' : 'Submit Sell Request'}
              </Button>
            </div>
          )}
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-[#0d0f1e] border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Confirm {isBuy ? 'Purchase' : 'Sell Request'}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {isBuy
                ? `Buy ${fmtDollar(quote?.dollars)} for ${fmtInr(quote?.amountInr)} at ₹${quote?.rate}/$. Amount will be deducted from your Money Wallet and dollars credited after admin approval.`
                : `Sell ${fmtDollar(quote?.dollars)} at ₹${quote?.rate}/$. You will receive ${fmtInr(quote?.amountInr)} in your Money Wallet after admin approval.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1 bg-white/5" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button data-testid="trade-confirm-btn" onClick={placeOrder} disabled={submitting}
              className={`flex-1 font-bold ${isBuy ? 'bg-gradient-to-r from-indigo-500 to-violet-600' : 'bg-gradient-to-r from-fuchsia-500 to-purple-600'}`}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ HOME TAB ============
const HomeTab = ({ user, wallet, transactions, onAction }) => {
  const pending = (transactions || []).filter((t) => t.status === 'PENDING')
  const recent = (transactions || []).slice(0, 5)
  return (
    <div className="space-y-5 pb-4">
      <div>
        <p className="text-xs text-slate-500">Welcome back</p>
        <h2 className="text-xl font-extrabold">+91 {user?.mobile}</h2>
      </div>

      <div className="rounded-3xl p-5 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 shadow-xl shadow-violet-600/25 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
        <div className="flex items-center gap-2 text-white/70 text-xs"><Wallet className="w-3.5 h-3.5" /> Money Wallet</div>
        <p className="text-3xl font-extrabold mt-1.5" data-testid="money-balance">{fmtInr(wallet?.money?.available)}</p>
        <div className="flex items-center gap-4 mt-2 text-[11px] text-white/70">
          <span>Pending: <b className="text-white">{fmtInr(wallet?.money?.pending)}</b></span>
        </div>
      </div>

      <div className="rounded-3xl p-5 border border-white/10 bg-white/[0.04] relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs"><DollarSign className="w-3.5 h-3.5" /> Point Wallet ($Dollar)</div>
            <p className="text-2xl font-extrabold mt-1 bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent" data-testid="dollar-balance">{fmtDollar(wallet?.dollar?.balance)}</p>
          </div>
          <div className="text-right text-[11px] text-slate-500">Pending<br /><b className="text-slate-300">{fmtDollar(wallet?.dollar?.pending)}</b></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <button data-testid="action-add-money" onClick={() => onAction('addMoney')} className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center"><Plus className="w-5 h-5 text-emerald-400" /></div>
          <span className="text-[11px] font-bold">ADD MONEY</span>
        </button>
        <button data-testid="action-buy" onClick={() => onAction('buy')} className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-indigo-400" /></div>
          <span className="text-[11px] font-bold">BUY $DOLLAR</span>
        </button>
        <button data-testid="action-sell" onClick={() => onAction('sell')} className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]">
          <div className="w-10 h-10 rounded-xl bg-fuchsia-500/15 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-fuchsia-400" /></div>
          <span className="text-[11px] font-bold">SELL $DOLLAR</span>
        </button>
      </div>

      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-400" /> Pending Transactions</h3>
          <Card className="px-4 divide-y divide-white/5">
            {pending.slice(0, 3).map((t) => <TxnRow key={t.id} txn={t} />)}
          </Card>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold mb-2">Recent Transactions</h3>
        {recent.length === 0 ? (
          <Card><EmptyState icon={Wallet} text="No transactions yet. Add money to get started!" /></Card>
        ) : (
          <Card className="px-4 divide-y divide-white/5">
            {recent.map((t) => <TxnRow key={t.id} txn={t} />)}
          </Card>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold mb-2">Join our Community</h3>
        <CommunityLinks compact />
      </div>
    </div>
  )
}

// ============ WALLET TAB ============
const WalletTab = ({ wallet }) => {
  const [tab, setTab] = useState('all')
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (t) => {
    setLoading(true)
    try {
      if (t === 'all') { const d = await api('/transactions'); setData((p) => ({ ...p, all: d.transactions })) }
      else if (t === 'deposits') { const d = await api('/deposits'); setData((p) => ({ ...p, deposits: d.deposits })) }
      else if (t === 'buy') { const d = await api('/orders?type=BUY'); setData((p) => ({ ...p, buy: d.orders })) }
      else if (t === 'sell') { const d = await api('/orders?type=SELL'); setData((p) => ({ ...p, sell: d.orders })) }
      else if (t === 'withdrawals') { const d = await api('/withdrawals'); setData((p) => ({ ...p, withdrawals: d.withdrawals })) }
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  const OrderRow = ({ o }) => (
    <div className="flex items-center gap-3 py-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${o.type === 'BUY' ? 'text-indigo-400 bg-indigo-500/10' : 'text-fuchsia-400 bg-fuchsia-500/10'}`}>
        {o.type === 'BUY' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{o.type === 'BUY' ? 'Buy' : 'Sell'} {fmtDollar(o.dollars)} @ ₹{o.rate}/$</p>
        <p className="text-[11px] text-slate-500">{fmtDate(o.createdAt)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold">{fmtInr(o.amountInr)}</p>
        <StatusBadge status={o.status} />
      </div>
    </div>
  )

  return (
    <div className="space-y-5 pb-4">
      <h2 className="text-xl font-extrabold">Wallet</h2>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl p-4 bg-gradient-to-br from-indigo-600 to-violet-600">
          <p className="text-[11px] text-white/70">Available Balance</p>
          <p className="text-xl font-extrabold mt-0.5">{fmtInr(wallet?.money?.available)}</p>
          <p className="text-[10px] text-white/60 mt-1">Pending: {fmtInr(wallet?.money?.pending)}</p>
        </div>
        <div className="rounded-2xl p-4 border border-white/10 bg-white/[0.04]">
          <p className="text-[11px] text-slate-400">$Dollar Points</p>
          <p className="text-xl font-extrabold mt-0.5 text-fuchsia-400">{fmtDollar(wallet?.dollar?.balance)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Pending: {fmtDollar(wallet?.dollar?.pending)}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full bg-white/5 border border-white/10 h-auto p-1 grid grid-cols-5">
          {[['all', 'All'], ['deposits', 'Deposits'], ['buy', 'Buys'], ['sell', 'Sells'], ['withdrawals', 'Payouts']].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="text-[10px] py-1.5 data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-300 text-slate-400">{l}</TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-3">
          {loading && !data[tab] ? <Spinner /> : (
            <>
              <TabsContent value="all">
                {(data.all || []).length === 0 ? <Card><EmptyState icon={Wallet} text="No transactions yet" /></Card> : (
                  <Card className="px-4 divide-y divide-white/5">{(data.all || []).map((t) => <TxnRow key={t.id} txn={t} />)}</Card>
                )}
              </TabsContent>
              <TabsContent value="deposits">
                {(data.deposits || []).length === 0 ? <Card><EmptyState icon={ArrowDownToLine} text="No deposits yet" /></Card> : (
                  <Card className="px-4 divide-y divide-white/5">
                    {(data.deposits || []).map((d) => (
                      <div key={d.id} className="flex items-center gap-3 py-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400"><ArrowDownToLine className="w-5 h-5" /></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">UPI Deposit {d.utr ? `• UTR ${d.utr}` : ''}</p>
                          <p className="text-[11px] text-slate-500">{fmtDate(d.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{fmtInr(d.amount)}</p>
                          <StatusBadge status={d.status} />
                        </div>
                      </div>
                    ))}
                  </Card>
                )}
              </TabsContent>
              <TabsContent value="buy">
                {(data.buy || []).length === 0 ? <Card><EmptyState icon={TrendingUp} text="No buy orders yet" /></Card> : (
                  <Card className="px-4 divide-y divide-white/5">{(data.buy || []).map((o) => <OrderRow key={o.id} o={o} />)}</Card>
                )}
              </TabsContent>
              <TabsContent value="sell">
                {(data.sell || []).length === 0 ? <Card><EmptyState icon={TrendingDown} text="No sell orders yet" /></Card> : (
                  <Card className="px-4 divide-y divide-white/5">{(data.sell || []).map((o) => <OrderRow key={o.id} o={o} />)}</Card>
                )}
              </TabsContent>
              <TabsContent value="withdrawals">
                {(data.withdrawals || []).length === 0 ? <Card><EmptyState icon={ArrowUpFromLine} text="No withdrawals yet" /></Card> : (
                  <Card className="px-4 divide-y divide-white/5">
                    {(data.withdrawals || []).map((w) => (
                      <div key={w.id} className="flex items-center gap-3 py-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400"><ArrowUpFromLine className="w-5 h-5" /></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Withdrawal • {w.bank?.bankName}</p>
                          <p className="text-[11px] text-slate-500">{w.bank?.accountNumberMasked} • {fmtDate(w.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{fmtInr(w.amount)}</p>
                          <StatusBadge status={w.status} />
                        </div>
                      </div>
                    ))}
                  </Card>
                )}
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  )
}

// ============ PROFILE TAB ============
const ProfileTab = ({ user, wallet, onLogout, onWalletRefresh }) => {
  const [bank, setBank] = useState(undefined)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ accountHolder: '', bankName: '', accountNumber: '', ifsc: '', upiId: '' })
  const [saving, setSaving] = useState(false)
  const [wdAmount, setWdAmount] = useState('')
  const [wdOpen, setWdOpen] = useState(false)
  const [wdLoading, setWdLoading] = useState(false)

  const loadBank = useCallback(() => {
    api('/bank-details').then((d) => setBank(d.bankDetails)).catch(() => setBank(null))
  }, [])
  useEffect(() => { loadBank() }, [loadBank])

  const saveBank = async () => {
    setSaving(true)
    try {
      await api('/bank-details', { method: 'PUT', body: form })
      toast.success('Bank details saved')
      setEditing(false); loadBank()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const requestWithdrawal = async () => {
    setWdLoading(true)
    try {
      const d = await api('/withdrawals', { method: 'POST', body: { amount: Number(wdAmount) } })
      toast.success(d.message)
      setWdOpen(false); setWdAmount(''); onWalletRefresh()
    } catch (e) { toast.error(e.message) } finally { setWdLoading(false) }
  }

  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch (e) {}
    clearTokens()
    onLogout()
  }

  return (
    <div className="space-y-5 pb-4">
      <h2 className="text-xl font-extrabold">Profile</h2>

      <Card className="p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-xl font-extrabold">
          {user?.mobile?.slice(-2)}
        </div>
        <div>
          <p className="font-bold" data-testid="profile-mobile">+91 {user?.mobile}</p>
          <p className="text-[11px] text-slate-500">Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : ''}</p>
        </div>
      </Card>

      {/* Bank Details */}
      <div>
        <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5"><Landmark className="w-4 h-4 text-indigo-400" /> Bank Details</h3>
        <Card className="p-5">
          {bank === undefined ? <Spinner /> : editing || bank === null ? (
            <div className="space-y-3">
              {[['accountHolder', 'Account Holder Name', 'text'], ['bankName', 'Bank Name', 'text'], ['accountNumber', 'Account Number', 'tel'], ['ifsc', 'IFSC Code', 'text'], ['upiId', 'UPI ID (optional)', 'text']].map(([k, label, type]) => (
                <div key={k}>
                  <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                  <Input data-testid={`bank-${k}-input`} type={type} value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white" placeholder={label} />
                </div>
              ))}
              <div className="flex gap-2">
                {bank !== null && <Button variant="ghost" className="flex-1 bg-white/5" onClick={() => setEditing(false)}>Cancel</Button>}
                <Button data-testid="bank-save-btn" onClick={saveBank} disabled={saving} className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-600 font-bold">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Bank Details'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm" data-testid="bank-details-view">
              <div className="flex justify-between"><span className="text-slate-500">Account Holder</span><span className="font-semibold">{bank.accountHolder}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Bank</span><span className="font-semibold">{bank.bankName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Account No.</span><span className="font-mono">{bank.accountNumberMasked}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">IFSC</span><span className="font-mono">{bank.ifsc}</span></div>
              {bank.upiIdMasked && <div className="flex justify-between"><span className="text-slate-500">UPI ID</span><span className="font-mono">{bank.upiIdMasked}</span></div>}
              <Button variant="ghost" className="w-full mt-2 bg-white/5 text-xs" onClick={() => { setEditing(true); setForm({ accountHolder: bank.accountHolder, bankName: bank.bankName, accountNumber: '', ifsc: bank.ifsc, upiId: '' }) }}>Edit Details</Button>
            </div>
          )}
        </Card>
      </div>

      {/* Withdrawal */}
      <div>
        <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5"><ArrowUpFromLine className="w-4 h-4 text-rose-400" /> Withdraw Money</h3>
        <Card className="p-5">
          <p className="text-xs text-slate-500 mb-3">Available: <b className="text-white">{fmtInr(wallet?.money?.available)}</b> • Min ₹100 • Settled to your saved bank account</p>
          <div className="flex gap-2">
            <Input data-testid="withdraw-amount-input" type="number" inputMode="numeric" placeholder="Amount (₹)" value={wdAmount}
              onChange={(e) => setWdAmount(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            <Button data-testid="withdraw-btn" onClick={() => { if (!Number(wdAmount) || Number(wdAmount) < 100) return toast.error('Minimum withdrawal is ₹100'); if (!bank) return toast.error('Add your bank details first'); setWdOpen(true) }}
              className="bg-gradient-to-r from-rose-500 to-pink-600 font-bold shrink-0">Withdraw</Button>
          </div>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-bold mb-2">Community</h3>
        <CommunityLinks />
      </div>

      <Button data-testid="logout-btn" onClick={logout} variant="ghost" className="w-full h-11 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 font-bold">
        <LogOut className="w-4 h-4 mr-2" /> Logout
      </Button>

      <Dialog open={wdOpen} onOpenChange={setWdOpen}>
        <DialogContent className="bg-[#0d0f1e] border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Confirm Withdrawal</DialogTitle>
            <DialogDescription className="text-slate-400">
              Withdraw {fmtInr(Number(wdAmount))} to {bank?.bankName} ({bank?.accountNumberMasked})? Amount will be deducted immediately and settled after processing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1 bg-white/5" onClick={() => setWdOpen(false)}>Cancel</Button>
            <Button data-testid="withdraw-confirm-btn" onClick={requestWithdrawal} disabled={wdLoading} className="flex-1 bg-gradient-to-r from-rose-500 to-pink-600 font-bold">
              {wdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ NOTIFICATIONS OVERLAY ============
const NOTIF_ICONS = {
  DEPOSIT_VERIFIED: { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10' },
  DEPOSIT_REJECTED: { icon: XCircle, color: 'text-rose-400 bg-rose-500/10' },
  BUY_APPROVED: { icon: CheckCircle2, color: 'text-indigo-400 bg-indigo-500/10' },
  BUY_REJECTED: { icon: XCircle, color: 'text-rose-400 bg-rose-500/10' },
  SELL_APPROVED: { icon: CheckCircle2, color: 'text-fuchsia-400 bg-fuchsia-500/10' },
  SELL_REJECTED: { icon: XCircle, color: 'text-rose-400 bg-rose-500/10' },
  WITHDRAWAL_COMPLETED: { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10' },
  WELCOME: { icon: Bell, color: 'text-violet-400 bg-violet-500/10' },
}

const NotificationsOverlay = ({ onClose }) => {
  const [items, setItems] = useState(null)
  useEffect(() => {
    api('/notifications').then((d) => {
      setItems(d.notifications || [])
      if (d.unread > 0) api('/notifications/mark-read', { method: 'POST' }).catch(() => {})
    }).catch(() => setItems([]))
  }, [])
  return (
    <div className="fixed inset-0 z-50 bg-[#070812] overflow-y-auto">
      <div className="max-w-md mx-auto px-5 py-5 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button data-testid="notif-back-btn" onClick={onClose} className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
          <h2 className="font-bold">Notifications</h2>
        </div>
        {items === null ? <Spinner /> : items.length === 0 ? (
          <EmptyState icon={Bell} text="No notifications yet" />
        ) : (
          <div className="space-y-2.5" data-testid="notifications-list">
            {items.map((n) => {
              const meta = NOTIF_ICONS[n.type] || NOTIF_ICONS.WELCOME
              const Icon = meta.icon
              return (
                <Card key={n.id} className={`p-4 flex gap-3 ${!n.read ? 'border-indigo-500/30' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}><Icon className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{n.message}</p>
                    <p className="text-[10px] text-slate-600 mt-1">{fmtDate(n.createdAt)}</p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0 mt-1.5" />}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============ MAIN APP ============
const NAV = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'buy', label: 'Buy', icon: TrendingUp },
  { id: 'sell', label: 'Sell', icon: TrendingDown },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'profile', label: 'Profile', icon: User },
]

const MainApp = ({ user, onLogout }) => {
  const [tab, setTab] = useState('home')
  const [overlay, setOverlay] = useState(null) // 'addMoney' | 'notifications'
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [unread, setUnread] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const [w, t, n] = await Promise.all([
        api('/wallet'),
        api('/transactions?limit=20'),
        api('/notifications'),
      ])
      setWallet(w)
      setTransactions(t.transactions || [])
      setUnread(n.unread || 0)
    } catch (e) { /* silent */ }
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 15000)
    return () => clearInterval(iv)
  }, [refresh])

  useEffect(() => { refresh() }, [tab, overlay, refresh])

  const handleAction = (a) => {
    if (a === 'addMoney') setOverlay('addMoney')
    else setTab(a)
  }

  return (
    <div className="min-h-screen max-w-md mx-auto relative">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#070812]/90 backdrop-blur-lg border-b border-white/5">
        <div className="px-5 py-3.5 flex items-center justify-between">
          <Logo />
          <button data-testid="notifications-btn" onClick={() => setOverlay('notifications')} className="relative w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
            <Bell className="w-4.5 h-4.5 w-5 h-5" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-bold flex items-center justify-center" data-testid="unread-badge">{unread}</span>
            )}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="px-5 pt-5 pb-28">
        {tab === 'home' && <HomeTab user={user} wallet={wallet} transactions={transactions} onAction={handleAction} />}
        {tab === 'buy' && <TradeTab type="BUY" wallet={wallet} onTraded={refresh} />}
        {tab === 'sell' && <TradeTab type="SELL" wallet={wallet} onTraded={refresh} />}
        {tab === 'wallet' && <WalletTab wallet={wallet} />}
        {tab === 'profile' && <ProfileTab user={user} wallet={wallet} onLogout={onLogout} onWalletRefresh={refresh} />}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-md mx-auto bg-[#0b0d1c]/95 backdrop-blur-xl border-t border-white/10 px-2 pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5">
            {NAV.map((n) => {
              const Icon = n.icon
              const active = tab === n.id
              return (
                <button key={n.id} data-testid={`nav-${n.id}`} onClick={() => setTab(n.id)}
                  className="flex flex-col items-center gap-1 py-2.5 relative">
                  {active && <span className="absolute top-0 w-8 h-0.5 rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400" />}
                  <Icon className={`w-5 h-5 ${active ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className={`text-[10px] font-semibold ${active ? 'text-indigo-300' : 'text-slate-600'}`}>{n.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Overlays */}
      {overlay === 'addMoney' && <AddMoneyOverlay onClose={() => setOverlay(null)} onDone={() => { setOverlay(null); refresh() }} />}
      {overlay === 'notifications' && <NotificationsOverlay onClose={() => { setOverlay(null); refresh() }} />}
    </div>
  )
}

// ============ ROOT ============
const App = () => {
  const [user, setUser] = useState(null)
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    const boot = async () => {
      const { access, refresh } = getTokens()
      if (access || refresh) {
        try {
          const d = await api('/auth/me')
          setUser(d.user)
        } catch (e) { clearTokens() }
      }
      setBooted(true)
    }
    boot()
    const onLogout = () => setUser(null)
    window.addEventListener('dd-logout', onLogout)
    return () => window.removeEventListener('dd-logout', onLogout)
  }, [])

  return (
    <>
      <Toaster position="top-center" theme="dark" richColors />
      {!booted ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Logo size="lg" />
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          </div>
        </div>
      ) : user ? (
        <MainApp user={user} onLogout={() => setUser(null)} />
      ) : (
        <AuthScreen onAuthed={setUser} />
      )}
    </>
  )
}

export default App
