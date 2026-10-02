import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeKmarkWeb } from "./wasm/kmarkWeb";

async function bootstrap() {
  if (import.meta.env.VITE_KMARK_E2E === "1") {
    window.addEventListener("error", (event) => {
      console.error("[kmark:e2e] unhandled error", event.message);
    });
    window.addEventListener("unhandledrejection", (event) => {
      const message = event.reason instanceof Error ? event.reason.message : typeof event.reason;
      console.error("[kmark:e2e] unhandled rejection", message);
    });
    await import("@wdio/tauri-plugin");
  }
  await initializeKmarkWeb();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

function renderBootstrapError(error: unknown): void {
  const root = document.getElementById("root");

  if (root === null) {
    return;
  }

  const message = error instanceof Error && error.message.length > 0
    ? error.message
    : "kMark の起動に失敗しました。";

  root.textContent = message;
}

void bootstrap().catch(renderBootstrapError);
