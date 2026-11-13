// Verify that relative Markdown links in tracked documentation resolve to tracked files.
// External URLs and in-page anchors are ignored; anchors on file links are stripped.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tracked = execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: root, encoding: "utf8" })
  .split("\0").filter(Boolean);
const link = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const broken = [];

for (const file of tracked) {
  if (!existsSync(resolve(root, file))) continue;
  const text = readFileSync(resolve(root, file), "utf8").replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(link)) {
    const target = match[1].split("#")[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) continue;
    const resolved = resolve(root, dirname(file), decodeURI(target));
    if (!existsSync(resolved)) broken.push(`${file}: ${match[1]} -> ${relative(root, resolved)}`);
  }
}

if (broken.length) {
  console.error(`${broken.length} broken documentation link(s):\n` + broken.join("\n"));
  process.exit(1);
}
console.log(`Checked ${tracked.length} Markdown files; all relative links resolve.`);
