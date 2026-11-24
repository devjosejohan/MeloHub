# MeloHub

**An independent, curated directory for music, audio, and technology enthusiasts.**

MeloHub is a community-oriented directory focused on discovering useful applications, tools, projects, and products related to music, audio, and technology.

Our goal is to make it easier to find trustworthy resources through a carefully curated catalog, clear information, and transparent recommendations.

## What is MeloHub?

MeloHub is not another download repository or an unfiltered list of applications.

It is an independent discovery platform where resources are organized, reviewed, and presented with an emphasis on quality, reliability, and transparency.

MeloHub does not host application installers or distribute executable files. Instead, it directs users to official websites, repositories, and trusted distribution platforms.

## Main Sections

The directory is planned to include:

- **Audio:** Music players, audio software, streaming tools, and audio-related projects.
- **Mobile:** Applications and projects for mobile devices.
- **PC:** Desktop applications and software.
- **Tools:** Useful utilities and specialized tools.
- **Customization:** Resources for personalizing devices and operating systems.
- **Products:** Headphones, IEMs, DACs, amplifiers, and audio accessories.
- **News:** Curated news and updates from relevant sources.

## Our Principles

MeloHub is built around a few fundamental principles:

- **Quality over quantity:** Every listing should provide genuine value.
- **Transparency:** Information, sources, limitations, and affiliations must be clearly disclosed.
- **Trust:** Resources should be checked before being included.
- **Independence:** Recommendations should prioritize usefulness and credibility.
- **Community:** Users should eventually be able to contribute suggestions and help improve the directory.

## Curation and Verification

Resources submitted to MeloHub are subject to editorial review.

Depending on the type of resource, verification may include:

- Official source and download links.
- Platform and compatibility information.
- License and distribution model.
- Project activity and maintenance status.
- Relevant documentation and independent reviews.

An open-source repository, for example, is not automatically considered trustworthy or actively maintained.

## Community Contributions

Community suggestions are welcome.

Initially, all submissions will be reviewed manually before becoming part of the public catalog.

This helps maintain consistency, reliability, and editorial quality.

## Project Status

MeloHub is currently in its planning and development stage.

Features, architecture, and implementation details are subject to change as the project evolves.

## Development

The catalog data model is implemented as framework-independent TypeScript with Zod schemas, taxonomy registries, and validation rules. It does not depend on Astro or any UI framework.

Requirements: Node.js 24 or newer.

```bash
npm install
npm run validate          # typecheck + tests
npm run test              # Vitest only
npm run typecheck         # TypeScript only
npm run catalog:editorial # validate every record, including drafts
npm run catalog:public    # validate the public catalog (excludes drafts)
npm run audit             # generate local audit report
```

### Continuous integration

A GitHub Actions workflow runs `npm run audit` automatically on every push to `main` and on every pull request targeting `main`. The resulting reports are uploaded as downloadable artifacts for 7 days.

- Data model decisions: [`docs/decisions/ADR-001-data-model.md`](docs/decisions/ADR-001-data-model.md).
- Catalog pipeline decisions: [`docs/decisions/ADR-002-catalog-pipeline.md`](docs/decisions/ADR-002-catalog-pipeline.md).
- Audit system decisions: [`docs/decisions/ADR-003-audit-system.md`](docs/decisions/ADR-003-audit-system.md).
- How to add and edit records: [`data/records/README.md`](data/records/README.md).

## License

The project's licensing terms will be established before its initial public release.