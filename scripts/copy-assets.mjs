import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

mkdirSync(join(root, "dist", "python"), { recursive: true });
cpSync(join(root, "src", "python", "modal_runner.py"), join(root, "dist", "python", "modal_runner.py"));
