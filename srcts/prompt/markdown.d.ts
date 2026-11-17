// A Markdown file that a module imports with { type: "text" }, as the texts of
// the system prompt are, which esbuild's build gives as the file's text, as
// does the plugin through which the tests' Vite reads it (vitest.config.ts).

declare module "*.md" {
  const text: string;
  export default text;
}
