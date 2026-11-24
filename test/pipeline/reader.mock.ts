import type { DirEntry, FileSystemReader } from "../../src/data/pipeline/types";

function splitPath(path: string): string[] {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}

/**
 * Creates an in-memory filesystem reader for pipeline tests.
 *
 * Keys are POSIX-style paths such as `data/records/audiomass.json`.
 * Values are UTF-8 file contents. Any nested prefix is treated as a directory.
 */
export function createFakeReader(files: Record<string, string>): FileSystemReader {
  return {
    async readDir(dir: string): Promise<DirEntry[]> {
      const dirParts = splitPath(dir);
      const names = new Map<string, { name: string; isDirectory: boolean }>();

      for (const path of Object.keys(files)) {
        const parts = splitPath(path);
        if (parts.length <= dirParts.length) {
          continue;
        }
        if (!dirParts.every((part, index) => parts[index] === part)) {
          continue;
        }
        const name = parts[dirParts.length]!;
        const isDirectory = parts.length > dirParts.length + 1;
        names.set(name, { name, isDirectory });
      }

      return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    async readFile(path: string): Promise<string> {
      const normalized = path.replace(/\\/g, "/");
      const content = files[normalized];
      if (typeof content !== "string") {
        throw new Error(`file not found: ${path}`);
      }
      return content;
    },
  };
}
