import { nodeFileSystemReader, loadEditorialCatalog } from "../src/data/pipeline/index";

const DEFAULT_DIR = "data/records";

async function main() {
  const recordsDir = process.argv[2] ?? DEFAULT_DIR;
  const result = await loadEditorialCatalog({
    recordsDir,
    reader: nodeFileSystemReader,
  });

  if (!result.ok) {
    console.error("Editorial catalog validation failed.");
    for (const issue of result.issues) {
      console.error(`${issue.sourcePath} [${issue.stage}] ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(
    `Editorial catalog OK: ${result.records.length} records (` +
      `${result.published.length} published, ${result.archived.length} archived).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
