import { Link } from "@dashboard/components/Link";
import { APP_VERSION } from "@dashboard/config";
import { AppWidgetCard } from "@dashboard/extensions/components/AppWidgetCard/AppWidgetCard";
import { IframePost } from "@dashboard/extensions/components/IframePost/IframePost";
import { appExtensionManifestOptionsSchema } from "@dashboard/extensions/domain/app-extension-manifest-options";
import { isUrlAbsolute } from "@dashboard/extensions/isUrlAbsolute";
import { extensionActions } from "@dashboard/extensions/messages";
import { InlineExtensionPreferenceControls } from "@dashboard/extensions/preferences/InlineExtensionPreferenceControls";
import { type ExtensionWithParams } from "@dashboard/extensions/types";
import { type AppDetailsUrlMountQueryParams, ExtensionsUrls } from "@dashboard/extensions/urls";
import { AppFrame } from "@dashboard/extensions/views/ViewManifestExtension/components/AppFrame/AppFrame";
import { type ThemeType } from "@saleor/app-sdk/app-bridge";
import { Box, Text } from "@saleor/macaw-ui-next";
import { ExternalLink } from "lucide-react";
import type React from "react";
import { useIntl } from "react-intl";

import styles from "./AppWidgetExtensionItem.module.css";

interface AppWidgetExtensionItemProps {
  extension: ExtensionWithParams;
  params: AppDetailsUrlMountQueryParams;
  theme: ThemeType | undefined;
}

export const AppWidgetExtensionItem = ({
  extension,
  params,
  theme,
}: AppWidgetExtensionItemProps) => {
  const intl = useIntl();
  const settingsValidation = appExtensionManifestOptionsSchema.safeParse(extension.settings);

  if (!settingsValidation.success) {
    return (
      <Box>
        <Text>Error rendering extension</Text>
      </Box>
    );
  }

  const settings = settingsValidation.data;

  const renderWithControls = (children: React.ReactNode) => (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={2}
      className={styles.hoverRow}
    >
      <Box>{children}</Box>
      <Box className={styles.hoverControls}>
        <InlineExtensionPreferenceControls extension={extension} />
      </Box>
    </Box>
  );

  if (extension.targetName !== "WIDGET") {
    const onClick = () => extension.open(params);

    switch (extension.targetName) {
      case "APP_PAGE":
        return renderWithControls(
          <Link onClick={onClick} title={intl.formatMessage(extensionActions.redirectToAppPage)}>
            {extension.label}
          </Link>,
        );
      case "NEW_TAB":
        return renderWithControls(
          <Link onClick={onClick} title={intl.formatMessage(extensionActions.openInNewTab)}>
            {extension.label}{" "}
            <ExternalLink style={{ width: 16, height: 16, verticalAlign: "text-bottom" }} />
          </Link>,
        );
      case "POPUP":
        return renderWithControls(
          <Link onClick={onClick} title={intl.formatMessage(extensionActions.openInPopup)}>
            {extension.label}...
          </Link>,
        );
    }
  }

  const isIframePost = settings?.widgetTarget?.method === "POST";
  const extensionUrl = isUrlAbsolute(extension.url)
    ? extension.url
    : `${extension.app.appUrl ?? ""}${extension.url}`;
  const appIframeUrl = ExtensionsUrls.resolveAppIframeUrl(extension.app.id, extensionUrl, {
    id: extension.app.id,
    theme: theme!,
  });

  return (
    <Box className={styles.hoverRow}>
      <Box display="flex" justifyContent="flex-end" className={styles.hoverControls}>
        <InlineExtensionPreferenceControls extension={extension} />
      </Box>
      <AppWidgetCard extension={extension}>
        {isIframePost ? (
          <IframePost
            autoHeight
            appId={extension.app.id}
            accessToken={extension.accessToken}
            extensionId={extension.id}
            extensionUrl={extensionUrl}
            params={params}
          />
        ) : (
          <AppFrame
            target="WIDGET"
            autoHeight
            src={appIframeUrl}
            appToken={extension.accessToken}
            appId={extension.app.id}
            dashboardVersion={APP_VERSION}
            params={params}
          />
        )}
      </AppWidgetCard>
    </Box>
  );
};
