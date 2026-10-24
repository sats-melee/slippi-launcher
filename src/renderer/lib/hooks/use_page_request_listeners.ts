import React from "react";

import { useSettingsModal } from "./use_settings_modal";

export const usePageRequestListeners = () => {
  const { open } = useSettingsModal();
  React.useEffect(() => {
    return window.electron.settings.onOpenSettingsPageRequest(open);
  }, [open]);
};
