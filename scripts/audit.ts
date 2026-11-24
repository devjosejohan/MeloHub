import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_FILE_BYTES = 100 * 1024;

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface GitFile {
  status: string;
  path: string;
  oldPath?: string;
  category: "modified" | "added" | "deleted" | "untracked" | "renamed";
}

export interface GitInfo {
  branch: string;
  commit: string;
  statusBuffer: Buffer;
  files: GitFile[];
  diffStat: string;
  diff: string;
}

export interface NewFileContent {
  path: string;
  content?: string;
  omittedReason?: string;
  redacted?: boolean;
}

export interface AuditIssue {
  severity: "error" | "warning";
  source: string;
  message: string;
}

export interface FileSummary {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  renamed: Array<{ oldPath: string; newPath: string }>;
}

export interface AuditReport {
  id: string;
  timestamp: string;
  branch: string;
  commit: string;
  git: {
    branch: string;
    commit: string;
    modified: string[];
    added: string[];
    deleted: string[];
    untracked: string[];
    renamed: Array<{ oldPath: string; newPath: string }>;
  };
  files: Array<{
    path: string;
    category: GitFile["category"];
    oldPath?: string;
    included: boolean;
    omittedReason?: string;
  }>;
  changes: {
    diffStat: string;
    diff: string;
    newFiles: NewFileContent[];
  };
  checks: CommandResult[];
  issues: AuditIssue[];
  omittedFiles: Array<{ path: string; reason: string }>;
  result: "PASS" | "FAIL";
  recommendation: string;
}

function truncate(str: string, max = 20_000): string {
  if (str.length <= max) {
    return str;
  }
  const keep = Math.floor(max / 2);
  return `${str.slice(0, keep)}\n... [truncated ${str.length - max} characters] ...\n${str.slice(-keep)}`;
}

function redactText(text: string): string {
  return redactSecrets(text).text;
}

function sanitizeGitMetadata(report: AuditReport): AuditReport {
  return {
    ...report,
    branch: redactText(report.branch),
    commit: redactText(report.commit),
    git: {
      ...report.git,
      branch: redactText(report.git.branch),
      commit: redactText(report.git.commit),
      modified: report.git.modified.map(redactText),
      added: report.git.added.map(redactText),
      deleted: report.git.deleted.map(redactText),
      untracked: report.git.untracked.map(redactText),
      renamed: report.git.renamed.map((r) => ({
        oldPath: redactText(r.oldPath),
        newPath: redactText(r.newPath),
      })),
    },
    files: report.files.map((f) => ({
      ...f,
      path: redactText(f.path),
      oldPath: f.oldPath === undefined ? undefined : redactText(f.oldPath),
      omittedReason: f.omittedReason === undefined ? undefined : redactText(f.omittedReason),
    })),
    changes: {
      ...report.changes,
      newFiles: report.changes.newFiles.map((nf) => ({
        ...nf,
        path: redactText(nf.path),
        omittedReason: nf.omittedReason === undefined ? undefined : redactText(nf.omittedReason),
      })),
    },
    omittedFiles: report.omittedFiles.map((of) => ({
      path: redactText(of.path),
      reason: redactText(of.reason),
    })),
    issues: report.issues.map((issue) => ({
      ...issue,
      source: redactText(issue.source),
      message: redactText(issue.message),
    })),
  };
}

function truncateForJson(str: string, max = 20_000): string {
  if (str.length <= max) {
    return str;
  }
  const keep = Math.floor(max / 2);
  return `${str.slice(0, keep)}\n... [truncated ${str.length - max} characters from JSON export] ...\n${str.slice(-keep)}`;
}

function sanitizeForJson(report: AuditReport): AuditReport {
  return {
    ...report,
    changes: {
      diffStat: truncateForJson(report.changes.diffStat),
      diff: truncateForJson(report.changes.diff),
      newFiles: report.changes.newFiles.map((nf) => ({
        ...nf,
        content: nf.content === undefined ? undefined : truncateForJson(nf.content),
      })),
    },
    checks: report.checks.map((check) => ({
      ...check,
      stdout: truncateForJson(check.stdout),
      stderr: truncateForJson(check.stderr),
    })),
  };
}

function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  const label = [command, ...args].join(" ");
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      resolve({
        command: label,
        exitCode: 1,
        stdout: "",
        stderr: String(error),
        durationMs: Date.now() - start,
      });
    });
    child.on("close", (code) => {
      resolve({
        command: label,
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        durationMs: Date.now() - start,
      });
    });
  });
}

function runNpmScript(script: string, cwd: string): Promise<CommandResult> {
  const command = process.platform === "win32" ? `npm.cmd run ${script}` : `npm run ${script}`;
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      resolve({
        command,
        exitCode: 1,
        stdout: "",
        stderr: String(error),
        durationMs: Date.now() - start,
      });
    });
    child.on("close", (code) => {
      resolve({
        command,
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        durationMs: Date.now() - start,
      });
    });
  });
}

export function parseStatusBuffer(buffer: Buffer): GitFile[] {
  const raw = buffer.toString("utf8");
  const tokens = raw.split("\0");
  const files: GitFile[] = [];
  let expectOldPath = false;

  for (const token of tokens) {
    if (!token) {
      continue;
    }

    if (expectOldPath) {
      const previous = files[files.length - 1];
      if (previous) {
        previous.oldPath = token;
      }
      expectOldPath = false;
      continue;
    }

    if (token.length >= 3 && token[2] === " ") {
      const status = token.slice(0, 2);
      const path = token.slice(3);
      files.push({ status, path, category: classifyStatus(status) });
      expectOldPath = status.startsWith("R") || status.startsWith("C");
    }
  }

  return files;
}

export function classifyStatus(status: string): GitFile["category"] {
  if (status === "??") {
    return "untracked";
  }
  if (status.startsWith("R") || status.startsWith("C") || status.endsWith("R")) {
    return "renamed";
  }
  if (status.includes("D")) {
    return "deleted";
  }
  if (status.includes("A")) {
    return "added";
  }
  return "modified";
}

async function collectGit(root: string): Promise<{ ok: true; info: GitInfo } | { ok: false; error: string }> {
  const branchResult = await runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], root);
  const commitResult = await runCommand("git", ["rev-parse", "HEAD"], root);
  const statusResult = await runCommand("git", ["status", "--porcelain=v1", "-z", "-uall"], root);
  const diffStatResult = await runCommand("git", ["diff", "--stat", "HEAD"], root);
  const diffResult = await runCommand("git", ["diff", "HEAD"], root);

  const failures: string[] = [];
  if (branchResult.exitCode !== 0) failures.push(redactSecrets(`git branch: ${branchResult.stderr || branchResult.stdout}`).text);
  if (commitResult.exitCode !== 0) failures.push(redactSecrets(`git commit: ${commitResult.stderr || commitResult.stdout}`).text);
  if (statusResult.exitCode !== 0) failures.push(redactSecrets(`git status: ${statusResult.stderr || statusResult.stdout}`).text);
  if (diffStatResult.exitCode !== 0) failures.push(redactSecrets(`git diff --stat: ${diffStatResult.stderr || diffStatResult.stdout}`).text);
  if (diffResult.exitCode !== 0) failures.push(redactSecrets(`git diff: ${diffResult.stderr || diffResult.stdout}`).text);

  if (failures.length > 0) {
    return { ok: false, error: failures.join("; ") };
  }

  return {
    ok: true,
    info: {
      branch: branchResult.stdout.trim(),
      commit: commitResult.stdout.trim(),
      statusBuffer: Buffer.from(statusResult.stdout, "utf8"),
      files: parseStatusBuffer(Buffer.from(statusResult.stdout, "utf8")),
      diffStat: redactSecrets(diffStatResult.stdout.trimEnd()).text,
      diff: diffResult.stdout.trimEnd(),
    },
  };
}

const IGNORED_PATH_PREFIXES = [".git/", "node_modules/", "dist/", "coverage/", ".audit/"];
const IGNORED_EXTENSIONS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".mp3", ".mp4", ".wav", ".flac", ".aac", ".ogg", ".webm",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
]);

function isIgnoredPath(relPath: string): string | undefined {
  const normalized = relPath.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const basename = lower.split("/").pop() ?? "";

  if (basename.startsWith(".env")) {
    return "environment file excluded";
  }
  if (basename.endsWith(".log")) {
    return "log file excluded";
  }
  for (const prefix of IGNORED_PATH_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return `${prefix} directory excluded`;
    }
  }
  const ext = lower.slice(lower.lastIndexOf("."));
  if (IGNORED_EXTENSIONS.has(ext)) {
    return `${ext} binary file excluded`;
  }
  return undefined;
}

function isInsideProject(root: string, absPath: string): boolean {
  const safeRoot = root.endsWith(sep) ? root : root + sep;
  return absPath === root || absPath.startsWith(safeRoot);
}

export async function hasSymlinkInPath(root: string, absPath: string): Promise<string | undefined> {
  const relativePath = relative(root, absPath);
  if (!relativePath || relativePath.startsWith("..")) {
    return "outside project root";
  }

  const parts = relativePath.split(sep);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    let stats;
    try {
      stats = await lstat(current);
    } catch {
      return undefined;
    }
    if (stats.isSymbolicLink()) {
      return `symbolic link in path: ${relative(root, current)}`;
    }
  }
  return undefined;
}

function isBinaryBuffer(buffer: Buffer): boolean {
  for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
    if (buffer[i] === 0x00) {
      return true;
    }
  }
  return false;
}

const PRIVATE_KEY_BEGIN = /^[\s"']*-----BEGIN ((?:RSA |OPENSSH |EC |DSA |PGP )?)PRIVATE KEY(?: BLOCK)?-----/;
const PRIVATE_KEY_END = /^[\s"']*-----END (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/;

const SECRET_PATTERNS = [
  { name: "AWS access key", pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/ },
  { name: "GitHub token", pattern: /(?<![A-Za-z0-9_])gh[psuor]_[A-Za-z0-9_]{36,}(?![A-Za-z0-9_])/ },
  { name: "authorization bearer", pattern: /Authorization:\s*Bearer\s+\S+/i },
  {
    name: "generic secret",
    pattern: /(?<![A-Za-z0-9])(?:api[_-]?key|apikey|secret|token|password|passwd|pwd)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}['"]?(?![A-Za-z0-9])/i,
  },
];

export function detectSecret(line: string): string | undefined {
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(line)) {
      return name;
    }
  }
  return undefined;
}

export function redactSecrets(text: string): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const lines = text.split("\n");
  let inBlock = false;
  let blockType = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (inBlock) {
      if (PRIVATE_KEY_END.test(line)) {
        lines[i] = `[REDACTED: ${blockType}private key block end]`;
        inBlock = false;
        blockType = "";
      } else {
        lines[i] = "[REDACTED: private key content]";
      }
      continue;
    }

    const beginMatch = line.match(PRIVATE_KEY_BEGIN);
    if (beginMatch) {
      inBlock = true;
      blockType = beginMatch[1] ?? "";
      lines[i] = `[REDACTED: possible ${blockType}private key block]`;
      warnings.push(`line ${i + 1}: possible ${blockType}private key block`);
      continue;
    }

    const secretType = detectSecret(line);
    if (secretType) {
      lines[i] = `[REDACTED: possible ${secretType}]`;
      warnings.push(`line ${i + 1}: possible ${secretType}`);
    }
  }

  // Conservative: if a block was opened but never closed, redact everything that follows.
  if (inBlock) {
    warnings.push("private key block started but no end marker found; remaining content redacted");
  }

  return { text: lines.join("\n"), warnings };
}

async function collectNewFile(
  root: string,
  relPath: string,
  issues: AuditIssue[],
): Promise<NewFileContent> {
  const absPath = resolve(root, relPath);
  if (!isAbsolute(absPath) || !isInsideProject(root, absPath)) {
    return { path: relPath, omittedReason: "outside project root" };
  }

  const symlinkReason = await hasSymlinkInPath(root, absPath);
  if (symlinkReason) {
    return { path: relPath, omittedReason: symlinkReason };
  }

  const ignoredReason = isIgnoredPath(relPath);
  if (ignoredReason) {
    return { path: relPath, omittedReason: ignoredReason };
  }

  let fileStat;
  try {
    fileStat = await lstat(absPath);
  } catch {
    return { path: relPath, omittedReason: "could not read file metadata" };
  }

  if (fileStat.isSymbolicLink()) {
    return { path: relPath, omittedReason: "symbolic link excluded" };
  }

  if (!fileStat.isFile()) {
    return { path: relPath, omittedReason: "not a regular file" };
  }

  if (fileStat.size > MAX_FILE_BYTES) {
    return { path: relPath, omittedReason: `file exceeds ${MAX_FILE_BYTES} bytes` };
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(absPath);
  } catch {
    return { path: relPath, omittedReason: "could not read file" };
  }

  if (isBinaryBuffer(buffer)) {
    return { path: relPath, omittedReason: "binary content" };
  }

  const raw = buffer.toString("utf8");
  const { text, warnings } = redactSecrets(raw);
  for (const warning of warnings) {
    issues.push({ severity: "warning", source: relPath, message: warning });
  }

  return { path: relPath, content: text, redacted: warnings.length > 0 };
}

async function collectNewFiles(
  root: string,
  files: GitFile[],
  issues: AuditIssue[],
): Promise<NewFileContent[]> {
  const result: NewFileContent[] = [];
  for (const file of files) {
    if (file.category === "untracked" || file.category === "added") {
      result.push(await collectNewFile(root, file.path, issues));
    }
  }
  return result;
}

async function runChecks(root: string, issues: AuditIssue[]): Promise<CommandResult[]> {
  const scripts = ["typecheck", "test", "catalog:editorial", "catalog:public"];
  const results: CommandResult[] = [];
  for (const script of scripts) {
    const raw = await runNpmScript(script, root);
    const redactedStdout = redactSecrets(raw.stdout);
    const redactedStderr = redactSecrets(raw.stderr);

    for (const warning of redactedStdout.warnings) {
      issues.push({ severity: "warning", source: `${raw.command} stdout`, message: warning });
    }
    for (const warning of redactedStderr.warnings) {
      issues.push({ severity: "warning", source: `${raw.command} stderr`, message: warning });
    }

    results.push({
      ...raw,
      stdout: redactedStdout.text,
      stderr: redactedStderr.text,
    });
  }
  return results;
}

function buildFileSummary(files: GitFile[]): FileSummary {
  const modified: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  const untracked: string[] = [];
  const renamed: Array<{ oldPath: string; newPath: string }> = [];

  for (const file of files) {
    switch (file.category) {
      case "modified":
        modified.push(file.path);
        break;
      case "added":
        added.push(file.path);
        break;
      case "deleted":
        deleted.push(file.path);
        break;
      case "untracked":
        untracked.push(file.path);
        break;
      case "renamed":
        renamed.push({ oldPath: file.oldPath ?? file.path, newPath: file.path });
        break;
    }
  }

  return { modified, added, deleted, untracked, renamed };
}

function buildFilesList(files: GitFile[], newFiles: NewFileContent[]): AuditReport["files"] {
  const byPath = new Map<string, NewFileContent>();
  for (const nf of newFiles) {
    byPath.set(nf.path, nf);
  }

  return files.map((file) => {
    const nf = byPath.get(file.path);
    return {
      path: file.path,
      category: file.category,
      oldPath: file.oldPath,
      included: !nf?.omittedReason,
      omittedReason: nf?.omittedReason,
    };
  });
}

export function generateId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const ms = now.getUTCMilliseconds().toString().padStart(3, "0");
  const suffix = randomBytes(3).toString("hex");
  return `audit-${date}-${time}-${ms}-${suffix}`;
}

function formatCheck(check: CommandResult): string {
  const result = check.exitCode === 0 ? "PASS" : "FAIL";
  return [
    `**${check.command}** — ${result} (exit ${check.exitCode}, ${check.durationMs}ms)`,
    "",
    check.stdout ? `**stdout:**\n\`\`\`\n${truncate(check.stdout)}\n\`\`\`` : "",
    check.stderr ? `**stderr:**\n\`\`\`\n${truncate(check.stderr)}\n\`\`\`` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function generateMarkdown(report: AuditReport): string {
  const lines: string[] = [
    "# MeloHub Audit Report",
    "",
    `- **ID:** ${report.id}`,
    `- **Date:** ${report.timestamp}`,
    `- **Branch:** ${report.branch}`,
    `- **Commit:** ${report.commit}`,
    `- **Result:** ${report.result}`,
    "",
    "## Summary",
    "",
    `Checks passed: ${report.checks.filter((c) => c.exitCode === 0).length} / ${report.checks.length}`,
    `Files changed: ${report.files.length}`,
    `Warnings: ${report.issues.filter((i) => i.severity === "warning").length}`,
    `Errors: ${report.issues.filter((i) => i.severity === "error").length}`,
    "",
    "## Git status",
    "",
    "| Category | Count |",
    "| --- | --- |",
    `| Modified | ${report.git.modified.length} |`,
    `| Added | ${report.git.added.length} |`,
    `| Deleted | ${report.git.deleted.length} |`,
    `| Untracked | ${report.git.untracked.length} |`,
    `| Renamed | ${report.git.renamed.length} |`,
    "",
    "### Files",
    "",
    ...report.files.map((f) => {
      const suffix = f.omittedReason ? ` (omitted: ${f.omittedReason})` : "";
      const old = f.oldPath && f.oldPath !== f.path ? ` ← ${f.oldPath}` : "";
      return `- [${f.category}] ${f.path}${old}${suffix}`;
    }),
    "",
    "## Checks",
    "",
    ...report.checks.flatMap((check) => [formatCheck(check), ""]),
    "## New files (untracked and staged)",
    "",
    ...report.changes.newFiles.flatMap((nf) => {
      if (nf.omittedReason) {
        return [`- **${nf.path}**: omitted (${nf.omittedReason})`];
      }
      return [
        `### ${nf.path}${nf.redacted ? " (redacted)" : ""}`,
        "",
        "```",
        truncate(nf.content ?? ""),
        "```",
        "",
      ];
    }),
    "",
    "## Issues",
    "",
    ...(report.issues.length === 0
      ? ["No issues reported."]
      : report.issues.map((issue) => `- **[${issue.severity.toUpperCase()}]** ${issue.source}: ${issue.message}`)),
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Diff",
    "",
    report.changes.diffStat ? `**Diff stat:**\n\`\`\`\n${report.changes.diffStat}\n\`\`\`` : "",
    "",
    "```diff",
    truncate(report.changes.diff),
    "```",
    "",
  ];
  return lines.join("\n");
}

export async function runAudit(root: string): Promise<AuditReport> {
  const issues: AuditIssue[] = [];
  const gitResult = await collectGit(root);

  if (!gitResult.ok) {
    issues.push({ severity: "error", source: "git", message: gitResult.error });
    const checks = await runChecks(root, issues);
    for (const check of checks) {
      if (check.exitCode !== 0) {
        issues.push({
          severity: "error",
          source: check.command,
          message: `exited with code ${check.exitCode}`,
        });
      }
    }
    return sanitizeGitMetadata({
      id: generateId(),
      timestamp: new Date().toISOString(),
      branch: "unknown",
      commit: "unknown",
      git: { branch: "unknown", commit: "unknown", modified: [], added: [], deleted: [], untracked: [], renamed: [] },
      files: [],
      changes: { diffStat: "", diff: "", newFiles: [] },
      checks,
      issues,
      omittedFiles: [],
      result: "FAIL",
      recommendation: "Git state could not be determined. Fix the Git errors before reviewing.",
    });
  }

  const git = gitResult.info;
  const summary = buildFileSummary(git.files);

  const { text: redactedDiff, warnings: diffWarnings } = redactSecrets(git.diff);
  for (const warning of diffWarnings) {
    issues.push({ severity: "warning", source: "git diff", message: warning });
  }

  const newFiles = await collectNewFiles(root, git.files, issues);
  const checks = await runChecks(root, issues);

  for (const check of checks) {
    if (check.exitCode !== 0) {
      issues.push({
        severity: "error",
        source: check.command,
        message: `exited with code ${check.exitCode}`,
      });
    }
  }

  const failed = checks.some((c) => c.exitCode !== 0);
  const result: AuditReport["result"] = failed ? "FAIL" : "PASS";
  const recommendation = failed
    ? "One or more checks failed. Review the errors above before proceeding."
    : "All checks passed. The changes are ready for human review.";

  return sanitizeGitMetadata({
    id: generateId(),
    timestamp: new Date().toISOString(),
    branch: git.branch,
    commit: git.commit,
    git: { branch: git.branch, commit: git.commit, ...summary },
    files: buildFilesList(git.files, newFiles),
    changes: { diffStat: git.diffStat, diff: redactedDiff, newFiles },
    checks,
    issues,
    omittedFiles: newFiles
      .filter((nf) => nf.omittedReason)
      .map((nf) => ({ path: nf.path, reason: nf.omittedReason ?? "unknown" })),
    result,
    recommendation,
  });
}

export async function writeAuditReports(root: string, report: AuditReport): Promise<string> {
  const auditDir = join(root, ".audit", report.id);
  await mkdir(auditDir, { recursive: true });
  await writeFile(join(auditDir, "audit.json"), JSON.stringify(sanitizeForJson(report), null, 2));
  await writeFile(join(auditDir, "audit.md"), generateMarkdown(report));
  return auditDir;
}

async function main(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const root = resolve(scriptDir, "..");

  console.log("Running MeloHub audit...");
  const report = await runAudit(root);
  const auditDir = await writeAuditReports(root, report);

  console.log(`\nResult: ${report.result}`);
  console.log(`Checks: ${report.checks.filter((c) => c.exitCode === 0).length}/${report.checks.length} passed`);
  console.log(`Files changed: ${report.files.length}`);
  console.log(`Issues: ${report.issues.length}`);
  console.log(`\nReport written to: ${auditDir}`);

  if (report.result === "FAIL") {
    process.exit(1);
  }
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
