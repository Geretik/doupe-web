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
 * How texts edited in the admin look on the site: the same headings, paragraphs and lists as the pages
 * written in code (components/prose), plus
 * - a quote is a highlighted box,
 * - a list whose every item starts with an emoji has no bullets (the emoji are the bullets),
 * - bold text starting with "#" is a Discord channel and never breaks at its hyphens,
 * - links to this site ("/botc") stay in the tab, links elsewhere open a new one.
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
  hr: () => <hr className="my-8 border-border" />,
  code: ({ children }) => <code className="rounded bg-border/40 px-1 text-[0.9em]">{children}</code>,
};

/**
 * Formatted text (Markdown) from the admin. HTML in it is dropped and so are images (nowhere to upload them yet);
 * react-markdown also drops unsafe link targets such as `javascript:`.
 */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  return (
    <div className={className}>
      <ReactMarkdown components={components} skipHtml disallowedElements={["img"]} unwrapDisallowed>
        {text}
      </ReactMarkdown>
    </div>
  );
}
