type RenderedWordEmphasis = {
  content: string;
  ranges: Array<[start: number, end: number]>;
};

const WORD_EMPHASIS_OPEN = new Set([
  "\x1b[48;2;64;132;82m",
  "\x1b[48;2;148;62;70m",
  "\x1b[48;2;194;209;194m",
  "\x1b[48;2;216;182;182m",
]);
const WORD_EMPHASIS_CLOSE = "\x1b[49m";
const SGR_SEQUENCE = /^\x1b\[[0-9;]*m/;

export function parseRenderedWordEmphasis(line: string): RenderedWordEmphasis {
  const pipe = line.indexOf("│ ");
  const code = pipe < 0 ? line : line.slice(pipe + "│ ".length);
  const ranges: Array<[number, number]> = [];
  let content = "";
  let rangeStart: number | undefined;

  for (let index = 0; index < code.length; ) {
    if (code[index] === "\x1b") {
      const sequence = code.slice(index).match(SGR_SEQUENCE)?.[0];
      if (sequence) {
        if (WORD_EMPHASIS_OPEN.has(sequence) && rangeStart === undefined)
          rangeStart = content.length;
        else if (sequence === WORD_EMPHASIS_CLOSE && rangeStart !== undefined) {
          ranges.push([rangeStart, content.length]);
          rangeStart = undefined;
        }
        index += sequence.length;
        continue;
      }
    }
    content += code[index];
    index++;
  }
  if (rangeStart !== undefined)
    throw new Error(`Unterminated word emphasis in ${JSON.stringify(line)}`);
  return { content, ranges };
}

export function renderedWordEmphasisSpans(line: string): string[] {
  const rendered = parseRenderedWordEmphasis(line);
  return rendered.ranges.map(([start, end]) => rendered.content.slice(start, end));
}
