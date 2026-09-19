import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export function loadLocalEnv(path = fileURLToPath(new URL("../.env", import.meta.url))) {
  try {
    // Node preserves variables already supplied by the shell or --env-file.
    loadEnvFile(path);
  } catch (error) {
    // No configuration is needed for the emulator or its local chat demo.
    if (error.code !== "ENOENT") throw error;
  }
}
