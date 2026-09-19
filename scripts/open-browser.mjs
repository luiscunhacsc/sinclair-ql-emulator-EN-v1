import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);
export const EMULATOR_URL = "http://localhost:8080";

export async function openDefaultBrowser({ platform = process.platform, run = runFile } = {}) {
  // Ask the OS to use the user's default browser. Do not select a browser,
  // profile, or kiosk mode, and do not interpolate input into a shell command.
  let executable;
  let args;
  if (platform === "win32") {
    executable = "powershell.exe";
    args = ["-NoProfile", "-NonInteractive", "-Command",
      `Start-Process -FilePath '${EMULATOR_URL}' -ErrorAction Stop`];
  } else if (platform === "darwin") {
    executable = "open";
    args = [EMULATOR_URL];
  } else if (platform === "linux") {
    executable = "xdg-open";
    args = [EMULATOR_URL];
  } else {
    throw new Error("Automatic browser launch is unavailable on this platform.");
  }
  // Hide the Windows launcher console, not the requested browser window.
  await run(executable, args, { windowsHide: true, timeout: 10_000 });
}
