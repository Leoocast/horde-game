import React from "react";
import ReactDOM from "react-dom/client";
import { assertContentBootstrapReady } from "./content/bootstrap";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { reportRendererError } from "./platform/desktopBridge";
import "./styles.css";

assertContentBootstrapReady();

window.addEventListener("error", (event) => {
  reportRendererError({
    message: event.error instanceof Error ? event.error.message : event.message || "Unknown window error",
    stack: event.error instanceof Error ? event.error.stack : undefined,
    source: "window",
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  reportRendererError({
    message: reason instanceof Error ? reason.message : String(reason ?? "Unknown promise rejection"),
    stack: reason instanceof Error ? reason.stack : undefined,
    source: "promise",
  });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
