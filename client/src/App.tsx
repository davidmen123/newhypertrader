import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import FeedbackWidget from "./components/FeedbackWidget";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LangProvider } from "./contexts/LangContext";
import Home from "./pages/Home";
import Analytics from "./pages/Analytics";
import Faq from "./pages/Faq";
import { trpc } from "@/lib/trpc";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/faq"} component={Faq} />
      <Route path={"/analytics"} component={Analytics} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AnalyticsTracker() {
  const trackMutation = trpc.analytics.track.useMutation();
  const updateDurationMutation = trpc.analytics.updateDuration.useMutation();

  useEffect(() => {
    const startTime = Date.now();
    let visitId: number | null = null;
    let durationSent = false;

    // One row per visit: insert on load, capture its id.
    trackMutation
      .mutateAsync({
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        referrer: document.referrer,
      })
      .then((res) => {
        visitId = res?.id ?? null;
      })
      .catch(() => {});

    // On leave, update that row's dwell time instead of inserting a new one.
    // visibilitychange→hidden fires more reliably than beforeunload on mobile.
    const sendDuration = () => {
      if (durationSent || visitId == null) return;
      durationSent = true;
      const duration = Math.round((Date.now() - startTime) / 1000);
      updateDurationMutation.mutate({ id: visitId, duration });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendDuration();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendDuration);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendDuration);
    };
    // Intentionally mount-only: the mutation objects are recreated each render,
    // so depending on them would re-run this effect and re-track in a loop.
  }, []);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <LangProvider>
          <TooltipProvider>
            <Toaster />
            <AnalyticsTracker />
            <Router />
            <FeedbackWidget />
          </TooltipProvider>
        </LangProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
