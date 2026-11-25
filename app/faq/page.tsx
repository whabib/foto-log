import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { marked } from "marked";

export const metadata: Metadata = { title: "FAQ · Foto-log" };

/**
 * The FAQ, written in content/faq.md. The page renders per request so the
 * shared header shows who's signed in; the Markdown is read and parsed once
 * per server instance. next.config.ts ships the file with the build.
 */
let faqHtml: Promise<string> | null = null;

function loadFaq(): Promise<string> {
  faqHtml ??= readFile(path.join(process.cwd(), "content", "faq.md"), "utf8")
    .then((markdown) => marked.parse(markdown))
    .catch((err) => {
      faqHtml = null;
      throw err;
    });
  return faqHtml;
}

export default async function FaqPage() {
  const html = await loadFaq();
  return <main className="faq-page" dangerouslySetInnerHTML={{ __html: html }} />;
}
