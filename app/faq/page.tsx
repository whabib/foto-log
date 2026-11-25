import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { marked } from "marked";

export const metadata: Metadata = { title: "FAQ · Foto-log" };

// Rendered at build time from the repo's content/faq.md, so editing that file
// and merging is all it takes to update the page.
export const dynamic = "force-static";

/** The FAQ, from content/faq.md. The file is ours, so its Markdown (and any HTML in it) is trusted. */
export default async function FaqPage() {
  const markdown = await readFile(path.join(process.cwd(), "content", "faq.md"), "utf8");
  const html = await marked.parse(markdown);
  return <main className="faq-page" dangerouslySetInnerHTML={{ __html: html }} />;
}
