import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import GlassButton from '../../../shared/components/GlassButton.jsx';
import { ease } from '../../../shared/motion.js';
import { formatPrice } from '../model.js';
import { getResponsiveImageSources } from '../imageSources.js';

const line = {
  hidden: { y: '110%' },
  show: (i) => ({ y: '0%', transition: { duration: 1.1, ease, delay: 0.15 + i * 0.12 } }),
};

const fadeUp = (delay) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, ease, delay },
});

const Hero = forwardRef(function Hero({ onExplore, featured, onFeatured }, ref) {
  const heroImage = featured?.image ||
    'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1000&q=85';
  const { src: heroSrc, srcSet: heroSrcSet } = getResponsiveImageSources(heroImage, {
    widths: [480, 640, 960, 1280],
    aspectRatio: 4 / 5,
    quality: 75,
    fallbackWidth: 640,
  });

  return (
    <section id="top" ref={ref} className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-48 -top-48 h-[620px] w-[620px] rounded-full bg-accent/[0.13] dark:bg-accent/[0.16] blur-[130px] max-md:hidden" />
      <div aria-hidden className="pointer-events-none absolute -left-48 top-1/2 h-[480px] w-[480px] rounded-full bg-alloy/40 blur-[130px] max-md:hidden" />

      <div className="relative mx-auto grid min-h-screen min-h-[100svh] max-w-7xl items-center gap-14 px-5 pb-16 pt-28 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <motion.p {...fadeUp(0)} className="eyebrow mb-8 flex items-center gap-3">
            <span className="h-px w-8 bg-accent" /> Made by riders,
          </motion.p>

          <h1 className="text-[clamp(3.25rem,9.5vw,8.5rem)] font-semibold leading-[0.9] tracking-tightest">
            {['Strawp', 'Moto'].map((t, i) => (
              <span key={t} className="block overflow-hidden pb-[0.08em]">
                <motion.span className="block" variants={line} initial="hidden" animate="show" custom={i}>
                  {t}
                  {i === 1 && <span className="text-accent">.</span>}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p {...fadeUp(0.5)} className="mt-8 max-w-md text-lg leading-relaxed text-charcoal/70">
            Helmets, gloves, luggage and armour — selected for fit, finish and certified protection.
          </motion.p>

          <motion.div {...fadeUp(0.65)} className="mt-10 flex flex-wrap items-center gap-5">
            <GlassButton onClick={onExplore}>
              Explore Gear <ArrowRight className="h-4 w-4" />
            </GlassButton>
            <span className="text-sm text-mute">Pay on delivery · Cambodia</span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, ease, delay: 0.25 }}
          className="lg:col-span-5"
        >
          <div
            className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[2rem] bg-stone shadow-lift lg:max-w-none"
          >
            <motion.img
              src={heroSrc}
              srcSet={heroSrcSet}
              sizes="(max-width: 1023px) 92vw, 40vw"
              alt={featured ? `${featured.name} ${featured.type}` : 'Motorcycle equipment'}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              width="640"
              height="800"
              style={{ scale: 1.08 }}
              className="h-full w-full object-cover dark:brightness-[.9]"
            />
            <button
              type="button"
              onClick={onFeatured}
              className="glass focus-ring group absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-2xl p-3 pl-4 text-left transition duration-500 hover:-translate-y-0.5"
            >
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-[0.18em] text-charcoal/60">Featured</span>
                <span className="mt-0.5 block truncate font-medium">
                  {featured?.name || 'Explore the collection'} <span className="font-normal text-charcoal/60">{featured?.type ? `· ${featured.type}` : ''}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="tabular-nums">{featured ? formatPrice(featured.price) : 'Shop now'}</span>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-onsolid transition-transform duration-500 group-hover:-rotate-45">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
});

export default Hero;
