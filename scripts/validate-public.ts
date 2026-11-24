import { nodeFileSystemReader, loadPublicCatalog } from "../src/data/pipeline/index";

const DEFAULT_DIR = "data/records";

async function main() {
  const recordsDir = process.argv[2] ?? DEFAULT_DIR;
  const result = await loadPublicCatalog({
    recordsDir,
    reader: nodeFileSystemReader,
  });

  if (!result.ok) {
    console.error("Public catalog generation failed.");
    for (const issue of result.issues) {
      console.error(`${issue.sourcePath} [${issue.stage}] ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(
    `Public catalog OK: ${result.catalog.published.length} published, ` +
      `${result.catalog.archived.length} archived.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
