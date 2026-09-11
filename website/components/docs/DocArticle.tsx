import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function DocArticle({ title, eyebrow = "ASTRAL HANDBOOK", description, sections, children, previous, next }: {
  title: string; eyebrow?: string; description: string; sections: { id: string; title: string }[];
  children: ReactNode; previous?: { href: string; title: string }; next?: { href: string; title: string };
}) {
  return <div className="docs-reading-layout">
    <article className="docs-article">
      <header><span className="section-kicker">{eyebrow}</span><h1>{title}</h1><p className="docs-lead">{description}</p></header>
      <div className="docs-prose">{children}</div>
      <nav className="docs-pagination" aria-label="Previous and next articles">
        {previous ? <a href={previous.href}><ArrowLeft size={17} /><span><small>Previous</small>{previous.title}</span></a> : <span />}
        {next && <a href={next.href}><span><small>Next</small>{next.title}</span><ArrowRight size={17} /></a>}
      </nav>
    </article>
    <nav className="docs-toc" aria-label="On this page"><span>ON THIS PAGE</span>{sections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</nav>
  </div>;
}
