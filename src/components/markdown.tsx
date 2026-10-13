import type { Element, ElementContent, Root } from "hast";
import Link from "next/link";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import { H2, H3 } from "./prose";

const linkClass = "underline hover:text-accent";
const listClass = "mt-3 space-y-1.5 leading-relaxed first:mt-0";
const EMOJI_START = /^\p{Extended_Pictographic}/u;

type HastNode = NonNullable<ExtraProps["node"]> | NonNullable<ExtraProps["node"]>["children"][number];

/** Text at the very start of an element, e.g. "👐 Vzájemný" of a list item. */
function leadingText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value.trimStart();
  if (node.type !== "element") return "";
  for (const child of node.children) {
    const text = leadingText(child);
    if (text) return text;
  }
  return "";
}

/**
 * For questions and answers (the FAQ page): each "##" heading with the text under it, up to the next one,
 * becomes a question that opens on a tap (details/summary). What comes before the first heading stays as it is.
 */
function rehypeQuestions() {
  return (tree: Root) => {
    const children: Root["children"] = [];
    let question: Element | null = null;
    for (const node of tree.children) {
      if (node.type === "element" && (node.tagName === "h1" || node.tagName === "h2")) {
        const summary: Element = { type: "element", tagName: "summary", properties: {}, children: node.children };
        question = { type: "element", tagName: "details", properties: {}, children: [summary] };
        children.push(question);
      } else if (question) question.children.push(node as ElementContent);
      else children.push(node);
    }
    tree.children = children;
  };
}

/**
 * How texts edited in the admin look on the site: the same headings, paragraphs and lists as the pages
 * written in code (components/prose), plus
 * - a quote is a highlighted box,
 * - a list whose every item starts with an emoji has no bullets (the emoji are the bullets),
 * - bold text starting with "#" is a Discord channel and never breaks at its hyphens,
 * - links to this site ("/botc") stay in the tab, links elsewhere open a new one,
 * - with `questions`, each "##" heading is a question that opens on a tap (rehypeQuestions).
 */
const components: Components = {
  h1: ({ children }) => <H2>{children}</H2>,
  h2: ({ children }) => <H2>{children}</H2>,
  h3: ({ children }) => <H3>{children}</H3>,
  h4: ({ children }) => <H3>{children}</H3>,
  h5: ({ children }) => <H3>{children}</H3>,
  h6: ({ children }) => <H3>{children}</H3>,
  p: ({ children }) => <p className="mt-3 leading-relaxed first:mt-0">{children}</p>,
  ul: ({ node, children }) => {
    const items = node?.children.filter((c) => c.type === "element" && c.tagName === "li") ?? [];
    const emojiBullets = items.length > 0 && items.every((li) => EMOJI_START.test(leadingText(li)));
    return <ul className={emojiBullets ? listClass : `${listClass} list-disc pl-6`}>{children}</ul>;
  },
  ol: ({ children }) => <ol className={`${listClass} list-decimal pl-6`}>{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="mt-5 rounded-xl border border-border bg-card p-5 shadow-sm first:mt-0 [&_p]:mt-1 [&_p:first-child]:mt-0">
      {children}
    </blockquote>
  ),
  strong: ({ node, children }) => (
    <strong className={leadingText(node).startsWith("#") ? "whitespace-nowrap" : undefined}>{children}</strong>
  ),
  a: ({ href = "", children }) => {
    if (href.startsWith("/") && !href.startsWith("//")) {
      return <Link href={href} className={linkClass}>{children}</Link>;
    }
    if (/^(#|mailto:|tel:)/.test(href)) return <a href={href} className={linkClass}>{children}</a>;
    return <a href={href} target="_blank" rel="noreferrer" className={linkClass}>{children}</a>;
  },
  details: ({ children }) => (
    <details className="group border-b border-border first:border-t open:pb-5 [&>summary+*]:mt-0">{children}</details>
  ),
  summary: ({ children }) => (
    <summary className="flex cursor-pointer list-none items-start gap-3 py-4 hover:text-accent [&::-webkit-details-marker]:hidden">
      <h2 className="flex-1 text-lg font-semibold">{children}</h2>
      <span aria-hidden className="mt-0.5 text-muted transition-transform group-open:rotate-180">▾</span>
    </summary>
  ),
  hr: () => <hr className="my-8 border-border" />,
  code: ({ children }) => <code className="rounded bg-border/40 px-1 text-[0.9em]">{children}</code>,
};

/**
 * Formatted text (Markdown) from the admin. HTML in it is dropped and so are images (nowhere to upload them yet);
 * react-markdown also drops unsafe link targets such as `javascript:`.
 */
export function Markdown({ text, className = "", questions = false }: { text: string; className?: string; questions?: boolean }) {
  if (!text.trim()) return null;
  return (
    <div className={className}>
      <ReactMarkdown
        components={components}
        rehypePlugins={questions ? [rehypeQuestions] : []}
        skipHtml
        disallowedElements={["img"]}
        unwrapDisallowed
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
