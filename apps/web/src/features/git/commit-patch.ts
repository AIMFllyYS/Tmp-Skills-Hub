import type { UnifiedDiffFile, UnifiedDiffHunk } from "@/components/ui/diff-viewer";

const pathEscapes: Record<string, string> = {
  a: "\u0007", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", '"': '"', "\\": "\\",
};

function readPath(header: string, skill: string): string | null {
  // Git emits the same path twice because the endpoint turns rename detection off.
  const divider = (header.length - 1) / 2;
  if (!Number.isInteger(divider) || header[divider] !== " ") return null;
  const destination = header.slice(divider + 1);
  const path = destination.startsWith('"')
    ? destination.slice(1, -1).replace(/\\([abfnrtv"\\]|[0-7]{3})/g,
      (_, escape: string) => pathEscapes[escape] ?? String.fromCharCode(Number.parseInt(escape, 8)))
    : destination;
  const prefix = "b/" + skill + "/";
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

export function parseCommitPatch(patch: string, skill: string): UnifiedDiffFile[] {
  const files: UnifiedDiffFile[] = [];
  let file: UnifiedDiffFile | null = null;
  let hunk: UnifiedDiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const relPath = readPath(line.slice("diff --git ".length), skill);
      file = relPath === null ? null : { relPath, status: "modified", hunks: [] };
      if (file !== null) files.push(file);
      hunk = null;
      continue;
    }
    if (file === null) continue;
    const range = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (range !== null) {
      hunk = { header: line, lines: [] };
      file.hunks?.push(hunk);
      oldLine = Number(range[1]);
      newLine = Number(range[2]);
    } else if (hunk !== null) {
      const text = line.slice(1);
      if (line.startsWith("+")) hunk.lines.push({ kind: "add", newLine: newLine++, text });
      if (line.startsWith("-")) hunk.lines.push({ kind: "del", oldLine: oldLine++, text });
      if (line.startsWith(" ")) hunk.lines.push({ kind: "context", oldLine: oldLine++, newLine: newLine++, text });
    } else {
      if (line.startsWith("new file mode ")) file.status = "added";
      if (line.startsWith("deleted file mode ")) file.status = "removed";
      if (line.startsWith("Binary files ") || line === "GIT binary patch") file.isBinary = true;
    }
  }
  return files;
}
