import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Stage } from "@/components/stage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { m } from "@/paraglide/messages";

export function AuthCard(props: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-sm pt-8 sm:pt-16">
      <Stage items={[]} className="h-[640px]" />
      <Link
        to="/"
        className="mx-auto mb-6 flex w-fit items-center gap-3 rounded-xl"
        aria-label={m.app_name()}
      >
        <BrandMark className="size-11 rounded-xl" />
        <span className="font-display text-xl font-medium">{m.app_name()}</span>
      </Link>
      <Card className="glass animate-rise border-white/12">
        <CardHeader>
          <CardTitle className="font-display text-2xl font-semibold">{props.title}</CardTitle>
          {props.description && <CardDescription>{props.description}</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-4">{props.children}</CardContent>
      </Card>
      {props.footer && (
        <div className="text-muted-foreground mt-4 text-center text-sm">{props.footer}</div>
      )}
    </div>
  );
}

export { FormField } from "@/components/ui/field";
