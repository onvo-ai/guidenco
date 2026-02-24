import { cva, type VariantProps } from "class-variance-authority";
import { CircleCheckBig } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

const pricingColumnVariants = cva(
  "max-w-container relative flex flex-col gap-6 overflow-hidden rounded-2xl border p-8",
  {
    variants: {
      variant: {
        default: "bg-card border-border",
        popular: "bg-primary border-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface PricingColumnProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof pricingColumnVariants> {
  name: string;
  icon?: ReactNode;
  description: string;
  price: number;
  priceNote: string;
  cta: {
    variant: "default" | "outline" | "secondary";
    label: string;
    href: string;
  };
  features: string[];
}

export function PricingColumn({
  name,
  icon,
  description,
  price,
  priceNote,
  cta,
  features,
  variant,
  className,
  ...props
}: PricingColumnProps) {
  const isPopular = variant === "popular";

  return (
    <div
      className={cn(
        pricingColumnVariants({ variant }),
        isPopular && "shadow-lg scale-105",
        className
      )}
      {...props}
    >
      {isPopular && (
        <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-bl-lg">
          Popular
        </div>
      )}
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h2 className={cn(
            "flex items-center gap-2 font-bold text-lg",
            isPopular ? "text-primary-foreground" : "text-foreground"
          )}>
            {icon && (
              <div className={cn(
                "flex items-center gap-2",
                isPopular ? "text-primary-foreground/80" : "text-muted-foreground"
              )}>
                {icon}
              </div>
            )}
            {name}
          </h2>
          <p className={cn(
            "max-w-[220px] text-sm",
            isPopular ? "text-primary-foreground/80" : "text-muted-foreground"
          )}>
            {description}
          </p>
        </div>
        <div className="flex items-center gap-3 lg:flex-col lg:items-start xl:flex-row xl:items-center">
          <div className="flex items-baseline gap-1">
            <span className={cn(
              "text-2xl font-bold",
              isPopular ? "text-primary-foreground/80" : "text-muted-foreground"
            )}>$</span>
            <span className={cn(
              "text-6xl font-bold",
              isPopular ? "text-primary-foreground" : "text-foreground"
            )}>{price}</span>
          </div>
          <div className="flex min-h-[40px] flex-col">
            {price > 0 && (
              <>
                <span className={cn(
                  "text-sm",
                  isPopular ? "text-primary-foreground/80" : "text-foreground"
                )}>per month</span>
                <span className={cn(
                  "text-sm",
                  isPopular ? "text-primary-foreground/60" : "text-muted-foreground"
                )}>
                  plus local taxes
                </span>
              </>
            )}
          </div>
        </div>
        <Button
          variant={isPopular ? "secondary" : cta.variant}
          size="lg"
          asChild
          className={isPopular ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90" : undefined}
        >
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
        <p className={cn(
          "min-h-[40px] max-w-[220px] text-sm",
          isPopular ? "text-primary-foreground/80" : "text-muted-foreground"
        )}>
          {priceNote}
        </p>
        <hr className={cn(
          "border-0 h-px",
          isPopular ? "bg-primary-foreground/20" : "bg-border"
        )} />
      </div>
      <div>
        <ul className="flex flex-col gap-2">
          {features.map((feature) => (
            <li key={feature} className={cn(
              "flex items-center gap-2 text-sm",
              isPopular ? "text-primary-foreground" : "text-foreground"
            )}>
              <CircleCheckBig className={cn(
                "size-4 shrink-0",
                isPopular ? "text-primary-foreground/80" : "text-muted-foreground"
              )} />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export { pricingColumnVariants };
