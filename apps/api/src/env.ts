import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function loadLocalEnv(fileName = ".env") {
  for (const filePath of candidateEnvFiles(fileName)) {
    if (!existsSync(filePath)) continue;

    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex <= 0) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }

    return filePath;
  }

  return undefined;
}

function candidateEnvFiles(fileName: string) {
  const files: string[] = [];
  let current = resolve(process.cwd());

  while (true) {
    files.push(join(current, fileName));
    const parent = dirname(current);

    if (parent === current) return files;

    current = parent;
  }
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
