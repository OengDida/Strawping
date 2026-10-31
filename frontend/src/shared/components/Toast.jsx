import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Toast({ toast, onDismiss, onView }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onDismiss, 2800);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 sm:bottom-6" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="glass-dark pointer-events-auto flex max-w-full items-center gap-3 rounded-full p-1.5 pr-1.5 text-sm"
          >
            <img src={toast.product.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            <span className="min-w-0 truncate">
              <span className="text-onsolid/60">Added </span>
              {toast.product.name}
              {toast.size !== 'One size' && <span className="text-onsolid/60"> · {toast.size}</span>}
              {toast.qty > 1 && <span className="text-onsolid/60"> × {toast.qty}</span>}
            </span>
            <button type="button" onClick={onView} className="focus-ring shrink-0 rounded-full bg-onsolid px-3.5 py-2 text-xs font-medium text-ink transition hover:bg-onsolid/90">
              View bag
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
