export function pktLine(data: string | Uint8Array): Uint8Array {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const len = bytes.length + 4;
  const h = len.toString(16).padStart(4, "0");
  const hb = new TextEncoder().encode(h);
  const out = new Uint8Array(hb.length + bytes.length);
  out.set(hb); out.set(bytes, hb.length);
  return out;
}



export function pktFlush(): Uint8Array {
  return new TextEncoder().encode("0000");
}

export function* pktEncode(lines: string[]): Generator<Uint8Array> {
  for (const line of lines) {
    if (line === "0000") yield pktFlush();
    else yield pktLine(line);
  }
  yield pktFlush();
}

export function parsePktLines(data: Uint8Array): string[] {
  const lines: string[] = [];
  let i = 0;
  while (i < data.length) {
    const h = new TextDecoder().decode(data.slice(i, i + 4));
    if (h === "0000") { lines.push("0000"); i += 4; continue; }
    const len = parseInt(h, 16);
    if (len < 4) break;
    lines.push(new TextDecoder().decode(data.slice(i + 4, i + len)));
    i += len;
  }
  return lines;
}

export function encodeWants(wants: string[], haves: string[], capabilities: string[]): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  const capStr = capabilities.length > 0 ? ` ${capabilities.join(" ")}` : "";
  wants.forEach((w, i) => chunks.push(pktLine(`${i === 0 ? "want" : "want"} ${w}${i === 0 ? capStr : ""}\n`)));
  haves.forEach(h => chunks.push(pktLine(`have ${h}\n`)));
  chunks.push(pktLine("done\n"));
  chunks.push(pktFlush());
  return chunks;
}

export function encodeRefAdvert(refs: { ref: string; sha: string }[], service: string, caps: string[]): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  const firstLine = `# service=${service}\n`;
  chunks.push(pktLine(firstLine));
  chunks.push(pktFlush());
  const capStr = caps.length > 0 ? "\x00" + caps.join(" ") : "";
  refs.forEach((r, i) => {
    const line = r.sha + " " + r.ref + (i === 0 ? capStr : "") + "\n";
    chunks.push(pktLine(line));
  });
  chunks.push(pktFlush());
  return chunks;
}
