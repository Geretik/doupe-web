"use client";

import "@mdxeditor/editor/style.css";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  headingsPlugin,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  Separator,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";
import { useCallback, useState, useSyncExternalStore } from "react";
import { inputClass } from "../ui";

/** The edited text looks roughly like on the site (components/markdown.tsx): headings, lists, the quote as a box. */
const contentClass = [
  "min-h-32 px-3 py-2 font-sans text-base leading-relaxed text-foreground",
  "[&>*:first-child]:mt-0 [&_p]:mt-3",
  "[&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1",
  "[&_blockquote]:mt-4 [&_blockquote]:rounded-xl [&_blockquote]:border [&_blockquote]:border-s [&_blockquote]:border-border [&_blockquote]:bg-background [&_blockquote]:p-4",
  "[&_blockquote>*:first-child]:mt-0 [&_li>p]:mt-0",
  "[&_a]:text-accent [&_a]:underline [&_hr]:my-6 [&_hr]:border-border",
].join(" ");

const darkQuery = "(prefers-color-scheme: dark)";
function subscribeDark(onChange: () => void) {
  const mq = window.matchMedia(darkQuery);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Formatted text (Markdown) edited like in a word processor (MDXEditor), with a switch to the Markdown source.
 * The text goes to the form as the hidden field `name` only once it was edited: the editor rewrites the
 * Markdown it loads in its own style, and that alone must not count as a change.
 */
export default function MarkdownEditor({
  name,
  markdown,
  labelledBy,
  strings,
  errorText,
}: {
  name: string;
  markdown: string;
  labelledBy: string;
  /** The editor's own texts by its keys, see `editor` in the dictionary */
  strings: Record<string, string>;
  /** Shown above the plain text field when the editor cannot load the text */
  errorText: string;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const dark = useSyncExternalStore(subscribeDark, () => window.matchMedia(darkQuery).matches, () => false);
  const translation = useCallback(
    (key: string, defaultValue: string, interpolations?: Record<string, unknown>) =>
      Object.entries(interpolations ?? {}).reduce(
        (s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)),
        strings[key] ?? defaultValue,
      ),
    [strings],
  );

  if (failed) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-accent">{errorText}</p>
        <textarea name={name} defaultValue={markdown} rows={12} aria-labelledby={labelledBy} className={`${inputClass} font-mono text-sm`} />
      </div>
    );
  }
  return (
    <div role="group" aria-labelledby={labelledBy} className="rounded-md border border-border bg-card focus-within:ring-2 focus-within:ring-accent/40">
      <MDXEditor
        markdown={markdown}
        onChange={(md, initialNormalize) => {
          if (!initialNormalize) setValue(md);
        }}
        onError={() => setFailed(true)}
        translation={translation}
        toMarkdownOptions={{ bullet: "-" }}
        // on a phone the toolbar wraps instead of hiding buttons off the edge
        className={`[&_[role=toolbar]]:flex-wrap ${dark ? "dark-theme" : ""}`}
        contentEditableClassName={contentClass}
        plugins={[
          headingsPlugin({ allowedHeadingLevels: [2, 3] }),
          listsPlugin(),
          quotePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          thematicBreakPlugin(),
          markdownShortcutPlugin(),
          diffSourcePlugin({ viewMode: "rich-text" }),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper options={["rich-text", "source"]}>
                <UndoRedo />
                <Separator />
                <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
                <Separator />
                <BlockTypeSelect />
                <ListsToggle options={["bullet", "number"]} />
                <CreateLink />
                <InsertThematicBreak />
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />
      {value !== null && <input type="hidden" name={name} value={value} data-dirty="" />}
    </div>
  );
}
