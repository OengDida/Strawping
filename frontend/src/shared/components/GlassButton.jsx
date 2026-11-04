/** Lightweight glass action button; CSS handles interaction without a motion runtime. */
export default function GlassButton({ children, variant = 'dark', className = '', onClick, ...rest }) {
  return (
    <button type="button" onClick={onClick}
      className={`focus-ring relative inline-flex h-12 items-center justify-center overflow-hidden rounded-full px-7 text-sm font-medium transition-transform duration-200 active:scale-[.97] ${variant === 'dark' ? 'glass-dark' : 'glass text-ink'} ${className}`}
      {...rest}>
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
