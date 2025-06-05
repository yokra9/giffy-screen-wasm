import {
  useState,
  useRef,
  useCallback,
  useEffect,
  JSX,
  ChangeEvent,
} from "react";
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

  // FPS
  const [fps, setFps] = useState(30);

  // GIF動画（オブジェクト URL）
  const [gif, setGif] = useState<string | undefined>(undefined);

  /**
   * FPS 入力が変更されたときのハンドラ
   */
  const fpsInputChangeHandler = useCallback(
    ({ currentTarget }: ChangeEvent<HTMLInputElement>) => {
      setFps(Number(currentTarget.value));
    },
    [setFps]
  );

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
    await ffmpeg.exec(["-i", "input", "-r", fps.toString(), "output.gif"]);
    const data = await ffmpeg.readFile("output.gif");
    setGif(URL.createObjectURL(new Blob([data], { type: "image/gif" })));


    setCurretView("converted");
  }, [fps, recordedChunks]);

  /**
   * もう一度・やりなおすボタンが押下されたときのハンドラ
   */
  const restartHandler = useCallback(() => {
    setCurretView("loaded");

    // キャプチャデータを削除
    setRecordedChunks([]);

    if (logRef.current === null || logRef.current.textContent === null) return;
    logRef.current.textContent = "";
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
      {currentView === "init" && (
        <p className="mb-4 pb-4 border-b-2 border-gray-400">
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
            fps={fps}
            setFps={setFps}
          />
        </>
      )}

      {currentView === "captured" && (
        <>
          <p className="mb-4 pb-4 border-b-2 border-gray-400">
            <button
              onClick={() => void transcodeHandler()}
              className="px-6 py-2 text-white font-bold rounded-3xl bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400"
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

          <div className="grid gap-4 grid-cols-1 xl:grid-cols-[1fr_auto]">
            <video ref={videoRef} controls autoPlay />
            <div className="grid gap-4 grid-cols-2 h-auto pl-4 pt-2 border-l-2 border-gray-400">
              <label className="text-md text-gray-700">
                GIF のフレームレート
                <br />
                <input
                  type="number"
                  value={fps}
                  onChange={fpsInputChangeHandler}
                  className="text-sm leading-none font-medium border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:border-blue-500 "
                />
              </label>
            </div>
          </div>
        </>
      )}

      {currentView === "converted" && (
        <>
          <p className="mb-4 pb-4 border-b-2 border-gray-400">
            <button
              onClick={restartHandler}
              className="ml-2 px-6 py-2 text-white font-bold rounded-3xl bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400"
            >
              もう一度
            </button>
          </p>

          <img src={gif} />
        </>
      )}

      <pre ref={logRef} />
    </div>
  );
}

export default App;
