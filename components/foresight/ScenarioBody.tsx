// Renders a scenario's Markdown `body` in the app's editorial style.
//
// react-markdown v10 is a pure component and renders fine in a Server Component.
// We do NOT enable rehype-raw: the body is trusted (published server-side) but
// there's no reason to allow embedded HTML, and skipping it keeps rendering safe.

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-8 mb-3 text-[24px] font-extrabold uppercase leading-[1.08] tracking-tight text-ink">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-7 mb-2.5 text-[19px] font-extrabold uppercase leading-[1.1] tracking-tight text-ink">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mb-4 text-[16px] leading-[1.6] text-ink">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-4 list-disc space-y-1.5 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 list-decimal space-y-1.5 pl-5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[16px] leading-[1.55] text-ink">{children}</li>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="serif my-5 border-l-2 border-ink pl-4 text-[18px] italic leading-[1.35] text-muted">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-6 border-0 border-t border-[var(--rule)]" />,
  code: ({ children }) => (
    <code className="rounded-[2px] border border-[var(--hairline)] bg-card px-1 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-[3px] border border-[var(--hairline)] bg-card p-3 font-mono text-[13px] leading-[1.5]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[var(--hairline)] bg-card px-2.5 py-1.5 text-left font-bold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-[var(--hairline)] px-2.5 py-1.5 align-top">
      {children}
    </td>
  ),
};

export function ScenarioBody({ body }: { body: string }) {
  return (
    <div className="max-w-[680px]">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </Markdown>
    </div>
  );
}
