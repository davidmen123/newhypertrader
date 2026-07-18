import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

// Radix only opens tooltips on hover or keyboard focus, which means touch
// users can never see them. This context lets the trigger toggle the tooltip
// on tap instead. See TooltipTrigger below.
const TooltipToggleContext = React.createContext<(() => void) | null>(null);

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [open, setOpen] = React.useState(false);
  const toggle = React.useCallback(() => setOpen((v) => !v), []);
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        {...props}
        open={open}
        onOpenChange={setOpen}
      >
        <TooltipToggleContext.Provider value={toggle}>
          {children}
        </TooltipToggleContext.Provider>
      </TooltipPrimitive.Root>
    </TooltipProvider>
  );
}

function TooltipTrigger({
  onPointerDown,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const toggle = React.useContext(TooltipToggleContext);
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (event.defaultPrevented) return;
        if (event.pointerType === "touch" && toggle) {
          // preventDefault suppresses the follow-up focus and click events,
          // which radix would treat as "do not open" / "close immediately".
          event.preventDefault();
          toggle();
        }
      }}
    />
  );
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit max-w-[calc(100vw-2rem)] origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
