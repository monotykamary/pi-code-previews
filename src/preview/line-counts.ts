import { forEachRawTextLine } from "../shared/text-lines";

export function countContentLines(content: string): number {
  if (!content) return 0;
  let terminators = 0;
  for (let index = 0; index < content.length; index++) {
    const code = content.charCodeAt(index);
    if (code === 13) {
      terminators++;
      if (content.charCodeAt(index + 1) === 10) index++;
    } else if (code === 10) {
      terminators++;
    }
  }
  const finalCode = content.charCodeAt(content.length - 1);
  return terminators + (finalCode === 10 || finalCode === 13 ? 0 : 1);
}

export function countPreviewTextLines(text: string): number {
  let total = 0;
  forEachPreviewTextLine(text, () => {
    total++;
  });
  return total;
}

export function forEachPreviewTextLine(
  text: string,
  callback: (line: string, index: number) => void,
): void {
  let index = 0;
  let pendingEmpty = 0;
  forEachRawTextLine(text, (line) => {
    if (line === "") {
      pendingEmpty++;
      return;
    }
    while (pendingEmpty > 0) {
      callback("", index++);
      pendingEmpty--;
    }
    callback(line, index++);
  });
  if (index === 0 && pendingEmpty > 0 && text.length > 0) callback("", index);
}
