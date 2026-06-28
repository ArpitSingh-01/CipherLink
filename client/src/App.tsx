import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LandingPage } from "@/components/LandingPage";
import { Onboarding } from "@/components/Onboarding";
import { ChatPage } from "@/components/ChatPage";
import NotFound from "@/pages/NotFound";
import { setPersistentHooks } from '@/lib/session';
import { Analytics } from '@vercel/analytics/react';

// Lazy-loaded content pages (code-split for landing page performance)
const EncryptionPage = lazy(() => import('@/pages/EncryptionPage'));
const OpenSourcePage = lazy(() => import('@/pages/OpenSourcePage'));
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicyPage'));

// Register TOFU persistent hooks at module level — BEFORE any component renders.
// This ensures persistentHooks is never null when dhRatchet or initSession fires,
// eliminating the startup race where the old useEffect in chat-page.tsx ran too late.
setPersistentHooks({
  onIdentityObserved: async (sessionId: string, newFp: string): Promise<boolean> => {
    try {
      const { getDB } = await import('@/lib/storage');
      const database = await getDB();
      const stored = await database.get('settings', `fingerprint:${sessionId}`);
      if (typeof stored === 'string' && stored !== newFp) {
        console.warn(`[SEC] Identity mismatch for session ${sessionId}: expected ${stored}, got ${newFp}`);
        return false; // MITM detected — block initialization
      }
      await database.put('settings', newFp, `fingerprint:${sessionId}`);
      return true;
    } catch {
      return true; // Fail open on IDB error (non-critical path)
    }
  },
  onRatchetKeyObserved: async (): Promise<boolean> => true, // Allow automatic sub-key rotation
});

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/encryption" component={() => (
        <Suspense fallback={<LoadingSpinner />}>
          <EncryptionPage />
        </Suspense>
      )} />
      <Route path="/open-source" component={() => (
        <Suspense fallback={<LoadingSpinner />}>
          <OpenSourcePage />
        </Suspense>
      )} />
      <Route path="/privacy-policy" component={() => (
        <Suspense fallback={<LoadingSpinner />}>
          <PrivacyPolicyPage />
        </Suspense>
      )} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <Analytics />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
