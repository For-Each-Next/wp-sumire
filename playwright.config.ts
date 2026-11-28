import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/wpvg-assessor/ui",
    forbidOnly: Boolean(process.env.CI),
    workers: 2,
    reporter: process.env.CI ? "github" : "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: "https://zh.wikipedia.org",
        serviceWorkers: "block",
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
        },
    },
});
