import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle, X } from 'lucide-react';
import { useEscape, useScrollLock } from '../../../shared/hooks/index.js';
import { saveMyProfile, updateMyEmail, updateMyPassword } from '../accountService.js';

function errorText(error) {
  if (error?.code === '23505' || /duplicate key|already exists/i.test(error?.message || '')) return 'That username is already taken.';
  return error?.message || 'Could not save your changes. Please try again.';
}

export default function AccountSettingsModal({ open, onClose, user, profile, onProfileUpdated }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEscape(open, onClose);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setUsername(profile?.username || '');
    setDisplayName(profile?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '');
    setEmail(user?.email || '');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setNotice('');
  }, [open, profile, user]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy('profile'); setError(''); setNotice('');
    const normalizedUsername = username.trim().toLowerCase().replace(/^@/, '');
    const normalizedName = displayName.trim();
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      setBusy(''); setError('Username must be 3–30 characters using letters, numbers, or underscores.'); return;
    }
    if (!normalizedName) { setBusy(''); setError('Enter a display name.'); return; }
    try {
      const saved = await saveMyProfile(user.id, { username: normalizedUsername, displayName: normalizedName });
      onProfileUpdated?.(saved);
      setNotice('Profile updated.');
    } catch (saveError) { setError(errorText(saveError)); }
    finally { setBusy(''); }
  };

  const saveEmail = async (event) => {
    event.preventDefault(); setBusy('email'); setError(''); setNotice('');
    if (!email.trim() || email.trim().toLowerCase() === (user?.email || '').toLowerCase()) {
      setBusy(''); setError('Enter a different email address.'); return;
    }
    try {
      await updateMyEmail(email.trim());
      setNotice('Email change requested. Follow the confirmation link sent by Supabase to finish updating it.');
    } catch (saveError) { setError(errorText(saveError)); }
    finally { setBusy(''); }
  };

  const savePassword = async (event) => {
    event.preventDefault(); setBusy('password'); setError(''); setNotice('');
    if (password.length < 8) { setBusy(''); setError('Use a password with at least 8 characters.'); return; }
    if (password !== confirmPassword) { setBusy(''); setError('The passwords do not match.'); return; }
    try {
      await updateMyPassword(password);
      setPassword(''); setConfirmPassword(''); setNotice('Password updated.');
    } catch (saveError) { setError(errorText(saveError)); }
    finally { setBusy(''); }
  };

  const button = (key, label) => <button type="submit" disabled={Boolean(busy)} className="focus-ring flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-onsolid transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
    {busy === key && <LoaderCircle className="h-4 w-4 animate-spin" />}{busy === key ? 'Saving…' : label}
  </button>;
  const inputClass = 'mt-1.5 h-11 w-full rounded-xl border border-ink/10 bg-surface/60 px-3.5 text-sm text-ink outline-none transition placeholder:text-mute/70 focus:border-accent/70 focus:ring-2 focus:ring-accent/15';

  return <AnimatePresence>
    {open && <motion.div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/35 px-4 py-8 backdrop-blur-[6px] dark:bg-black/65" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.section role="dialog" aria-modal="true" aria-labelledby="account-settings-title" className="glass-panel relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[1.75rem] p-6 shadow-lift sm:p-8" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close settings" className="focus-ring absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-mute transition hover:bg-surface/70 hover:text-ink"><X className="h-4 w-4" /></button>
        <p className="eyebrow">Your account</p><h2 id="account-settings-title" className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">Settings</h2>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/15 bg-red-500/[0.07] px-3.5 py-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl border border-green-600/15 bg-green-600/[0.07] px-3.5 py-3 text-sm text-green-800 dark:text-green-300">{notice}</p>}
        <form onSubmit={saveProfile} className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold">Profile</h3>
          <label className="block text-xs font-medium text-charcoal/75">Username<input required minLength={3} maxLength={30} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className={inputClass} placeholder="rider_name" /></label>
          <label className="block text-xs font-medium text-charcoal/75">Display name<input required maxLength={120} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClass} placeholder="Your name" /></label>
          {button('profile', 'Save profile')}
        </form>
        <form onSubmit={saveEmail} className="mt-6 space-y-3 border-t border-ink/[.08] pt-5">
          <h3 className="text-sm font-semibold">Email address</h3>
          <label className="block text-xs font-medium text-charcoal/75">New email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label>
          {button('email', 'Update email')}
        </form>
        <form onSubmit={savePassword} className="mt-6 space-y-3 border-t border-ink/[.08] pt-5">
          <h3 className="text-sm font-semibold">Change password</h3>
          <label className="block text-xs font-medium text-charcoal/75">New password<input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} /></label>
          <label className="block text-xs font-medium text-charcoal/75">Confirm new password<input required type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} /></label>
          {button('password', 'Update password')}
        </form>
      </motion.section>
    </motion.div>}
  </AnimatePresence>;
}
