import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeKmarkWeb } from "./wasm/kmarkWeb";

async function bootstrap() {
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
