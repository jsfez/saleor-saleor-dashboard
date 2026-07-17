import useLocalStorage from "@dashboard/hooks/useLocalStorage";
import {
  type DefaultTheme,
  ThemeProvider as MacawThemeProvider,
  useTheme,
} from "@saleor/macaw-ui-next";
import { type ReactNode, useEffect } from "react";

import { defaultTheme, localStorageKey } from "./consts";
import { secondaryTextCssVar, secondaryTextDefault2 } from "./secondaryTextContrast";

/**
 * Runs after Macaw applies theme CSS vars on `documentElement`, then
 * nudges secondary text contrast dashboard-wide.
 */
const SecondaryTextContrastOverride = (): null => {
  const { theme } = useTheme();

  useEffect(
    function applySecondaryTextContrast() {
      document.documentElement.style.setProperty(secondaryTextCssVar, secondaryTextDefault2[theme]);
    },
    [theme],
  );

  return null;
};

export const ThemeProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [activeTheme] = useLocalStorage<DefaultTheme>(localStorageKey, defaultTheme);

  return (
    <MacawThemeProvider defaultTheme={activeTheme}>
      <SecondaryTextContrastOverride />
      {children}
    </MacawThemeProvider>
  );
};
