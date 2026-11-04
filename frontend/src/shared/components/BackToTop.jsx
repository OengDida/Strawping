import { ArrowUp } from 'lucide-react';
export default function BackToTop({ visible }) {
  if (!visible) return null;
  return <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    aria-label="Back to top" className="glass focus-ring fixed bottom-5 right-5 z-30 hidden h-12 w-12 place-items-center rounded-full transition hover:-translate-y-1 active:scale-95 sm:grid">
    <ArrowUp className="h-4 w-4" />
  </button>;
}
