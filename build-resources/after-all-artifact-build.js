"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const { getPath7za, unlinkIfExists } = require("builder-util");

const execFileAsync = promisify(execFile);

async function run7za(args, cwd) {
  const sevenZipPath = await getPath7za();
  await execFileAsync(sevenZipPath, args, {
    cwd,
    windowsHide: true,
  });
}

async function listDirectoryEntries(dirPath) {
  return fs.readdir(dirPath, { withFileTypes: true });
}

async function removeDirectory(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

async function resolvePackageVersion(configuration) {
  if (configuration && configuration.extraMetadata && configuration.extraMetadata.version) {
    return configuration.extraMetadata.version;
  }

  if (process.env.npm_package_version) {
    return process.env.npm_package_version;
  }

  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    if (typeof packageJson.version === "string" && packageJson.version.length > 0) {
      return packageJson.version;
    }
  } catch {
    // Fall through to the last-resort default below.
  }

  return "0.0.0";
}

async function repackZipWithRootFolder(artifactPath, rootFolderName) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tot-artifact-root-"));
  const extractDir = path.join(tempRoot, "extract");
  const stageDir = path.join(tempRoot, "stage");
  const wrappedDir = path.join(stageDir, rootFolderName);

  try {
    await fs.mkdir(extractDir, { recursive: true });
    await fs.mkdir(stageDir, { recursive: true });

    await run7za(["x", "-bd", "-y", `-o${extractDir}`, artifactPath], tempRoot);

    const topLevelEntries = await listDirectoryEntries(extractDir);
    if (
      topLevelEntries.length === 1 &&
      topLevelEntries[0].isDirectory() &&
      topLevelEntries[0].name === rootFolderName
    ) {
      return;
    }

    await fs.mkdir(wrappedDir, { recursive: true });
    for (const entry of topLevelEntries) {
      await fs.rename(
        path.join(extractDir, entry.name),
        path.join(wrappedDir, entry.name)
      );
    }

    await unlinkIfExists(artifactPath);
    await run7za(
      ["a", "-bd", "-mx=7", "-mm=Deflate", "-mcu", artifactPath, rootFolderName],
      stageDir
    );
  } finally {
    await removeDirectory(tempRoot);
  }
}

exports.default = async function afterAllArtifactBuild(buildResult) {
  const configuration = buildResult && buildResult.configuration ? buildResult.configuration : {};
  const productName = configuration.productName || "app";
  const version = await resolvePackageVersion(configuration);
  const rootFolderName = `${productName}-${version}`;

  const artifactPaths = Array.isArray(buildResult && buildResult.artifactPaths)
    ? buildResult.artifactPaths
    : [];

  for (const artifactPath of artifactPaths) {
    if (typeof artifactPath !== "string" || path.extname(artifactPath).toLowerCase() !== ".zip") {
      continue;
    }

    await repackZipWithRootFolder(artifactPath, rootFolderName);
  }

  return [];
};
