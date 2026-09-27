import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export function NotFound() {
  return (
    <div className="grid justify-items-start gap-4 py-16">
      <h1 className="text-2xl font-semibold">{m.not_found_title()}</h1>
      <Button asChild variant="outline">
        <Link to="/">{m.not_found_back()}</Link>
      </Button>
    </div>
  );
}
