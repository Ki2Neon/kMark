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

void bootstrap();
