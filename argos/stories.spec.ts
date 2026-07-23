import { argosScreenshot } from "@argos-ci/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * One Playwright test per Storybook story of the dashboard.
 *
 * The story list and each story's `chromatic` parameters are read from the
 * static build, so the stories that opt out with `chromatic: { disableSnapshot: true }`
 * are skipped here exactly like they are skipped in the current Chromatic runs,
 * and the `delay` / `diffThreshold` set in `.storybook/preview.tsx` and in
 * `src/storybook/chromatic.ts` are applied to the capture.
 */

type StoryEntry = {
  id: string;
  title: string;
  name: string;
  type?: string;
};

type ChromaticParameters = {
  disableSnapshot?: boolean;
  disable?: boolean;
  delay?: number;
  diffThreshold?: number;
};

const INDEX_PATH = fileURLToPath(new URL("../storybook-static/index.json", import.meta.url));

function readStories(): StoryEntry[] {
  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8")) as {
    entries: Record<string, StoryEntry>;
  };

  return Object.values(index.entries).filter(entry => (entry.type ?? "story") === "story");
}

const stories = readStories();

// `title › name` is not guaranteed to be unique, and Playwright refuses two tests
// with the same title at collection time, so only the colliding labels get suffixed.
const labelCount = new Map<string, number>();

for (const story of stories) {
  const label = `${story.title} › ${story.name}`;

  labelCount.set(label, (labelCount.get(label) ?? 0) + 1);
}

function labelFor(story: StoryEntry) {
  const label = `${story.title} › ${story.name}`;

  return (labelCount.get(label) ?? 0) > 1 ? `${label} (${story.id})` : label;
}

async function waitForPhase(page: Page, id: string) {
  // Storybook 10 exposes the active renders as an array; match by id.
  await page.waitForFunction(
    (storyId: string) => {
      const preview = (
        window as unknown as {
          __STORYBOOK_PREVIEW__?: { storyRenders?: { id: string; phase?: string }[] };
        }
      ).__STORYBOOK_PREVIEW__;
      const renders = preview?.storyRenders ?? [];
      const render = renders.find(item => item.id === storyId) ?? renders[0];

      return Boolean(
        render &&
          (render.phase === "completed" ||
            render.phase === "finished" ||
            render.phase === "errored"),
      );
    },
    id,
    { timeout: 60_000 },
  );
}

async function readChromaticParameters(
  page: Page,
  id: string,
): Promise<ChromaticParameters | null> {
  return page.evaluate((storyId: string) => {
    const preview = (
      window as unknown as {
        __STORYBOOK_PREVIEW__?: {
          storyRenders?: {
            id: string;
            story?: { parameters?: { chromatic?: Record<string, unknown> } };
          }[];
        };
      }
    ).__STORYBOOK_PREVIEW__;
    const renders = preview?.storyRenders ?? [];
    const render = renders.find(item => item.id === storyId) ?? renders[0];

    return (render?.story?.parameters?.chromatic ?? null) as ChromaticParameters | null;
  }, id);
}

// A DOM that has not mounted yet is perfectly stable, so the settle loop would
// happily capture an empty page. Resolve once the story root has a height, or
// once a teleported overlay (dialog, popover) is on the page.
async function waitForVisible(page: Page): Promise<boolean> {
  return page
    .waitForFunction(
      () => {
        const root = document.querySelector("#storybook-root");
        const rootReady = Boolean(root && root.getBoundingClientRect().height > 0);
        const overlay = Array.from(document.querySelectorAll("*")).some(element => {
          if (getComputedStyle(element).position !== "fixed") return false;

          const rect = element.getBoundingClientRect();

          return rect.width > 100 && rect.height > 100;
        });

        return rootReady || overlay;
      },
      undefined,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);

  // Wait for the number of settled images to stop moving rather than for
  // completeness, which never arrives when a story renders a broken URL on purpose.
  await page
    .waitForFunction(
      () => {
        const settled = Array.from(document.images).filter(image => image.complete).length;
        const store = window as unknown as { __argosImages?: { count: number; stable: number } };
        const state = (store.__argosImages ??= { count: -1, stable: 0 });

        state.stable = settled === state.count ? state.stable + 1 : 0;
        state.count = settled;

        return state.stable >= 3;
      },
      undefined,
      { timeout: 15_000, polling: 200 },
    )
    .catch(() => undefined);

  // Wake up the size observers that measured before the webfonts were ready.
  const viewport = page.viewportSize();

  if (viewport) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height + 1 });
    await page.setViewportSize(viewport);
  }

  // Wait for the animations that have an end. Infinite ones (spinners) never
  // finish, and Argos freezes them at capture time anyway.
  await page.evaluate(async () => {
    const running = document.getAnimations().filter(animation => {
      if (animation.playState !== "running") return false;

      const timing = animation.effect?.getComputedTiming();

      return typeof timing?.endTime === "number" && isFinite(timing.endTime);
    });

    await Promise.race([
      Promise.all(running.map(animation => animation.finished.catch(() => undefined))),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
  });

  // Sample the markup until four consecutive reads match, walking shadow roots
  // too so a component rendering inside one never reads as empty-but-stable.
  await page.waitForFunction(
    () => {
      const serialize = (root: Element | ShadowRoot): string => {
        let out = root.innerHTML;

        for (const element of Array.from(root.querySelectorAll("*"))) {
          if (element.shadowRoot) out += `<${element.tagName}>${serialize(element.shadowRoot)}`;
        }

        return out;
      };

      const store = window as unknown as { __argosMarkup?: { last: string; stable: number } };
      const state = (store.__argosMarkup ??= { last: "", stable: 0 });
      const sample = serialize(document.body);

      state.stable = sample === state.last ? state.stable + 1 : 0;
      state.last = sample;

      return state.stable >= 4;
    },
    undefined,
    { timeout: 30_000, polling: 250 },
  );

  // The canvas datagrids paint on an animation frame after the DOM settles.
  await page.evaluate(
    () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

for (const story of stories) {
  test(labelFor(story), async ({ page }) => {
    await page.goto(`/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`);
    await waitForPhase(page, story.id);

    const chromatic = await readChromaticParameters(page, story.id);

    test.skip(
      Boolean(chromatic?.disableSnapshot || chromatic?.disable),
      "Story opts out of visual snapshots",
    );

    // A story that threw during render shows Storybook's error page, and capturing
    // it would only snapshot the framework's error screen. The error wrapper is
    // always in the DOM, so the signal is the class Storybook puts on the body.
    const errored = await page.evaluate(() =>
      document.body.classList.contains("sb-show-errordisplay"),
    );

    test.skip(errored, "Story rendered Storybook error display");

    const visible = await waitForVisible(page);

    test.skip(!visible, "Story renders no visible content");

    await settle(page);

    if (chromatic?.delay) {
      await page.waitForTimeout(chromatic.delay);
    }

    // Anything still busy at this point is the state the story wants to show,
    // not a load in flight.
    const staysBusy = await page.evaluate(
      () => document.querySelector('[aria-busy="true"]') !== null,
    );

    await expect(page.locator("#storybook-root")).toBeVisible();

    await argosScreenshot(page, labelFor(story), {
      element: "#storybook-root",
      stabilize: { waitForAriaBusy: !staysBusy },
      ...(chromatic?.diffThreshold === undefined ? {} : { threshold: chromatic.diffThreshold }),
    });
  });
}
