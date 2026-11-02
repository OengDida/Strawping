import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle, X } from 'lucide-react';
import { useEscape } from '../../../shared/hooks/index.js';
import { useScrollLock } from '../../../shared/hooks/index.js';
import { signInWithGoogle } from '../supabase.js';

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" className="h-[18px] w-[18px]">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.88c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.33 37.92 46.98 31.8 46.98 24.55Z" />
    <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.15 1.45-4.9 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
  </svg>;
}

function friendlyError(error) {
  const message = String(error?.message || '');
  const normalized = message.toLowerCase();
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'Could not reach the authentication service. Check your connection and try again.';
  }
  return message || 'Could not connect to Google. Please try again.';
}

export default function AuthModal({ open, onClose }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEscape(open, onClose);
  useScrollLock(open);

  const continueWithGoogle = async () => {
    setBusy('google');
    setError('');
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
          <h2 id="auth-title" className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">Sign in or create an account</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-mute">Continue securely with your Google account.</p>
        </div>

        <button type="button" onClick={continueWithGoogle} disabled={Boolean(busy)} className="focus-ring flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-ink/10 bg-surface/70 text-sm font-medium transition hover:bg-surface disabled:cursor-wait disabled:opacity-65">
          {busy === 'google' ? <LoaderCircle className="h-[18px] w-[18px] animate-spin" /> : <GoogleMark />}
          {busy === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
        </button>

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/15 bg-red-500/[.07] px-3.5 py-3 text-sm leading-relaxed text-red-700 dark:text-red-300">{error}</p>}
      </motion.section>
    </motion.div>}
  </AnimatePresence>;
}
