import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <footer className="w-full bg-white p-2">
      <a
        href="https://github.com/ffmpegwasm/ffmpeg.wasm"
        className="font-bold hover:underline underline-offset-2"
      >
        ffmpeg.wasm
      </a>{" "}
      と{" "}
      <a
        href="https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor"
        className="font-bold hover:underline underline-offset-2"
      >
        MediaStreamTrackProcessor
      </a>{" "}
      を活用してブラウザ上で画面録画と GIF 動画化を行うデモプログラムです。{" "}
      <a
        href="https://github.com/yokra9/giffy-screen-wasm"
        className="font-bold hover:underline underline-offset-2"
      >
        https://github.com/yokra9/giffy-screen-wasm
      </a>
    </footer>
  </StrictMode>
);
