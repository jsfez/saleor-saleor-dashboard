import { Box, Button, type ButtonProps, Tooltip } from "@saleor/macaw-ui-next";
import { type ComponentProps, type ReactElement, type ReactNode } from "react";

interface ButtonWithTooltipProps extends ButtonProps {
  tooltip?: ReactNode;
  tooltipSide?: ComponentProps<typeof Tooltip.Content>["side"];
  children: ReactNode;
}

export const ButtonWithTooltip = ({
  tooltip,
  tooltipSide,
  children,
  disabled,
  ...props
}: ButtonWithTooltipProps): ReactElement => {
  const button = (
    <Button disabled={disabled} {...props}>
      {children}
    </Button>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <Tooltip>
      <Tooltip.Trigger>
        {disabled ? (
          <Box as="span" display="inline-flex">
            {button}
          </Box>
        ) : (
          button
        )}
      </Tooltip.Trigger>
      <Tooltip.Content side={tooltipSide}>
        <Tooltip.Arrow />
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
};
