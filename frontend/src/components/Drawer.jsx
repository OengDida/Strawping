import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft } from 'lucide-react';
import { useEscape } from '../hooks.js';
import { drawerSpring } from '../motion.js';

/** Right-hand slide-out panel with a blurred backdrop. */
export default function Drawer({ open, onClose, title, onBack, footer, children }) {
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" key="drawer">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/25 dark:bg-black/55 backdrop-blur-[6px]"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: '105%' }}
            animate={{ x: 0 }}
            exit={{ x: '105%' }}
            transition={drawerSpring}
            className="glass-panel absolute inset-y-0 right-0 flex w-full max-w-md flex-col sm:inset-y-3 sm:right-3 sm:rounded-[1.75rem]"
          >
            <div className="flex h-16 shrink-0 items-center gap-2 border-b border-ink/[0.06] px-4 sm:px-5">
              {onBack && (
                <button type="button" onClick={onBack} aria-label="Back" className="focus-ring -ml-1 grid h-9 w-9 place-items-center rounded-full transition hover:bg-surface/70">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <h2 className="flex-1 text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                autoFocus
                aria-label="Close"
                className="glass focus-ring grid h-9 w-9 place-items-center rounded-full transition duration-300 hover:rotate-90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="no-scrollbar relative flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
            {footer && <div className="shrink-0 border-t border-ink/[0.06] p-4 sm:p-5">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
