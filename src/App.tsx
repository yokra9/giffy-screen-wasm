import { useState, useRef, useCallback, useEffect, JSX } from "react";
import { FFmpeg, LogEvent } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import DisplayRecorder from "./DisplayRecorder";

const baseURL = "https://unpkg.com/@ffmpeg/core@latest/dist/esm";

function App(): JSX.Element {
  const ffmpegRef = useRef(new FFmpeg());
  const videoRef = useRef<HTMLVideoElement>(null);
  const logRef = useRef<HTMLPreElement>(null);

  // 画面の状態
  const [currentView, setCurretView] = useState<
    | "init" // 初期表示
    | "loaded" // ffmpeg ロード完了/画面選択/キャプチャ待機
    | "captured" // キャプチャ完了/GIF変換待機
    | "converted" // GIF変換完了
  >("init");

  // キャプチャデータ
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);

  // GIF動画（オブジェクト URL）
  const [gif, setGif] = useState<string | undefined>(undefined);

  /**
   * ffmpeg でログが出力されたときのハンドラ
   */
  const logHandler = useCallback(({ message }: LogEvent) => {
    console.log(message);

    if (logRef.current === null || logRef.current.textContent === null) return;
    logRef.current.textContent += `\n${message}`;
  }, []);

  /**
   * ffmpeg をロードするボタンを押下されたときのハンドラ
   */
  const loadHandler = useCallback(async () => {
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on("log", logHandler);

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
    });

    setCurretView("loaded");
  }, [logHandler]);

  /**
   * GIFアニメに変換ボタンを押下されたときのハンドラ
   */
  const transcodeHandler = useCallback(async () => {
    // キャプチャデータを ffmpeg に読み込ませ、GIFアニメに変換する
    const ffmpeg = ffmpegRef.current;
    await ffmpeg.writeFile("input", await fetchFile(new Blob(recordedChunks)));
    await ffmpeg.exec(["-i", "input", "output.gif"]);
    const data = await ffmpeg.readFile("output.gif");
    setGif(URL.createObjectURL(new Blob([data], { type: "image/gif" })));

    // キャプチャデータを削除
    setRecordedChunks([]);

    setCurretView("converted");
  }, [recordedChunks]);

  /**
   * もう一度ボタンが押下されたときのハンドラ
   */
  const restartHandler = useCallback(() => {
    setCurretView("loaded");
  }, []);

  /**
   * キャプチャデータが変更されたときの処理
   */
  useEffect(() => {
    if (videoRef.current === null) return;
    if (recordedChunks.length === 0) return;

    videoRef.current.src = URL.createObjectURL(new Blob(recordedChunks));
    videoRef.current.load();
  }, [recordedChunks]);

  return (
    <div className="px-2 py-2">
      <h1>画面キャプチャしてGIFアニメに変換</h1>

      {currentView === "init" && (
        <p>
          <button
            onClick={() => void loadHandler()}
            className="px-6 py-2 text-white font-bold rounded-3xl bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400"
          >
            @ffmpeg/core をロードする
          </button>
        </p>
      )}

      {currentView === "loaded" && (
        <>
          <DisplayRecorder
            recordedChunks={recordedChunks}
            setRecordedChunks={setRecordedChunks}
            setCurretView={setCurretView}
          />
        </>
      )}

      {currentView === "captured" && (
        <>
          <p>
            <button
              onClick={() => void transcodeHandler()}
              className="ml-2 px-6 py-2 text-white font-bold rounded-3xl bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400"
            >
              GIFアニメに変換
            </button>
            <button
              onClick={restartHandler}
              className="ml-2 px-6 py-2 text-red-700 font-bold rounded-3xl border-1 hover:bg-red-100"
            >
              やりなおす
            </button>
          </p>

          <h2>キャプチャ結果</h2>
          <video ref={videoRef} controls autoPlay />
        </>
      )}

      {currentView === "converted" && (
        <>
          <p>
            <button
              onClick={restartHandler}
              className="ml-2 px-6 py-2 text-white font-bold rounded-3xl bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400"
            >
              もう一度
            </button>
          </p>

          <h2>変換結果</h2>
          <img src={gif} />
          <pre ref={logRef} />
        </>
      )}
    </div>
  );
}

export default App;
