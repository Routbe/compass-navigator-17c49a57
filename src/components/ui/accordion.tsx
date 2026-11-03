import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item ref={ref} className={cn("border-b", className)} {...props} />
));
AccordionItem.displayName = "AccordionItem";

/**
 * Keeps the clicked header at the same spot on screen while a sibling above it
 * collapses (single accordions), so the page never jumps down or up.
 */
function keepInPlace(el: HTMLElement) {
  if (typeof window === "undefined") return;
  const start = el.getBoundingClientRect().top;
  const until = performance.now() + 450;
  const step = () => {
    if (!el.isConnected) return;
    const drift = el.getBoundingClientRect().top - start;
    if (Math.abs(drift) > 0.5) window.scrollBy({ top: drift, behavior: "instant" as ScrollBehavior });
    if (performance.now() < until) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, onClick, ...props }, ref) => (
  // Elke sectiekop is een echt kopniveau, zodat screenreaders de studio als
  // lijst van secties aankondigen in plaats van losse knoppen.
  <AccordionPrimitive.Header asChild>
    <h3 className="flex m-0">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          "flex flex-1 items-center justify-between gap-2 py-4 text-sm font-medium cursor-pointer transition-all hover:underline text-left",
          "rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "[&[data-state=open]>svg]:rotate-180",
          className,
        )}
        onClick={(e) => {
          keepInPlace(e.currentTarget);
          onClick?.(e);
        }}
        {...props}
      >
        {children}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </AccordionPrimitive.Trigger>
    </h3>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4 pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
