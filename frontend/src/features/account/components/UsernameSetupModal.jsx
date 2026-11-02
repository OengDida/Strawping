import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle, X } from 'lucide-react';
import { useEscape, useScrollLock } from '../../../shared/hooks/index.js';
import { saveMyUsername } from '../accountService.js';

function errorText(error) {
  if (error?.code === '23505' || /duplicate key|already exists/i.test(error?.message || '')) {
    return 'That username is already taken.';
  }
  return error?.message || 'Could not save your username. Please try again.';
}

export default function UsernameSetupModal({ open, onClose, user, onSaved }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEscape(open, onClose);
  useScrollLock(open);

  const save = async (event) => {
    event.preventDefault();
    const normalizedUsername = username.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      setError('Username must be 3–30 characters using letters, numbers, or underscores.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const profile = await saveMyUsername(user.id, normalizedUsername);
      onSaved?.(profile);
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'mt-1.5 h-12 w-full rounded-xl border border-ink/10 bg-surface/60 px-3.5 text-sm text-ink outline-none transition placeholder:text-mute/70 focus:border-accent/70 focus:ring-2 focus:ring-accent/15';

  return <AnimatePresence>
    {open && <motion.div
      className="fixed inset-0 z-[65] grid place-items-center overflow-y-auto bg-black/35 px-4 py-8 backdrop-blur-[6px] dark:bg-black/65"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose?.(); }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="username-setup-title"
        aria-describedby="username-setup-description"
        className="glass-panel relative w-full max-w-md rounded-[1.75rem] p-6 shadow-lift sm:p-8"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Not now"
          className="focus-ring absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-mute transition hover:bg-surface/70 hover:text-ink disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="eyebrow">One last step</p>
        <h2 id="username-setup-title" className="mt-1.5 pr-10 text-2xl font-semibold tracking-[-0.04em]">Choose your username</h2>
        <p id="username-setup-description" className="mt-2 text-sm leading-relaxed text-mute">
          Pick a username for your account. You can always set it later in Settings.
        </p>
        <form onSubmit={save} className="mt-5 space-y-4">
          <label className="block text-xs font-medium text-charcoal/75">
            Username
            <input
              autoFocus
              type="text"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9_]{3,30}"
              value={username}
              onChange={(event) => { setUsername(event.target.value); setError(''); }}
              placeholder="rider_name"
              className={inputClass}
            />
            <span className="mt-1.5 block text-[11px] text-mute">3–30 letters, numbers, or underscores.</span>
          </label>
          {error && <p role="alert" className="rounded-xl border border-red-500/15 bg-red-500/[.07] px-3.5 py-3 text-sm leading-relaxed text-red-700 dark:text-red-300">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="focus-ring h-11 rounded-xl border border-ink/10 px-4 text-sm font-medium text-ink transition hover:bg-surface/70 disabled:opacity-60"
            >
              Not now
            </button>
            <button
              type="submit"
              disabled={busy}
              className="focus-ring flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-sm font-semibold text-onsolid transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            >
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </motion.section>
    </motion.div>}
  </AnimatePresence>;
}