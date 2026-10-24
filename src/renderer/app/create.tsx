import SportsEsportsOutlinedIcon from "@mui/icons-material/SportsEsportsOutlined";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { HashRouter as Router, Navigate, Route, Routes } from "react-router-dom";

import { useAppStore } from "@/lib/hooks/use_app_store";
import { useLastPageTracker } from "@/lib/hooks/use_last_page";
import { usePageRequestListeners } from "@/lib/hooks/use_page_request_listeners";
import { usePageNavigationShortcuts } from "@/lib/hooks/use_shortcuts";
import { ArenaPage } from "@/pages/arena/arena_page";
import { createSettingsPage } from "@/pages/settings/create";
import { createServiceProvider } from "@/services";
import type { Services } from "@/services/types";

import type { MainMenuItem } from "./app";
import { App as AppImpl } from "./app";
import { CreateAppMessages as Messages } from "./create.messages";

export function createApp({ services }: { services: Services }): {
  App: React.ComponentType;
} {
  const { Page: SettingsPage } = createSettingsPage();

  const menuItems: MainMenuItem[] = [
    {
      subpath: "arena",
      title: () => Messages.arena(),
      Component: ArenaPage,
      Icon: SportsEsportsOutlinedIcon,
      default: true,
    },
  ];

  const navigationPaths = menuItems.map((item) => item.subpath);

  const MainAppPage = React.memo(() => {
    usePageNavigationShortcuts(navigationPaths);

    return <AppImpl menuItems={menuItems} />;
  });

  const AppRoutes = () => {
    const currentLanguage = useAppStore((state) => state.currentLanguage);

    // Track last non-settings URL for modal return navigation
    useLastPageTracker();

    // Then add the page request listeners
    usePageRequestListeners();

    return (
      <Routes key={currentLanguage}>
        <Route path="/main/*" element={<MainAppPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        {/* Old bookmarks (including /landing) must not resurrect sign-in or policy screens. */}
        <Route path="*" element={<Navigate to="/main/arena" replace={true} />} />
      </Routes>
    );
  };

  const { ServiceProvider } = createServiceProvider({ services });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchIntervalInBackground: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchInterval: false,
        retry: false,
      },
    },
  });

  // Providers need to be initialized before the rest of the app can use them
  const withProviders = (Component: React.ComponentType) => {
    return () => (
      <QueryClientProvider client={queryClient}>
        <ServiceProvider>
          <Router
            future={{
              v7_startTransition: true,
            }}
          >
            <Component />
          </Router>
        </ServiceProvider>
      </QueryClientProvider>
    );
  };

  return { App: withProviders(AppRoutes) };
}
