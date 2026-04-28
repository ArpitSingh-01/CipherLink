import { Link } from 'wouter';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Shield, Lock, ArrowRight, Eye, Fingerprint, Timer, Server, KeyRound, CheckCircle2 } from 'lucide-react';
import { motion, useScroll, useTransform, useMotionValue, useSpring, useInView } from 'framer-motion';

/* ─── Hooks ─────────────────────────────────────────────────────────── */

function useParallax(ref: React.RefObject<HTMLElement>, range: number = 100) {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  return useTransform(scrollYProgress, [0, 1], [-range, range]);
}

function useMouse3D(intensity: number = 15) {
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 150, damping: 20 });
  const springY = useSpring(rotateY, { stiffness: 150, damping: 20 });

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    rotateY.set(dx * intensity);
    rotateX.set(-dy * intensity);
  }, [rotateX, rotateY, intensity]);

  const handleLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
  }, [rotateX, rotateY]);

  return { springX, springY, handleMove, handleLeave };
}

/* ─── Global Background & Texture ───────────────────────────────────── */

function AtmosphericBackground() {
  return (
    <>
      <div className="fixed inset-0 bg-[#050505] pointer-events-none -z-50" />
      
      {/* Subtle violet/blue undertones */}
      <div className="fixed top-[10%] left-[20%] w-[800px] h-[800px] rounded-full bg-indigo-900/[0.015] blur-[150px] pointer-events-none -z-40" />
      <div className="fixed bottom-[10%] right-[10%] w-[600px] h-[600px] rounded-full bg-blue-900/[0.012] blur-[120px] pointer-events-none -z-40" />
      
      {/* Noise Texture */}
      <div 
        className="fixed inset-0 opacity-[0.035] mix-blend-overlay pointer-events-none -z-30" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      
      {/* Vignette */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(5,5,5,0.7)_100%)] pointer-events-none -z-20" />
    </>
  );
}

/* ─── Animated reveal wrapper ───────────────────────────────────────── */

function Reveal({
  children,
  delay = 0,
  className = '',
  direction = 'up',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: 'up' | 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  const offsets = {
    up: { x: 0, y: 30 },
    left: { x: -40, y: 0 },
    right: { x: 40, y: 0 },
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, ...offsets[direction], filter: 'blur(8px)' }}
      animate={isInView ? { opacity: 1, x: 0, y: 0, filter: 'blur(0px)' } : {}}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Navigation ────────────────────────────────────────────────────── */

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ${
        scrolled
          ? 'py-4 bg-[#050505]/80 backdrop-blur-xl border-b border-white/[0.04]'
          : 'py-6 bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 lg:px-12">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="w-8 h-8 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
              <Shield className="w-5 h-5 text-zinc-300" />
            </div>
            <span className="font-medium text-[15px] tracking-tight text-zinc-100">CipherLink</span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-10 text-[13px] text-zinc-500 font-medium">
          <a href="#product" className="hover:text-zinc-200 transition-colors duration-300">Product</a>
          <a href="#protocol" className="hover:text-zinc-200 transition-colors duration-300">Protocol</a>
          <a href="#security" className="hover:text-zinc-200 transition-colors duration-300">Architecture</a>
        </nav>

        <Link href="/onboarding">
          <button
            data-testid="button-header-start"
            className="text-[13px] font-medium px-5 py-2.5 rounded-full bg-white/[0.03] text-zinc-300 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white transition-all duration-300 cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          >
            Launch UI
          </button>
        </Link>
      </div>
    </header>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────── */

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });
  const textY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-[105vh] flex items-center overflow-hidden pt-20">
      {/* Artistic radial lighting */}
      <div className="absolute top-[30%] left-[10%] w-[600px] h-[600px] rounded-full bg-cyan-700/[0.03] blur-[100px] pointer-events-none" />
      <div className="absolute top-[40%] right-[5%] w-[800px] h-[800px] rounded-full bg-indigo-600/[0.02] blur-[130px] pointer-events-none" />

      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="w-full max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-12 gap-12 items-center"
      >
        <div className="lg:col-span-7 z-10">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="inline-flex items-center gap-2 mb-8"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 opacity-80" />
            <span className="text-xs font-medium text-zinc-500 tracking-wider uppercase">Signal Protocol implementation</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="text-[clamp(3.2rem,6vw,5.5rem)] font-bold leading-[1.05] tracking-[-0.04em] text-white mb-8"
          >
            Encryption without
            <br />
            <span className="text-zinc-500 font-serif italic text-[0.95em]">compromise.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="text-[17px] leading-relaxed text-zinc-400 max-w-lg mb-12"
          >
            A pure technical messaging client. Forward-secure, identity-agnostic, and completely ephemeral. The architecture guarantees privacy before the code even runs.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.8 }}
            className="flex items-center gap-6"
          >
            <Link href="/onboarding">
              <button
                data-testid="button-start-messaging"
                className="group flex items-center gap-3 px-7 py-3.5 rounded-full bg-cyan-600/90 text-white font-medium text-[15px] hover:bg-cyan-500 transition-all duration-300 shadow-[0_4px_20px_rgba(8,145,178,0.25)] hover:shadow-[0_4px_30px_rgba(8,145,178,0.4)] cursor-pointer"
              >
                Create Identity
                <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 group-hover:opacity-100 transition-all" />
              </button>
            </Link>
            
            <a href="#protocol" className="text-[14px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors">
              Read Whitepaper →
            </a>
          </motion.div>
        </div>
        
        {/* Abstract Hero Visual (Right Side) */}
        <div className="hidden lg:block lg:col-span-5 relative h-full min-h-[500px]">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(20px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ delay: 0.4, duration: 1.2, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center -mr-20"
          >
             <div className="relative w-full aspect-square max-w-[500px]">
               {/* Orbital rings */}
               <div className="absolute inset-0 rounded-full border border-white/[0.03] animate-[spin_60s_linear_infinite]" />
               <div className="absolute inset-[15%] rounded-full border border-indigo-500/[0.05] animate-[spin_40s_linear_infinite_reverse]" />
               <div className="absolute inset-[30%] rounded-full border border-cyan-500/[0.08]" />
               
               {/* Core node */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-950 border border-white/[0.05] flex items-center justify-center shadow-[0_0_80px_rgba(0,0,0,0.8)]">
                  <Lock className="w-8 h-8 text-zinc-600" />
               </div>
               
               {/* Satellites */}
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-cyan-500/20 backdrop-blur-sm border border-cyan-500/50" />
               <div className="absolute bottom-1/4 right-[5%] w-3 h-3 rounded-full bg-indigo-500/20 backdrop-blur-sm border border-indigo-500/40" />
             </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

/* ─── Product Validation (Asymmetric layout) ────────────────────────── */

function ProductVisualization() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const y1 = useParallax(sectionRef, -40);
  const y2 = useParallax(sectionRef, 40);

  return (
    <section ref={sectionRef} id="product" className="relative py-32 lg:py-48 z-10 bg-[#0a0a0a]">
      {/* Subtle organic top transition */}
      <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#050505] to-transparent pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="mb-24 md:mb-32">
          <Reveal>
            <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.03em] text-white leading-[1.1] max-w-3xl">
              We stripped out the social graph.
              <br />
              <span className="text-zinc-600">What remains is trust.</span>
            </h2>
          </Reveal>
        </div>

        <div className="grid lg:grid-cols-12 gap-12 lg:gap-20">
          {/* Left Column (Content) */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <Reveal delay={0.1}>
              <div className="space-y-12">
                <div className="relative pl-6 border-l border-zinc-800/60">
                  <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-zinc-700" />
                  <h3 className="text-lg font-medium text-zinc-200 mb-3">Ephemeral by default</h3>
                  <p className="text-[15px] leading-relaxed text-zinc-500">
                    Set a time-to-live from 30 seconds to 24 hours. The ciphertext is relayed through our servers, delivered, and mathematically erased. No traces are permanently written to disk.
                  </p>
                </div>
                
                <div className="relative pl-6 border-l border-cyan-900/40">
                  <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-cyan-600 shadow-[0_0_10px_rgba(8,145,178,0.5)]" />
                  <h3 className="text-lg font-medium text-zinc-200 mb-3">Cryptographic Identity</h3>
                  <p className="text-[15px] leading-relaxed text-zinc-500">
                    Forget usernames and passwords. Your identity is a device-bound Curve25519 key pair. You share an 8-character verification code out-of-band to establish a session, preventing enumeration attacks.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Right Column (Visual) */}
          <div className="lg:col-span-7 relative">
            <motion.div style={{ y: y1 }} className="absolute -top-12 -right-12 w-64 h-64 bg-indigo-500/[0.03] rounded-full blur-[80px]" />
            <motion.div style={{ y: y2 }} className="absolute -bottom-12 -left-12 w-80 h-80 bg-cyan-500/[0.03] rounded-full blur-[80px]" />
            
            <Reveal delay={0.2} direction="up" className="relative z-10 w-full md:w-4/5 ml-auto">
              <div className="rounded-2xl bg-zinc-950 border border-white/[0.04] p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden">
                <div className="rounded-xl border border-white/[0.02] bg-[#0a0a0a] overflow-hidden">
                  
                  {/* Fake UI Header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.02] bg-white/[0.01]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-900 border border-white/[0.03] flex items-center justify-center">
                        <Fingerprint className="w-4 h-4 text-zinc-500" />
                      </div>
                      <div>
                        <div className="h-2.5 w-24 bg-zinc-800 rounded-sm mb-1.5" />
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-cyan-500/80" />
                          <div className="h-1.5 w-16 bg-zinc-800/50 rounded-sm" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Threat model message interaction */}
                  <div className="p-6 pb-8 space-y-5">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-tr-sm bg-zinc-900 border border-white/[0.03] text-[14px] text-zinc-400">
                        Is this exchange forward-secret?
                      </div>
                    </div>
                    
                    <div className="flex justify-start">
                      <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-tl-sm bg-transparent border border-zinc-800 text-[14px] text-zinc-400">
                        Yes. A new DH-ratchet step just completed. The previous chain key is already purged from memory.
                      </div>
                    </div>
                     
                    <div className="flex items-center justify-center pt-2">
                       <div className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-white/[0.02] border border-white/[0.03]">
                         <Timer className="w-3 h-3 text-zinc-600 mr-2" />
                         <span className="text-[11px] font-medium text-zinc-500">Self-destruct programmed: 2 minutes</span>
                       </div>
                    </div>
                  </div>
                  
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Deconstructed Protocol ────────────────────────────────────────── */

const protocols = [
  {
    num: '01',
    title: 'Curve25519 Local Generation',
    desc: 'Keys are minted client-side in IndexedDB. Private material remains physically sandboxed on the device chipset.',
  },
  {
    num: '02',
    title: 'X3DH Handshake',
    desc: 'Asymmetric identity keys combined with ephemeral prekeys authenticate users asynchronously over untrusted networks.',
  },
  {
    num: '03',
    title: 'Signal Double Ratchet',
    desc: 'A KDF chain perpetually derives new message keys. Old keys are useless to attackers even if a device is later compromised.',
  },
  {
    num: '04',
    title: 'Zero-Knowledge Relays',
    desc: 'Encrypted payloads act as opaque blobs to our infrastructure. We route bytes; we cannot read text.',
  },
];

function ProtocolSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <section ref={sectionRef} id="protocol" className="relative py-32 lg:py-48 z-10">
      <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#0a0a0a] to-transparent pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20 lg:mb-32">
          <Reveal>
            <h2 className="text-[clamp(2rem,4vw,3rem)] font-bold tracking-[-0.03em] text-white leading-tight">
              Cryptographic
              <br />
              Primitives.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-[15px] text-zinc-500 max-w-sm">
              We rely on established cryptographic standards, not proprietary algorithms. 
              Open primitives. Verifiable security.
            </p>
          </Reveal>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-16">
          {protocols.map((protocol, i) => (
            <Reveal key={protocol.num} delay={i * 0.1} direction="up">
              <div className="group relative">
                <div className="text-zinc-800 font-mono text-[10px] tracking-widest mb-4">
                  {protocol.num} //
                </div>
                <div className="h-px w-full bg-zinc-900 mb-6 group-hover:bg-cyan-900/50 transition-colors duration-500" />
                <h3 className="text-[16px] font-medium text-zinc-200 mb-3">{protocol.title}</h3>
                <p className="text-[14px] leading-relaxed text-zinc-500">{protocol.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Architecture (Deep Dive) ──────────────────────────────────────── */

function ArchitectureSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  
  return (
    <section ref={sectionRef} id="security" className="relative py-32 lg:py-48 bg-[#0a0a0a] overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-gradient-to-b from-transparent via-zinc-800/30 to-transparent" />
      <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-indigo-900/[0.02] rounded-full blur-[100px]" />

      <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10">
        <Reveal>
          <div className="text-center mb-24 lg:mb-32">
            <h2 className="text-[clamp(1.8rem,3vw,2.5rem)] font-bold tracking-[-0.02em] text-white">
              Data minimization isn't a policy.
              <br />
              <span className="text-zinc-600 font-normal">It's hardcoded constraint.</span>
            </h2>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-16 lg:gap-32">
          <Reveal delay={0.1} direction="right">
            <div>
              <div className="w-12 h-12 rounded-xl bg-zinc-900/50 border border-zinc-800 flex items-center justify-center mb-6">
                <Server className="w-5 h-5 text-zinc-400" />
              </div>
              <h3 className="text-[20px] font-medium text-zinc-100 mb-4">Infrastructure Ignorance</h3>
              <p className="text-[15px] leading-relaxed text-zinc-500 mb-6">
                Most platforms perform encryption in transit, terminating TLS at the load balancer to index metadata. CipherLink servers hold no termination keys. They blindly pass encrypted payloads from client A to client B.
              </p>
              <ul className="space-y-3">
                {[
                  'Volatile RAM storage for pending messages',
                  'Zero permanent SQL chat history',
                  'Rolling 24-hour log rotation',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-[14px] text-zinc-400">
                    <span className="text-zinc-700 mt-0.5">—</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.2} direction="left">
            <div>
              <div className="w-12 h-12 rounded-xl bg-cyan-950/20 border border-cyan-900/30 flex items-center justify-center mb-6">
                <Shield className="w-5 h-5 text-cyan-500/70" />
              </div>
              <h3 className="text-[20px] font-medium text-zinc-100 mb-4">Cryptographic Identity</h3>
              <p className="text-[15px] leading-relaxed text-zinc-500 mb-6">
                When you sign up, you don't provide an email. You generate a high-entropy seed phrase. This phrase derives your root identity key. Lose the device and the phrase, and the account is mathematically unrecoverable.
              </p>
              <ul className="space-y-3">
                {[
                  'No email addresses linked',
                  'No phone number harvesting',
                  'BIP39 standard recovery phrases',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-[14px] text-zinc-400">
                    <span className="text-zinc-700 mt-0.5">—</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ────────────────────────────────────────────────────────────── */

function CTA() {
  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <section ref={sectionRef} className="relative py-32 lg:py-48 flex items-center justify-center">
      <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
        <Reveal>
          <div className="w-16 h-16 mx-auto bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center mb-8 shadow-xl">
            <Lock className="w-6 h-6 text-zinc-400" />
          </div>
        </Reveal>
        
        <Reveal delay={0.1}>
          <h2 className="text-[clamp(2.5rem,5vw,3.5rem)] font-bold tracking-[-0.04em] text-white leading-[1.05] mb-8">
            Reclaim your privacy.
          </h2>
        </Reveal>
        
        <Reveal delay={0.2}>
          <Link href="/onboarding">
            <button
              data-testid="button-get-started"
              className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-white text-black font-semibold text-[15px] hover:scale-[1.02] transition-transform duration-300 shadow-[0_0_40px_rgba(255,255,255,0.15)] cursor-pointer"
            >
              Initialize Client Instance
            </button>
          </Link>
          <p className="mt-6 text-[13px] text-zinc-600 font-medium">Free. Open Protocol. No strings attached.</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Footer ─────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="py-12 px-6 lg:px-12 border-t border-white/[0.03] bg-[#050505] relative z-10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
          <Shield className="w-4 h-4 text-zinc-400" />
          <span className="text-[13px] font-medium text-zinc-400">CipherLink</span>
        </div>

        <nav className="flex items-center gap-8 text-[12px] text-zinc-600 font-medium">
          <a href="#product" className="hover:text-zinc-300 transition-colors">Product</a>
          <a href="#protocol" className="hover:text-zinc-300 transition-colors">Protocol</a>
          <a href="#security" className="hover:text-zinc-300 transition-colors">Security</a>
          <a href="#" className="hover:text-zinc-300 transition-colors">Source Code</a>
        </nav>

        <p className="text-[11px] text-zinc-700 font-mono">
          E2EE Active // v1.0.0
        </p>
      </div>
    </footer>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 selection:bg-cyan-900/30 selection:text-cyan-100 overflow-x-hidden font-sans">
      <AtmosphericBackground />
      <Nav />
      <main className="relative z-10">
        <Hero />
        <ProductVisualization />
        <ProtocolSection />
        <ArchitectureSection />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
