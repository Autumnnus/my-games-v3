import type { ReactNode } from "react";
import { LanguagePicker } from "@/components/language-picker";
import { Stage } from "@/components/stage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard(props: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-sm pt-8 sm:pt-16">
      <Stage items={[]} className="h-[640px]" />
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
      {/* Giriş yapmadan dil seçilebilir; seçim giriş yapılınca hesaba yazılır. */}
      <div className="mt-8 flex justify-center">
        <LanguagePicker signedIn={false} />
      </div>
    </div>
  );
}

export { FormField } from "@/components/ui/field";
