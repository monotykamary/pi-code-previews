import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testTempDirectories = new Set<string>();

export async function createTestTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  testTempDirectories.add(directory);
  return directory;
}

export async function cleanupTestTempDirectories(): Promise<void> {
  const directories = [...testTempDirectories];
  await Promise.all(
    directories.map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
      testTempDirectories.delete(directory);
    }),
  );
}
