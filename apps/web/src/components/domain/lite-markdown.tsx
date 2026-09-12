import type { ReactNode } from "react";

/**
 * Renders **bold**, *italic*, [links](url) and `- ` bullet lists — just
 * enough of markdown that an announcement written with basic formatting
 * doesn't show up as literal asterisks and brackets. A dependency (e.g.
 * react-markdown) is overkill for four inline patterns and no nesting.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-${i++}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={`${keyPrefix}-${i++}`}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      parts.push(
        <a
          key={`${keyPrefix}-${i++}`}
          href={match[4]}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {match[3]}
        </a>,
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function LiteMarkdown({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = (key: string) => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="list-inside list-disc">
        {bulletBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  };

  lines.forEach((line, idx) => {
    const bulletMatch = /^[-*]\s+(.*)/.exec(line.trim());
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
      return;
    }
    flushBullets(`ul-${idx}`);
    if (line.trim() === "") return;
    blocks.push(<p key={`p-${idx}`}>{renderInline(line, `p-${idx}`)}</p>);
  });
  flushBullets("ul-end");

  return <div className={className}>{blocks}</div>;
}
