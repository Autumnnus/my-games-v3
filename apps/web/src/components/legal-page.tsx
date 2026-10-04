import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";
import { LEGAL_UPDATED_AT, type LegalDocument } from "@/lib/legal";
import { m } from "@/paraglide/messages";

/** Metindeki iletişim adresini tıklanabilir yapar. */
function withMailto(text: string, email: string | null): ReactNode {
  if (!email || !text.includes(email)) return text;
  return text.split(email).flatMap((part, index) =>
    index === 0
      ? [part]
      : [
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: parçaların sırası sabit
            key={index}
            href={`mailto:${email}`}
            className="text-foreground underline underline-offset-4"
          >
            {email}
          </a>,
          part,
        ],
  );
}

export function LegalPage({ doc, email }: { doc: LegalDocument; email: string | null }) {
  return (
    <article className="mx-auto grid max-w-3xl gap-8 py-8 sm:py-12">
      <header className="grid gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {doc.title}
        </h1>
        <p className="text-muted-foreground text-sm">
          {m.legal_updated({ date: formatDate(LEGAL_UPDATED_AT, "long") ?? LEGAL_UPDATED_AT })}
        </p>
        <p className="text-foreground/85 leading-relaxed">{doc.intro}</p>
      </header>
      {doc.sections.map((section) => (
        <section key={section.title} className="grid gap-3">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="text-foreground/85 leading-relaxed">
              {withMailto(paragraph, email)}
            </p>
          ))}
          {section.items && (
            <ul className="text-foreground/85 grid list-disc gap-2 pl-5 leading-relaxed">
              {section.items.map((item) => (
                <li key={item}>{withMailto(item, email)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <nav className="text-muted-foreground flex flex-wrap gap-4 text-sm">
        <Link to="/privacy" className="hover:text-foreground underline underline-offset-4">
          {m.legal_privacy()}
        </Link>
        <Link to="/terms" className="hover:text-foreground underline underline-offset-4">
          {m.legal_terms()}
        </Link>
      </nav>
    </article>
  );
}
