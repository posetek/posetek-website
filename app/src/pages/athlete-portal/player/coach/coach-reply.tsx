import { Fragment } from 'react';
import type { ReactNode } from 'react';

/**
 * How a coach reply is drawn, ported from the app's `CoachReplyFormatting`
 * (KickAI/LLM/CoachReplyText.swift). The coach is asked for plain text, but replies already in
 * history carry markdown: headings become bold lines, "-" and "*" list markers become bullets,
 * rules and code fences disappear, "> " quotes lose their marker; inline emphasis and links render.
 * A single * between letters or digits ("3*10 squats") and any single ~ ("8~10 reps") stay text.
 */
export type ReplyLine = { text: string; bold: boolean };

const isRule = (trimmed: string) => {
  const marks = trimmed.replaceAll(' ', '');
  return marks.length >= 3 && '-*_'.includes(marks[0]) && [...marks].every(mark => mark === marks[0]);
};

/** One line with its block syntax rewritten; dropped lines are left out. */
export function coachReplyLines(reply: string): ReplyLine[] {
  const lines: ReplyLine[] = [];
  for (const line of String(reply ?? '').split('\n')) {
    const trimmed = line.trim();
    if (isRule(trimmed) || trimmed.startsWith('```')) continue;
    // A bare "##" is a heading still streaming in.
    const heading = /^#{1,6}(\s+|$)/.exec(trimmed);
    if (heading) {
      const title = trimmed.slice(heading[0].length).replaceAll('**', '').trim();
      lines.push({ text: title, bold: !!title });
      continue;
    }
    const bullet = /^\s*[-*]\s+/.exec(line);
    if (bullet) { lines.push({ text: `• ${line.slice(bullet[0].length)}`, bold: false }); continue; }
    // "> " quotes only; ">80% max HR" is text.
    const quote = /^\s*>\s+/.exec(line);
    lines.push({ text: quote ? line.slice(quote[0].length) : line, bold: false });
  }
  return lines;
}

const wordCharacter = (character: string | undefined) => !!character && /[\p{L}\p{N}]/u.test(character);
const space = (character: string | undefined) => !character || /\s/.test(character);

/** Inline emphasis, strikethrough, code and http(s) links, as React nodes. */
export function coachReplyInline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let buffer = '', index = 0, count = 0;
  const flush = () => { if (buffer) { out.push(buffer); buffer = ''; } };
  const next = () => `${key}.${count++}`;
  while (index < text.length) {
    const character = text[index];
    if (character === '`') {
      const end = text.indexOf('`', index + 1);
      if (end > index + 1) { flush(); out.push(<code key={next()}>{text.slice(index + 1, end)}</code>); index = end + 1; continue; }
    }
    if (character === '[') {
      const link = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/.exec(text.slice(index));
      if (link) {
        flush(); const id = next();
        out.push(<a key={id} href={link[2]} target="_blank" rel="noreferrer">{coachReplyInline(link[1], id)}</a>);
        index += link[0].length; continue;
      }
    }
    if (character === '*' || character === '_' || character === '~') {
      let end = index;
      while (text[end] === character) end++;
      const run = end - index, before = text[index - 1], after = text[end];
      const literal = run > 2 || (character === '~' && run === 1) ||
        (run === 1 && character === '*' && wordCharacter(before) && wordCharacter(after)) ||
        (character === '_' && wordCharacter(before));
      if (!literal && !space(after)) {
        const marker = character.repeat(run);
        let search = end, close = -1;
        while ((search = text.indexOf(marker, search)) !== -1) {
          const exact = text[search - 1] !== character && text[search + run] !== character;
          const intraword = run === 1 && character === '*' && wordCharacter(text[search - 1]) && wordCharacter(text[search + run]);
          const underscoreOk = character !== '_' || !wordCharacter(text[search + run]);
          if (search > end && exact && !space(text[search - 1]) && !intraword && underscoreOk) { close = search; break; }
          search += run;
        }
        if (close !== -1) {
          flush(); const id = next(), inner = coachReplyInline(text.slice(end, close), id);
          out.push(character === '~' ? <s key={id}>{inner}</s> : run === 2 ? <strong key={id}>{inner}</strong> : <em key={id}>{inner}</em>);
          index = close + run; continue;
        }
      }
      buffer += text.slice(index, end); index = end; continue;
    }
    buffer += character; index++;
  }
  flush();
  return out;
}

/** The coach's reply, formatted. The athlete's own words are shown verbatim elsewhere. */
export function CoachReplyText({ text }: { text: string }) {
  return <>{coachReplyLines(text).map((line, index) => <Fragment key={index}>
    {index > 0 && <br />}
    {line.bold ? <strong>{coachReplyInline(line.text, `l${index}`)}</strong> : coachReplyInline(line.text, `l${index}`)}
  </Fragment>)}</>;
}
