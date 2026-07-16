import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LangProvider } from "./contexts/LangContext";
import Home from "./pages/Home";
import Analytics from "./pages/Analytics";
import { trpc } from "@/lib/trpc";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/analytics"} component={Analytics} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AnalyticsTracker() {
  const [startTime] = useState(Date.now());
  const trackMutation = trpc.analytics.track.useMutation({
    onError: () => {},
  });

  useEffect(() => {
    trackMutation.mutate({
      page: window.location.pathname,
      userAgent: navigator.userAgent,
      referrer: document.referrer,
    });

    const handleBeforeUnload = () => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      trackMutation.mutate({
        page: window.location.pathname,
        duration,
        userAgent: navigator.userAgent,
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [startTime, trackMutation]);

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
          </TooltipProvider>
        </LangProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
