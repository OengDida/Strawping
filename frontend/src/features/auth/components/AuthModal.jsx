import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle, X } from 'lucide-react';
import { useEscape } from '../../../shared/hooks/index.js';
import { useScrollLock } from '../../../shared/hooks/index.js';
import { signInWithGoogle, signInWithPassword, signUp } from '../supabase.js';

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" className="h-[18px] w-[18px]">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.88c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.33 37.92 46.98 31.8 46.98 24.55Z" />
    <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.15 1.45-4.9 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
  </svg>;
}

function friendlyError(error) {
  const message = String(error?.message || 'Something went wrong. Please try again.');
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials') || normalized.includes('invalid_credentials')) {
    return 'That email and password do not match. Check them and try again.';
  }
  if (normalized.includes('email not confirmed')) return 'Please confirm your email address before logging in.';
  if (normalized.includes('already registered') || normalized.includes('user already registered')) {
    return 'An account already exists for this email. Try logging in instead.';
  }
  if (normalized.includes('password should be at least') || normalized.includes('password must be')) return message;
  if (normalized.includes('failed to fetch') || normalized.includes('network')) return 'Could not reach the authentication service. Check your connection and try again.';
  return message;
}

export default function AuthModal({ open, onClose, onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEscape(open, onClose);
  useScrollLock(open);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setNotice('');
  };

  const submitEmail = async (event) => {
    event.preventDefault();
    setBusy('email');
    setError('');
    setNotice('');
    try {
      if (mode === 'login') {
        await signInWithPassword(email.trim(), password);
        onAuthenticated?.();
      } else {
        const data = await signUp(email.trim(), password, displayName);
        if (data.session) onAuthenticated?.();
        else setNotice('Account created. Check your inbox for a confirmation link, then log in.');
      }
    } catch (authError) {
      setError(friendlyError(authError));
    } finally {
      setBusy('');
    }
  };

  const continueWithGoogle = async () => {
    setBusy('google');
    setError('');
    setNotice('');
    try {
      await signInWithGoogle();
    } catch (authError) {
      setError(friendlyError(authError));
      setBusy('');
    }
  };

  return <AnimatePresence>
    {open && <motion.div
      key="auth-backdrop"
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/35 px-4 py-8 backdrop-blur-[6px] dark:bg-black/65"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="glass-panel relative w-full max-w-md rounded-[1.75rem] px-6 pb-7 pt-6 shadow-lift sm:px-8 sm:pb-8 sm:pt-7"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.24 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Close sign in" className="focus-ring absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-mute transition hover:bg-surface/70 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
        <div className="mb-6 pr-10">
          <span className="mb-4 grid h-9 w-9 place-items-center rounded-xl bg-ink text-sm font-bold text-onsolid">S</span>
          <p className="eyebrow">Strawping account</p>
          <h2 id="auth-title" className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-mute">
            {mode === 'login' ? 'Sign in to continue to your account.' : 'Sign up to make your next visit even easier.'}
          </p>
        </div>

        <button type="button" onClick={continueWithGoogle} disabled={Boolean(busy)} className="focus-ring flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-ink/10 bg-surface/70 text-sm font-medium transition hover:bg-surface disabled:cursor-wait disabled:opacity-65">
          {busy === 'google' ? <LoaderCircle className="h-[18px] w-[18px] animate-spin" /> : <GoogleMark />}
          {busy === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
        </button>

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-ink/10" />
          <span className="text-[10px] font-semibold tracking-[0.18em] text-mute">OR</span>
          <span className="h-px flex-1 bg-ink/10" />
        </div>

        <form onSubmit={submitEmail} className="space-y-4">
          {mode === 'signup' && <label className="block text-xs font-medium text-charcoal/75">
            Full name
            <input
              type="text"
              name="name"
              autoComplete="name"
              required
              maxLength={120}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your full name"
              className="mt-1.5 h-12 w-full rounded-xl border border-ink/10 bg-surface/60 px-3.5 text-sm text-ink outline-none transition placeholder:text-mute/70 focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
            />
          </label>}
          <label className="block text-xs font-medium text-charcoal/75">
            Email
            <input
              autoFocus
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 h-12 w-full rounded-xl border border-ink/10 bg-surface/60 px-3.5 text-sm text-ink outline-none transition placeholder:text-mute/70 focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
            />
          </label>
          <label className="block text-xs font-medium text-charcoal/75">
            Password
            <input
              type="password"
              name="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
              className="mt-1.5 h-12 w-full rounded-xl border border-ink/10 bg-surface/60 px-3.5 text-sm text-ink outline-none transition placeholder:text-mute/70 focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
            />
          </label>

          {error && <p role="alert" className="rounded-xl border border-red-500/15 bg-red-500/[0.07] px-3.5 py-3 text-sm leading-relaxed text-red-700 dark:text-red-300">{error}</p>}
          {notice && <p role="status" className="rounded-xl border border-green-600/15 bg-green-600/[0.07] px-3.5 py-3 text-sm leading-relaxed text-green-800 dark:text-green-300">{notice}</p>}

          <button type="submit" disabled={Boolean(busy)} className="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-onsolid transition hover:opacity-90 disabled:cursor-wait disabled:opacity-65">
            {busy === 'email' && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {busy === 'email' ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : (mode === 'login' ? 'Log in' : 'Sign up')}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-mute">
          {mode === 'login' ? 'New to Strawping?' : 'Already have an account?'}{' '}
          <button type="button" onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')} className="focus-ring rounded-sm font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition hover:decoration-accent">
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
      </motion.section>
    </motion.div>}
  </AnimatePresence>;
}
