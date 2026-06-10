"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const { getPath7za, unlinkIfExists } = require("builder-util");

const execFileAsync = promisify(execFile);
const WINDOWS_APP_DIR_NAME = "toT-app";
const INSTALL_DOC_FILE_NAME = "INSTALL.txt";

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

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
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

function resolveInstallDocPath() {
  return path.join(__dirname, INSTALL_DOC_FILE_NAME);
}

async function hasDesiredWindowsZipLayout(sourceRoot) {
  const installDocPath = path.join(sourceRoot, INSTALL_DOC_FILE_NAME);
  const appDirPath = path.join(sourceRoot, WINDOWS_APP_DIR_NAME);
  return (await pathExists(installDocPath)) && (await pathExists(appDirPath));
}

async function repackZipWithRootFolder(artifactPath, rootFolderName) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tot-artifact-root-"));
  const extractDir = path.join(tempRoot, "extract");
  const stageDir = path.join(tempRoot, "stage");
  const wrappedDir = path.join(stageDir, rootFolderName);
  const finalAppDir = path.join(wrappedDir, WINDOWS_APP_DIR_NAME);
  const installDocSourcePath = resolveInstallDocPath();

  try {
    await fs.mkdir(extractDir, { recursive: true });
    await fs.mkdir(stageDir, { recursive: true });

    if (!(await pathExists(installDocSourcePath))) {
      throw new Error(`[after-all-artifact-build] Missing packaging install note: ${installDocSourcePath}`);
    }

    await run7za(["x", "-bd", "-y", `-o${extractDir}`, artifactPath], tempRoot);

    const topLevelEntries = await listDirectoryEntries(extractDir);
    const hasSingleRootFolder = (
      topLevelEntries.length === 1 &&
      topLevelEntries[0].isDirectory() &&
      topLevelEntries[0].name === rootFolderName
    );
    const sourceRoot = hasSingleRootFolder
      ? path.join(extractDir, topLevelEntries[0].name)
      : extractDir;

    if (hasSingleRootFolder && await hasDesiredWindowsZipLayout(sourceRoot)) {
      return;
    }

    await fs.mkdir(wrappedDir, { recursive: true });
    await fs.mkdir(finalAppDir, { recursive: true });
    await fs.copyFile(installDocSourcePath, path.join(wrappedDir, INSTALL_DOC_FILE_NAME));

    const sourceAppRoot = await pathExists(path.join(sourceRoot, WINDOWS_APP_DIR_NAME))
      ? path.join(sourceRoot, WINDOWS_APP_DIR_NAME)
      : sourceRoot;
    const sourceEntries = await listDirectoryEntries(sourceAppRoot);
    for (const entry of sourceEntries) {
      await fs.rename(
        path.join(sourceAppRoot, entry.name),
        path.join(finalAppDir, entry.name)
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
