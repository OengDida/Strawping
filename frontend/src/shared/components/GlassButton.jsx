import { useState } from 'react';
import { motion } from 'framer-motion';

/** Pill button with a fluid glass ripple emanating from the pointer. */
export default function GlassButton({ children, variant = 'dark', className = '', onClick, ...rest }) {
  const [ripples, setRipples] = useState([]);

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const x = (e.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
    const y = (e.clientY || rect.top + rect.height / 2) - rect.top - size / 2;
    const id = `${Date.now()}-${Math.random()}`;
    setRipples((r) => [...r, { id, x, y, size }]);
    setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 800);
    onClick?.(e);
  };

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      onClick={handleClick}
      className={`focus-ring relative inline-flex h-12 items-center justify-center overflow-hidden rounded-full px-7 text-sm font-medium ${
        variant === 'dark' ? 'glass-dark' : 'glass text-ink'
      } ${className}`}
      {...rest}
    >
      {ripples.map((r) => (
        <span key={r.id} className="ripple" style={{ left: r.x, top: r.y, width: r.size, height: r.size }} />
      ))}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </motion.button>
  );
}
