import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ColdBoot } from './sections/ColdBoot';
import { TheDecision } from './sections/TheDecision';
import { AssumptionConsole } from './sections/AssumptionConsole';
import { CashFlowLedger } from './sections/CashFlowLedger';
import { MetricsGrid } from './sections/MetricsGrid';
import { useModelStore } from './store/useModelStore';
import { money } from './lib/format';
import { TONE_HEX } from './ui/primitives';

const NAV = [
  { id: 'decision', label: 'Decision' },
  { id: 'assumptions', label: 'Assumptions' },
  { id: 'ledger', label: 'Cash flows' },
  { id: 'metrics', label: 'Metrics' },
];

export default function App() {
  const model = useModelStore((s) => s.model);
  const [activeSection, setActiveSection] = useState('decision');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const { id } of NAV) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <motion.nav
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? 'rgb(7 8 12 / 0.72)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px) saturate(140%)' : 'none',
          borderBottom: scrolled ? '1px solid rgb(255 255 255 / 0.07)' : '1px solid transparent',
        }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-3.5 md:px-10">
          <a href="#cold-boot" className="flex items-baseline gap-2.5">
            <span
              className="font-mono text-sm tracking-[0.28em]"
              style={{ color: TONE_HEX.photon }}
            >
              TESSERA
            </span>
            <span className="hidden text-[0.66rem] text-slate-500 sm:inline">
              Capital budgeting
            </span>
          </a>

          <div className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="relative rounded-full px-3 py-1.5 text-[0.76rem] transition-colors"
                style={{ color: activeSection === item.id ? '#e8ecf5' : '#5d6577' }}
              >
                {activeSection === item.id && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'rgb(255 255 255 / 0.06)',
                      border: '1px solid rgb(255 255 255 / 0.09)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[0.64rem] uppercase tracking-[0.14em] text-slate-500 sm:inline">
              NPV
            </span>
            <span
              className="numeric text-[0.8rem]"
              style={{ color: model.npv >= 0 ? TONE_HEX.verdant : TONE_HEX.plasma }}
            >
              {money(model.npv)}
            </span>
          </div>
        </div>
      </motion.nav>

      <main>
        <ColdBoot />
        <TheDecision />
        <AssumptionConsole />
        <CashFlowLedger />
        <MetricsGrid />
      </main>

      <footer className="border-t border-white/5 px-6 py-10 md:px-10">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 text-[0.72rem] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            TESSERA — an AI-enabled capital budgeting decision application.
            Gagandeep Singh, MSc Artificial Intelligence with Business, SP Jain Dubai.
          </p>
          <p className="numeric">All figures in AED · Model date August 2026</p>
        </div>
      </footer>
    </>
  );
}
