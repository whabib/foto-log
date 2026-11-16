import type { MetadataRoute } from "next";

/**
 * Crawlers known to gather pages for AI models or AI search. They're also
 * covered by "*", but some only act on a rule that names them.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "PerplexityBot",
  "Perplexity-User",
  "Meta-ExternalAgent",
  "Bytespider",
  "Amazonbot",
  "cohere-ai",
  "Diffbot",
  "omgili",
  "YouBot",
];

/** foto-log asks every search engine and AI crawler to stay out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", disallow: "/" },
      { userAgent: AI_CRAWLERS, disallow: "/" },
    ],
  };
}
