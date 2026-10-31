import { Truck, RotateCcw, ShieldCheck } from 'lucide-react';
import Reveal from './Reveal.jsx';
import { formatPrice, FREE_SHIPPING_THRESHOLD } from '../data.js';

const POINTS = [
  { icon: Truck, title: 'Shipping', text: `Free over ${formatPrice(FREE_SHIPPING_THRESHOLD)}. Dispatched within 24 hours.` },
  { icon: RotateCcw, title: 'Returns', text: '30 days, unworn and in original packaging.' },
  { icon: ShieldCheck, title: 'Warranty', text: 'Two years on every product we sell.' },
];

export default function About() {
  return (
    <section id="about" className="scroll-mt-20 border-t border-ink/[0.06]">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 py-24 sm:py-32 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:col-span-5">
          <p className="eyebrow">About</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            A small shop<br />for serious riders.
          </h2>
          <p className="mt-6 max-w-md leading-relaxed text-charcoal/70">
            Strawp Moto stocks a short, considered range. Every piece is certified, tested on the road and chosen to outlast trends.
          </p>
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-3 lg:col-span-7 lg:self-end">
          {POINTS.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className="group h-full rounded-3xl border border-ink/[0.06] bg-surface/40 p-6 transition duration-500 hover:-translate-y-1 hover:border-surface/70 dark:hover:border-white/10 hover:bg-surface/70 hover:shadow-lift">
                <Icon className="h-5 w-5 text-accent" strokeWidth={1.8} />
                <p className="mt-8 font-medium">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-mute">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
