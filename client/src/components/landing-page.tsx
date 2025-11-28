import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Lock, Clock, Users, Eye, Smartphone, KeyRound, MessageSquare, UserX, Zap, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

function ParticleBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-primary/30 animate-float"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 6}s`,
            animationDuration: `${6 + Math.random() * 4}s`,
          }}
        />
      ))}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center px-4 py-20">
      <ParticleBackground />
      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">End-to-End Encrypted</span>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            Messages that{' '}
            <span className="gradient-text">self-destruct</span>.
            <br />
            Privacy that{' '}
            <span className="text-primary">doesn't</span>.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Anonymous. Encrypted. Temporary. CipherLink ensures your conversations stay private with zero metadata and self-destructing messages.
          </p>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link href="/onboarding">
            <Button size="lg" className="text-lg px-8 glow-primary" data-testid="button-start-messaging">
              <Zap className="w-5 h-5 mr-2" />
              Start Messaging Securely
            </Button>
          </Link>
          <a href="#features">
            <Button size="lg" variant="outline" className="text-lg px-8">
              Learn More
            </Button>
          </a>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-16 flex items-center justify-center gap-8 text-sm text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            <span>AES-256 Encryption</span>
          </div>
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <span>Zero Metadata</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span>Auto-Delete</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: Lock,
    title: 'End-to-End Encryption',
    description: 'Messages are encrypted with AES-256-GCM before leaving your device. Only you and your recipient can read them.',
  },
  {
    icon: Clock,
    title: 'Self-Destruct Timers',
    description: 'Choose when messages disappear: 30 seconds to 24 hours. Once expired, they\'re gone forever.',
  },
  {
    icon: Users,
    title: 'One-Time Friend Codes',
    description: 'Connect with friends using single-use 8-character codes. No searching, no discovery, no tracking.',
  },
  {
    icon: Eye,
    title: 'Anonymous Identity',
    description: 'No email, no phone number, no password. Your identity is a cryptographic key pair only you control.',
  },
  {
    icon: Shield,
    title: 'Zero Metadata',
    description: 'Server logs auto-delete every 24 hours. IP addresses, locations, and activity data are never stored.',
  },
  {
    icon: Smartphone,
    title: 'Multi-Device Support',
    description: 'Access your account from any device using your 12-word recovery phrase. Simple and secure.',
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Privacy Without <span className="text-primary">Complexity</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Every feature is designed with one goal: keeping your conversations truly private.
          </p>
        </motion.div>
        
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature, index) => (
            <motion.div key={feature.title} variants={fadeInUp}>
              <Card className="h-full hover-elevate group border-border/50 hover:border-primary/30 transition-colors duration-300">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:glow-primary transition-shadow duration-300">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

const securityFeatures = [
  'AES-256-GCM message encryption',
  'X25519 key exchange protocol',
  'No emails or phone numbers required',
  'No usernames stored on server',
  '24-hour automatic log deletion',
  'Local-only cryptographic keys',
  'Zero user discovery or enumeration',
  'Self-destructing messages',
  'One-time friend codes',
  'Open-source encryption libraries',
];

function SecuritySection() {
  return (
    <section id="security" className="py-24 px-4 bg-card/30">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Security You Can <span className="text-primary">Trust</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              CipherLink uses industry-standard encryption protocols. Your messages are encrypted on your device before being sent, and only the intended recipient can decrypt them.
            </p>
            
            <div className="relative p-6 rounded-xl glass">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-primary" />
                </div>
                <span className="font-medium">Your Message</span>
              </div>
              <div className="h-px bg-gradient-to-r from-primary/50 to-transparent my-4" />
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Encrypted locally</span>
                  <Lock className="w-4 h-4 text-primary" />
                </div>
                <div className="hidden sm:block w-px h-4 bg-border" />
                <div className="flex items-center gap-2">
                  <span>Transmitted securely</span>
                  <Lock className="w-4 h-4 text-primary" />
                </div>
                <div className="hidden sm:block w-px h-4 bg-border" />
                <div className="flex items-center gap-2">
                  <span>Decrypted by recipient</span>
                </div>
              </div>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {securityFeatures.map((feature, index) => (
              <div
                key={feature}
                className="flex items-center gap-3 p-3 rounded-lg bg-background/50"
              >
                <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    icon: KeyRound,
    title: 'Generate Your Identity',
    description: 'Create a cryptographic key pair that serves as your unique, anonymous identity.',
  },
  {
    icon: Shield,
    title: 'Save Your Recovery Phrase',
    description: 'Write down your 12-word phrase. It\'s the only way to recover your identity.',
  },
  {
    icon: Users,
    title: 'Add Friends with Codes',
    description: 'Share a one-time 8-character code to connect. No searching, no discovery.',
  },
  {
    icon: MessageSquare,
    title: 'Chat Securely',
    description: 'Send encrypted, self-destructing messages. Choose when they disappear.',
  },
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            How It <span className="text-primary">Works</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Get started in four simple steps
          </p>
        </motion.div>
        
        <div className="relative">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 via-primary/20 to-transparent hidden md:block" />
          
          <div className="space-y-12">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`flex items-center gap-8 ${index % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className={`flex-1 ${index % 2 === 1 ? 'md:text-right' : ''}`}>
                  <Card className="inline-block">
                    <CardContent className="p-6">
                      <div className={`flex items-center gap-4 mb-3 ${index % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <step.icon className="w-5 h-5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-primary">Step {index + 1}</span>
                      </div>
                      <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                      <p className="text-muted-foreground">{step.description}</p>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="hidden md:flex w-12 h-12 rounded-full bg-primary text-primary-foreground items-center justify-center font-bold text-lg z-10">
                  {index + 1}
                </div>
                
                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MissionSection() {
  return (
    <section className="py-24 px-4 bg-card/30">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-8">
            Our <span className="text-primary">Mission</span>
          </h2>
          <blockquote className="text-xl md:text-2xl lg:text-3xl font-medium leading-relaxed text-muted-foreground mb-8">
            "To redefine private communication with a system that{' '}
            <span className="text-foreground">collects nothing</span>,{' '}
            <span className="text-foreground">stores nothing permanently</span>, and{' '}
            <span className="text-foreground">exposes nothing</span>."
          </blockquote>
          <p className="text-muted-foreground">
            Privacy is not a feature. It's a fundamental right.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready for <span className="text-primary">True Privacy</span>?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            No email. No phone number. No compromises.
          </p>
          <Link href="/onboarding">
            <Button size="lg" className="text-lg px-10 glow-primary" data-testid="button-get-started">
              <Zap className="w-5 h-5 mr-2" />
              Get Started Now
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12 px-4 border-t border-border/50">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg">CipherLink</span>
          </div>
          
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#security" className="hover:text-foreground transition-colors">Security</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
          </nav>
          
          <p className="text-sm text-muted-foreground">
            Your messages are encrypted with AES-256
          </p>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 py-4 px-4 glass">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg">CipherLink</span>
          </div>
          
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#security" className="text-muted-foreground hover:text-foreground transition-colors">Security</a>
            <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
          </nav>
          
          <Link href="/onboarding">
            <Button data-testid="button-header-start">
              <Lock className="w-4 h-4 mr-2" />
              Get Started
            </Button>
          </Link>
        </div>
      </header>
      
      <main className="pt-16">
        <HeroSection />
        <FeaturesSection />
        <SecuritySection />
        <HowItWorksSection />
        <MissionSection />
        <CTASection />
      </main>
      
      <Footer />
    </div>
  );
}
