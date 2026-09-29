import { vi } from "vitest";

export async function loadFixtureResult<T>(url: string): Promise<T> {
  const frame = document.createElement("iframe");
  frame.width = "1280";
  frame.height = "900";
  frame.src = url;
  document.body.append(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      frame.addEventListener("load", () => resolve(), { once: true });
      frame.addEventListener("error", () => reject(new Error(`Fixture failed to load: ${url}`)), { once: true });
    });
    await vi.waitFor(() => {
      if (!frame.contentDocument?.body.dataset.result) {
        throw new Error(`Fixture has no result: ${url}; ${frame.contentDocument?.body.textContent?.slice(0, 200) ?? ""}`);
      }
    }, { timeout: 30_000 });
    const encoded = frame.contentDocument!.body.dataset.result!;
    const result = JSON.parse(atob(encoded)) as T & { error?: string };
    if (result.error) throw new Error(`${url}: ${result.error}`);
    return result;
  } finally {
    frame.remove();
  }
}
