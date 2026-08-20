import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const frontendDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    ".."
);
const repositoryDirectory = resolve(frontendDirectory, "..");
const generatedDirectory = resolve(
    frontendDirectory,
    "src",
    "generated-legal"
);

await mkdir(generatedDirectory, { recursive: true });

const [privacyMarkdown, termsMarkdown] = await Promise.all([
    readFile(resolve(repositoryDirectory, "PRIVACY.md"), "utf8"),
    readFile(resolve(repositoryDirectory, "TERMS.md"), "utf8"),
]);

const privacyNoticeHTML = marked.parse(privacyMarkdown, { async: false });
const termsOfUseHTML = marked.parse(termsMarkdown, { async: false });

await writeFile(
    resolve(generatedDirectory, "legalDocuments.ts"),
    [
        "// Generated from the repository legal documents. Do not edit directly.",
        `export const privacyNoticeHTML = ${JSON.stringify(privacyNoticeHTML)};`,
        `export const termsOfUseHTML = ${JSON.stringify(termsOfUseHTML)};`,
        "",
    ].join("\n"),
    "utf8"
);
