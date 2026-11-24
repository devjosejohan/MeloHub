import { execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyStatus,
  detectSecret,
  generateId,
  hasSymlinkInPath,
  parseStatusBuffer,
  redactSecrets,
  runAudit,
  writeAuditReports,
  type AuditReport,
} from "../../scripts/audit";

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function detectSymlinkSupport(): Promise<boolean> {
  const probeDir = await mkdtemp(join(tmpdir(), "melohub-symlink-probe-"));
  const target = join(probeDir, "target");
  const link = join(probeDir, "link");
  await mkdir(target);
  let supported = false;
  try {
    await symlink(target, link, "dir");
    supported = true;
  } catch (error) {
    if (isErrnoException(error) && ["EPERM", "EACCES", "ENOSYS", "ENOTSUP", "EOPNOTSUPP"].includes(error.code ?? "")) {
      console.warn(`Symbolic links not supported in this environment: ${error.code} — ${error.message}`);
      supported = false;
    } else {
      throw error;
    }
  } finally {
    await rm(probeDir, { recursive: true, force: true }).catch(() => {});
  }
  return supported;
}

const symlinksSupported = await detectSymlinkSupport();

describe("parseStatusBuffer", () => {
  it("parses modified, added, deleted and untracked files", () => {
    const input = Buffer.from(" M src/file.ts\0A  src/new.ts\0 D src/old.ts\0?? src/untracked.ts\0", "utf8");
    const result = parseStatusBuffer(input);
    expect(result).toEqual([
      { status: " M", path: "src/file.ts", category: "modified" },
      { status: "A ", path: "src/new.ts", category: "added" },
      { status: " D", path: "src/old.ts", category: "deleted" },
      { status: "??", path: "src/untracked.ts", category: "untracked" },
    ]);
  });

  it("handles paths with spaces using NUL separation", () => {
    const input = Buffer.from("?? path with spaces/file.txt\0", "utf8");
    const result = parseStatusBuffer(input);
    expect(result).toEqual([{ status: "??", path: "path with spaces/file.txt", category: "untracked" }]);
  });

  it("handles renames with original and new path", () => {
    const input = Buffer.from("R  renamed.txt\0original.txt\0", "utf8");
    const result = parseStatusBuffer(input);
    expect(result).toEqual([
      { status: "R ", path: "renamed.txt", oldPath: "original.txt", category: "renamed" },
    ]);
  });

  it("handles renames where paths contain spaces", () => {
    const input = Buffer.from("R  new file.txt\0old file.txt\0", "utf8");
    const result = parseStatusBuffer(input);
    expect(result).toEqual([
      { status: "R ", path: "new file.txt", oldPath: "old file.txt", category: "renamed" },
    ]);
  });

  it("handles renames with special characters", () => {
    const input = Buffer.from("R  new$file.txt\0old#file.txt\0", "utf8");
    const result = parseStatusBuffer(input);
    expect(result).toEqual([
      { status: "R ", path: "new$file.txt", oldPath: "old#file.txt", category: "renamed" },
    ]);
  });

  it("handles consecutive records including renames and other changes", () => {
    const input = Buffer.from(
      " M src/a.ts\0R  renamed.txt\0original.txt\0?? new.txt\0 D src/old.ts\0",
      "utf8",
    );
    const result = parseStatusBuffer(input);
    expect(result).toEqual([
      { status: " M", path: "src/a.ts", category: "modified" },
      { status: "R ", path: "renamed.txt", oldPath: "original.txt", category: "renamed" },
      { status: "??", path: "new.txt", category: "untracked" },
      { status: " D", path: "src/old.ts", category: "deleted" },
    ]);
  });

  it("does not confuse an old path that looks like a status line", () => {
    // The old path happens to have " R" at positions 0-1 and a space at position 2.
    const input = Buffer.from("R  new.txt\0 R x.txt\0", "utf8");
    const result = parseStatusBuffer(input);
    expect(result).toEqual([{ status: "R ", path: "new.txt", oldPath: " R x.txt", category: "renamed" }]);
  });

  it("handles copy records with original path", () => {
    const input = Buffer.from("C  copied.txt\0source.txt\0", "utf8");
    const result = parseStatusBuffer(input);
    expect(result).toEqual([{ status: "C ", path: "copied.txt", oldPath: "source.txt", category: "renamed" }]);
  });
});

describe("classifyStatus", () => {
  it("classifies status codes correctly", () => {
    expect(classifyStatus(" M")).toBe("modified");
    expect(classifyStatus("M ")).toBe("modified");
    expect(classifyStatus("A ")).toBe("added");
    expect(classifyStatus(" D")).toBe("deleted");
    expect(classifyStatus("??")).toBe("untracked");
    expect(classifyStatus("R ")).toBe("renamed");
  });
});

describe("secret detection", () => {
  it("detects an AWS access key", () => {
    expect(detectSecret("AKIAIOSFODNN7EXAMPLE")).toBe("AWS access key");
  });

  it("detects a GitHub token", () => {
    expect(detectSecret("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe("GitHub token");
  });

  it("detects an authorization bearer header", () => {
    expect(detectSecret("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe("authorization bearer");
  });

  it("detects a generic secret assignment", () => {
    expect(detectSecret('api_key="12345678901234567890"')).toBe("generic secret");
  });

  it("redacts AWS secrets and reports warnings", () => {
    const result = redactSecrets("line1\nAWS_KEY=AKIAIOSFODNN7EXAMPLE\nline3");
    expect(result.text).toContain("[REDACTED: possible AWS access key]");
    expect(result.warnings).toHaveLength(1);
  });

  it("redacts an entire RSA private key block", () => {
    const key = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MhgwMbRvI0MBZhpI",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const result = redactSecrets(key);
    expect(result.text).not.toContain("MIIEpAIB");
    expect(result.text).toContain("[REDACTED: possible RSA private key block]");
    expect(result.text).toContain("[REDACTED: private key content]");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("redacts an EC private key block", () => {
    const key = [
      "-----BEGIN EC PRIVATE KEY-----",
      "MHcCAQEEIBG+KDMQ2jC+2p6zJyKpYqPGgH8Z2vPqY8wY3rF6aYlAoGCCqGSM49",
      "-----END EC PRIVATE KEY-----",
    ].join("\n");
    const result = redactSecrets(key);
    expect(result.text).not.toContain("MHcCAQEE");
    expect(result.text).toContain("[REDACTED: possible EC private key block]");
  });

  it("redacts a generic PRIVATE KEY block", () => {
    const key = [
      "-----BEGIN PRIVATE KEY-----",
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7Du",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    const result = redactSecrets(key);
    expect(result.text).not.toContain("MIIEvQIB");
    expect(result.text).toContain("[REDACTED: possible private key block]");
  });

  it("redacts content conservatively when a private key block lacks an end marker", () => {
    const key = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW",
      "this line should also be redacted",
    ].join("\n");
    const result = redactSecrets(key);
    expect(result.text).not.toContain("b3BlbnNzaC");
    expect(result.text).not.toContain("this line should also be redacted");
    expect(result.text).toContain("[REDACTED: possible OPENSSH private key block]");
    expect(result.warnings.some((w) => w.includes("no end marker"))).toBe(true);
  });
});

describe("generateId", () => {
  it("generates unique identifiers across consecutive calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(50);
  });
});

async function createTempRepo(scriptsOverride?: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "melohub-audit-"));
  const scripts = scriptsOverride ?? {
    typecheck: "echo typecheck-ok",
    test: "echo test-ok",
    "catalog:editorial": "echo editorial-ok",
    "catalog:public": "echo public-ok",
  };
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "temp", version: "1.0.0", scripts }, null, 2));
  await writeFile(join(dir, ".gitignore"), ".audit/\n");
  await writeFile(join(dir, "initial.txt"), "initial content\n");

  execSync("git init", { cwd: dir });
  execSync('git config user.email "test@example.com"', { cwd: dir });
  execSync('git config user.name "Test User"', { cwd: dir });
  execSync("git config core.autocrlf false", { cwd: dir });
  execSync("git add .", { cwd: dir });
  execSync('git commit -m "initial"', { cwd: dir });

  return dir;
}

async function gitStatusPorcelain(dir: string): Promise<string> {
  return execSync("git status --porcelain", { cwd: dir, encoding: "utf8" });
}

async function runAndReport(dir: string): Promise<{ report: AuditReport; auditDir: string }> {
  const report = await runAudit(dir);
  const auditDir = await writeAuditReports(dir, report);
  return { report, auditDir };
}

describe("runAudit integration", () => {
  it("reports PASS on a clean repository", async () => {
    const dir = await createTempRepo();
    try {
      const { report } = await runAndReport(dir);
      expect(report.result).toBe("PASS");
      expect(report.git.modified).toEqual([]);
      expect(report.git.untracked).toEqual([]);
      expect(report.checks).toHaveLength(4);
      expect(report.checks.every((c) => c.exitCode === 0)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects modified files", async () => {
    const dir = await createTempRepo();
    try {
      await writeFile(join(dir, "initial.txt"), "modified content\n");
      const { report } = await runAndReport(dir);
      expect(report.git.modified).toContain("initial.txt");
      expect(report.changes.diff).toContain("modified content");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects new untracked files and includes their content", async () => {
    const dir = await createTempRepo();
    try {
      await writeFile(join(dir, "new-file.txt"), "new content\n");
      const { report } = await runAndReport(dir);
      expect(report.git.untracked).toContain("new-file.txt");
      const nf = report.changes.newFiles.find((f) => f.path === "new-file.txt");
      expect(nf).toBeDefined();
      expect(nf?.content).toBe("new content\n");
      expect(nf?.omittedReason).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects staged files and includes their content", async () => {
    const dir = await createTempRepo();
    try {
      await writeFile(join(dir, "staged-file.txt"), "staged content\n");
      execSync("git add staged-file.txt", { cwd: dir });
      const { report } = await runAndReport(dir);
      expect(report.git.added).toContain("staged-file.txt");
      const nf = report.changes.newFiles.find((f) => f.path === "staged-file.txt");
      expect(nf).toBeDefined();
      expect(nf?.content).toBe("staged content\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects deleted files", async () => {
    const dir = await createTempRepo();
    try {
      await rm(join(dir, "initial.txt"));
      const { report } = await runAndReport(dir);
      expect(report.git.deleted).toContain("initial.txt");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects renamed files", async () => {
    const dir = await createTempRepo();
    try {
      execSync("git mv initial.txt renamed.txt", { cwd: dir });
      const { report } = await runAndReport(dir);
      expect(report.git.renamed).toHaveLength(1);
      expect(report.git.renamed[0]).toEqual({ oldPath: "initial.txt", newPath: "renamed.txt" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("handles file names with spaces", async () => {
    const dir = await createTempRepo();
    try {
      await writeFile(join(dir, "file with spaces.txt"), "content\n");
      const { report } = await runAndReport(dir);
      expect(report.git.untracked).toContain("file with spaces.txt");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("redacts possible secrets in new files", async () => {
    const dir = await createTempRepo();
    try {
      await writeFile(join(dir, "secrets.txt"), "API_KEY=1234567890123456\n");
      const { report } = await runAndReport(dir);
      const nf = report.changes.newFiles.find((f) => f.path === "secrets.txt");
      expect(nf?.content).toContain("[REDACTED: possible generic secret]");
      expect(report.issues.some((i) => i.source === "secrets.txt")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("redacts possible secrets emitted by check stdout and stderr", async () => {
    const dir = await createTempRepo({
      typecheck: 'echo "AWS_KEY=AKIAIOSFODNN7EXAMPLE"',
      test: 'echo "ERROR: token=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" >&2; exit 1',
      "catalog:editorial": "echo editorial-ok",
      "catalog:public": "echo public-ok",
    });
    try {
      const { report } = await runAndReport(dir);
      const typecheck = report.checks.find((c) => c.command.includes("typecheck"));
      const testCheck = report.checks.find((c) => c.command.includes("test"));
      expect(typecheck?.stdout).toContain("[REDACTED: possible AWS access key]");
      expect(typecheck?.stdout).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(testCheck?.stderr).toContain("[REDACTED: possible GitHub token]");
      expect(testCheck?.stderr).not.toContain("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
      expect(report.issues.some((i) => i.source.includes("typecheck stdout"))).toBe(true);
      expect(report.issues.some((i) => i.source.includes("test stderr"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("omits binary files", async () => {
    const dir = await createTempRepo();
    try {
      await writeFile(join(dir, "binary.bin"), Buffer.from([0x00, 0x01, 0x02]));
      const { report } = await runAndReport(dir);
      const nf = report.changes.newFiles.find((f) => f.path === "binary.bin");
      expect(nf?.omittedReason).toContain("binary");
      expect(nf?.content).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("omits files larger than the configured limit", async () => {
    const dir = await createTempRepo();
    try {
      const big = "x".repeat(110 * 1024);
      await writeFile(join(dir, "large.txt"), big);
      const { report } = await runAndReport(dir);
      const nf = report.changes.newFiles.find((f) => f.path === "large.txt");
      expect(nf?.omittedReason).toContain("exceeds");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!symlinksSupported)("excludes symbolic links and records the reason", async () => {
    const dir = await createTempRepo();
    try {
      const target = join(dir, "real-target.txt");
      const link = join(dir, "link.txt");
      await writeFile(target, "target content\n");
      await symlink("real-target.txt", link);
      const { report } = await runAndReport(dir);
      const nf = report.changes.newFiles.find((f) => f.path === "link.txt");
      expect(nf?.omittedReason).toContain("symbolic link");
      expect(nf?.content).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!symlinksSupported)("excludes symbolic links that point outside the project", async () => {
    const dir = await createTempRepo();
    const externalDir = await mkdtemp(join(tmpdir(), "melohub-audit-external-"));
    try {
      const externalFile = join(externalDir, "secret.txt");
      const link = join(dir, "external-link.txt");
      await writeFile(externalFile, "external secret\n");
      await symlink(externalFile, link);
      const { report } = await runAndReport(dir);
      const nf = report.changes.newFiles.find((f) => f.path === "external-link.txt");
      expect(nf?.omittedReason).toContain("symbolic link");
      expect(nf?.content).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(externalDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!symlinksSupported)("excludes files accessed through a symbolic directory link", async () => {
    const dir = await createTempRepo();
    const externalDir = await mkdtemp(join(tmpdir(), "melohub-audit-externaldir-"));
    try {
      await writeFile(join(externalDir, "inside.txt"), "inside content\n");
      await symlink(externalDir, join(dir, "linked-dir"), "dir");
      const { report } = await runAndReport(dir);

      const linkEntry = report.changes.newFiles.find(
        (f) => f.path.replace(/\/$/, "") === "linked-dir"
      );
      expect(linkEntry).toBeDefined();
      expect(linkEntry?.omittedReason).toContain("symbolic link");
      expect(linkEntry?.content).toBeUndefined();
      expect(report.changes.newFiles.some((f) => f.content?.includes("inside content"))).toBe(false);
      expect(report.omittedFiles).toContainEqual(
        expect.objectContaining({
          path: expect.stringMatching(/^linked-dir\/?$/),
          reason: expect.stringContaining("symbolic link"),
        }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(externalDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!symlinksSupported)("rejects a child path whose parent directory is a symbolic link", async () => {
    const dir = await createTempRepo();
    const externalDir = await mkdtemp(join(tmpdir(), "melohub-audit-externaldir-"));
    try {
      await writeFile(join(externalDir, "inside.txt"), "inside content\n");
      await symlink(externalDir, join(dir, "linked-dir"), "dir");
      const reason = await hasSymlinkInPath(dir, join(dir, "linked-dir", "inside.txt"));
      expect(reason).toContain("symbolic link");
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(externalDir, { recursive: true, force: true });
    }
  });

  it("includes files inside a normal directory", async () => {
    const dir = await createTempRepo();
    try {
      await mkdir(join(dir, "subdir"));
      await writeFile(join(dir, "subdir", "normal.txt"), "normal content\n");
      const { report } = await runAndReport(dir);
      const nf = report.changes.newFiles.find((f) => f.path === join("subdir", "normal.txt").replace(/\\/g, "/"));
      expect(nf).toBeDefined();
      expect(nf?.content).toBe("normal content\n");
      expect(nf?.omittedReason).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("redacts secrets in diffStat-like and git error-like text", () => {
    const diffStat = " file.txt | 2 +-\nAKIAIOSFODNN7EXAMPLE";
    const gitError = "fatal: could not read password=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    expect(redactSecrets(diffStat).text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(redactSecrets(gitError).text).not.toContain("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  });

  it("redacts a secret-like branch name in the report", async () => {
    const dir = await createTempRepo();
    try {
      execSync("git checkout -b AKIAIOSFODNN7EXAMPLE-branch", { cwd: dir });
      const { report } = await runAndReport(dir);
      expect(report.branch).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(report.git.branch).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(report.branch).toContain("[REDACTED: possible AWS access key]");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("redacts a secret-like file name in modified files and still collects the diff", async () => {
    const dir = await createTempRepo();
    try {
      const secretName = "AKIAIOSFODNN7EXAMPLE-modified.txt";
      await writeFile(join(dir, secretName), "initial\n");
      execSync("git add .", { cwd: dir });
      execSync('git commit -m "add secret-named file"', { cwd: dir });
      await writeFile(join(dir, secretName), "modified content\n");
      const { report } = await runAndReport(dir);
      expect(report.git.modified.some((p) => p.includes("AKIAIOSFODNN7EXAMPLE"))).toBe(false);
      expect(report.files.some((f) => f.path.includes("AKIAIOSFODNN7EXAMPLE"))).toBe(false);
      expect(report.changes.diff).toContain("modified content");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("redacts a secret-like file name in new files and still collects content", async () => {
    const dir = await createTempRepo();
    try {
      const secretName = "AKIAIOSFODNN7EXAMPLE-new.txt";
      await writeFile(join(dir, secretName), "new secret-named content\n");
      const { report } = await runAndReport(dir);
      expect(report.git.untracked.some((p) => p.includes("AKIAIOSFODNN7EXAMPLE"))).toBe(false);
      expect(report.files.some((f) => f.path.includes("AKIAIOSFODNN7EXAMPLE"))).toBe(false);
      const nf = report.changes.newFiles.find((f) => f.content?.includes("new secret-named content"));
      expect(nf).toBeDefined();
      expect(nf?.path).not.toContain("AKIAIOSFODNN7EXAMPLE");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("redacts a secret-like original path in renamed files", async () => {
    const dir = await createTempRepo();
    try {
      const secretName = "AKIAIOSFODNN7EXAMPLE-old.txt";
      await writeFile(join(dir, secretName), "rename source\n");
      execSync("git add .", { cwd: dir });
      execSync('git commit -m "add rename source"', { cwd: dir });
      execSync("git mv AKIAIOSFODNN7EXAMPLE-old.txt normal-target.txt", { cwd: dir });
      const { report } = await runAndReport(dir);
      expect(report.git.renamed[0]?.oldPath).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(report.git.renamed[0]?.oldPath).toContain("[REDACTED: possible AWS access key]");
      expect(report.git.renamed[0]?.newPath).toBe("normal-target.txt");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("redacts a secret-like new path in renamed files", async () => {
    const dir = await createTempRepo();
    try {
      await writeFile(join(dir, "normal-source.txt"), "rename source\n");
      execSync("git add .", { cwd: dir });
      execSync('git commit -m "add rename source"', { cwd: dir });
      execSync("git mv normal-source.txt AKIAIOSFODNN7EXAMPLE-new.txt", { cwd: dir });
      const { report } = await runAndReport(dir);
      expect(report.git.renamed[0]?.newPath).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(report.git.renamed[0]?.newPath).toContain("[REDACTED: possible AWS access key]");
      expect(report.git.renamed[0]?.oldPath).toBe("normal-source.txt");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not leak secret-like Git metadata into Markdown or JSON reports", async () => {
    const dir = await createTempRepo();
    try {
      await writeFile(join(dir, "AKIAIOSFODNN7EXAMPLE-branch-file.txt"), "content\n");
      execSync("git checkout -b AKIAIOSFODNN7EXAMPLE-branch", { cwd: dir });
      const { auditDir } = await runAndReport(dir);
      const md = await readFile(join(auditDir, "audit.md"), "utf8");
      const json = await readFile(join(auditDir, "audit.json"), "utf8");
      expect(md).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(json).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(md).toContain("[REDACTED: possible AWS access key]");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not leak simulated secrets into generated Markdown or JSON reports", async () => {
    const dir = await createTempRepo({
      typecheck: 'echo "AWS_KEY=AKIAIOSFODNN7EXAMPLE"',
      test: 'echo "ERROR: token=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" >&2; exit 1',
      "catalog:editorial": "echo editorial-ok",
      "catalog:public": "echo public-ok",
    });
    try {
      await writeFile(
        join(dir, "private-key.txt"),
        ["-----BEGIN RSA PRIVATE KEY-----", "MIIEpAIBAAKCAQEAsecret", "-----END RSA PRIVATE KEY-----"].join("\n"),
      );
      await writeFile(join(dir, "secrets.txt"), "API_KEY=1234567890123456\n");
      await writeFile(join(dir, "large.txt"), "x".repeat(110 * 1024));
      const { auditDir } = await runAndReport(dir);
      const md = await readFile(join(auditDir, "audit.md"), "utf8");
      const json = await readFile(join(auditDir, "audit.json"), "utf8");

      const rawSecrets = [
        "AKIAIOSFODNN7EXAMPLE",
        "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "MIIEpAIBAAKCAQEAsecret",
        "API_KEY=1234567890123456",
      ];
      for (const secret of rawSecrets) {
        expect(md).not.toContain(secret);
        expect(json).not.toContain(secret);
      }

      expect(md).toContain("[REDACTED: possible AWS access key]");
      expect(md).toContain("[REDACTED: possible GitHub token]");
      expect(md).toContain("[REDACTED: possible RSA private key block]");
      expect(md).toContain("[REDACTED: possible generic secret]");

      expect(json).toContain("[REDACTED: possible AWS access key]");
      expect(json).toContain("[REDACTED: possible GitHub token]");
      expect(json).toContain("[REDACTED: possible RSA private key block]");
      expect(json).toContain("[REDACTED: possible generic secret]");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("truncates large fields consistently in Markdown and JSON", async () => {
    const dir = await createTempRepo();
    try {
      const big = "x".repeat(30 * 1024);
      await writeFile(join(dir, "huge.txt"), big);
      const { auditDir } = await runAndReport(dir);
      const md = await readFile(join(auditDir, "audit.md"), "utf8");
      const json = await readFile(join(auditDir, "audit.json"), "utf8");
      expect(md).toContain("[truncated");
      expect(json).toContain("[truncated");
      expect(json).toContain("from JSON export");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports FAIL and records Git errors when not inside a Git repository", async () => {
    const dir = await mkdtemp(join(tmpdir(), "melohub-audit-nogit-"));
    try {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ name: "temp", version: "1.0.0", scripts: { test: "echo ok" } }, null, 2),
      );
      const report = await runAudit(dir);
      expect(report.result).toBe("FAIL");
      expect(report.branch).toBe("unknown");
      expect(report.commit).toBe("unknown");
      expect(report.issues.some((i) => i.source === "git" && i.severity === "error")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes Markdown and JSON reports", async () => {
    const dir = await createTempRepo();
    try {
      const { report, auditDir } = await runAndReport(dir);
      const json = JSON.parse(await readFile(join(auditDir, "audit.json"), "utf8"));
      const md = await readFile(join(auditDir, "audit.md"), "utf8");
      expect(json.id).toBe(report.id);
      expect(md).toContain(`**ID:** ${report.id}`);
      expect(md).toContain("## Checks");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes diffStat in reports", async () => {
    const dir = await createTempRepo();
    try {
      await writeFile(join(dir, "initial.txt"), "modified content\n");
      const { report, auditDir } = await runAndReport(dir);
      expect(report.changes.diffStat).toContain("initial.txt");
      const md = await readFile(join(auditDir, "audit.md"), "utf8");
      expect(md).toContain("**Diff stat:**");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not track .audit/ in Git", async () => {
    const dir = await createTempRepo();
    try {
      await runAndReport(dir);
      const status = await gitStatusPorcelain(dir);
      expect(status).not.toContain(".audit/");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
