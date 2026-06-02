// File: src/main.tsx

import ReactDOM from "react-dom/client";
import App from "./App";

// Global reset
const style = document.createElement("style");

style.innerHTML = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html,
  body,
  #root {
    width: 100%;
    min-height: 100%;
    background: #0a0c12;
  }

  body {
    background: #0a0c12;
    font-family: 'IBM Plex Mono', monospace;
  }

  input,
  select,
  button,
  textarea {
    font-family: 'IBM Plex Mono', monospace;
  }
`;

document.head.appendChild(style);

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <App />
);

