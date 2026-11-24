import { readdir, readFile } from "node:fs/promises";
import type { DirEntry, FileSystemReader } from "./types";

export const nodeFileSystemReader: FileSystemReader = {
  async readDir(dir: string): Promise<DirEntry[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }));
  },

  async readFile(path: string): Promise<string> {
    return readFile(path, "utf-8");
  },
};
