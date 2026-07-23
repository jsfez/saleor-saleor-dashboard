import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

/**
 * Argos visual testing on the dashboard Storybook.
 *
 * Storybook is served from its static build (`pnpm run build-storybook`), the
 * same artifact the Chromatic job uploads, so the captured surface is the one
 * the current visual regression runs already look at.
 */
const PORT = Number(process.env["ARGOS_PORT"] ?? 6102);
const STATIC_DIR = fileURLToPath(new URL("../storybook-static", import.meta.url));

const isCI = Boolean(process.env["CI"]);

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  fullyParallel: true,
  forbidOnly: isCI,
  workers: isCI ? 2 : undefined,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: isCI
    ? [["list"], ["@argos-ci/playwright/reporter", { uploadToArgos: true }]]
    : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    // Subpixel text antialiasing makes screenshots depend on the host; these
    // flags keep the rendering identical between machines.
    launchOptions: {
      args: ["--disable-lcd-text", "--font-render-hinting=none"],
    },
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --directory ${STATIC_DIR}`,
    url: `http://localhost:${PORT}/iframe.html`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
