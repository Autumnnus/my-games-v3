import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard(props: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{props.title}</CardTitle>
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

export function FormField(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: kontrol children olarak geliyor
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{props.label}</span>
      {props.children}
      {props.hint && <span className="text-muted-foreground text-xs">{props.hint}</span>}
    </label>
  );
}
