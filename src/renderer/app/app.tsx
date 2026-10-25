import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Header } from "@/app/header/header";
import type { MenuItem } from "@/app/header/main_menu";
import { PersistentNotification } from "@/components/persistent_notification/persistent_notification";
import { RosettaInstallDialog } from "@/components/rosetta_install_dialog/rosetta_install_dialog";
export type MainMenuItem = MenuItem & {
  Component: React.ComponentType;
  default?: boolean;
};

export const App = React.memo(({ menuItems }: { menuItems: readonly MainMenuItem[] }) => {
  const defaultRoute = menuItems.find((item) => item.default);
  return (
    <div
      style={{
        display: "flex",
        flexFlow: "column",
        height: "100%",
        width: "100%",
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <Header />
      </div>
      <div style={{ flex: 1, overflow: "auto", display: "flex" }}>
        <Routes>
          {menuItems.map((item) => (
            <Route key={item.subpath} path={`${item.subpath}/*`} element={<item.Component />} />
          ))}
          {defaultRoute && <Route path="*" element={<Navigate replace={true} to={`${defaultRoute.subpath}`} />} />}
        </Routes>
      </div>
      <PersistentNotification />
      <RosettaInstallDialog />
    </div>
  );
});
