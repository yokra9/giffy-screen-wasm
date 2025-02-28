import {
  useState,
  useRef,
  useCallback,
  useEffect,
  JSX,
  MouseEvent,
} from "react";
import { FFmpeg, LogEvent } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const baseURL = "https://unpkg.com/@ffmpeg/core@latest/dist/esm";

/**
 * useRef と RefObject の更新関数をセットにしたカスタムフックです。
 *
 * @param initialValue 初期値
 * @returns [refObject, 更新関数]
 */
function useSetRef<T>(
  initialValue: T
): [refObject: React.RefObject<T>, (value: T) => void] {
  const refObject = useRef(initialValue);
  return [
    refObject,
    (value: T) => {
      refObject.current = value;
    },
  ];
}

function App(): JSX.Element {
  // @ffmpeg/core がロードされているかどうか
  const [loaded, setLoaded] = useState(false);

  // キャプチャデータ
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);

  // GIF動画（オブジェクト URL）
  const [gif, setGif] = useState<string | undefined>(undefined);

  // キャンバスのサイズ
  const [canvasWidth, setCanvasWidth] = useState(1280);
  const [canvasHeight, setCanvasHeight] = useState(720);

  // 描画の強制更新用フラグ: StateをRefObjectで代替している箇所のために強制更新が必要。
  const [update, setUpdata] = useState(false);

  // ドラッグ開始位置がキャンバス内かどうかのフラグ
  const [inCanvas, setInCanvas] = useState(false);

  // キャプチャ映像がキャンバス上のどこにあるか
  const [destX, setDestX] = useSetRef(0);
  const [destY, setDestY] = useSetRef(0);

  // キャプチャ映像の表示倍率
  const [scale, setScale] = useSetRef(0.5);

  const ffmpegRef = useRef(new FFmpeg());
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const inputStreamRef = useRef<MediaStream>(null);
  const captureStreamRef = useRef<MediaStream>(null);
  const mediaRecorderRef = useRef<MediaRecorder>(null);

  /**
   * 描画の強制更新
   */
  const forceUpdate = useCallback(() => {
    setUpdata(update ? false : true);
  }, [update]);

  /**
   * MediaRecorder でデータが利用可能になったときのハンドラ
   */
  const dataAvailableHandler = useCallback(
    ({ data }: BlobEvent) => {
      if (data.size === 0) return;
      setRecordedChunks([...recordedChunks, data]);
    },
    [recordedChunks]
  );

  /**
   * キャンバスに ReadableStreamDefaultReader の内容を表示する
   */
  const readChunk = useCallback(
    async (
      ctx: CanvasRenderingContext2D | null,
      reader: ReadableStreamDefaultReader<VideoFrame>
    ) => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      if (ctx === null) return;

      const { done, value } = await reader.read();

      if (value === undefined) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        value,
        0,
        0,
        value.displayWidth,
        value.displayHeight,
        destX.current,
        destY.current,
        value.displayWidth * scale.current,
        value.displayHeight * scale.current
      );

      value.close();

      if (!done) {
        await readChunk(ctx, reader);
      }
    },
    [destX, destY, scale]
  );

  /**
   * 画面選択するときのハンドラ
   */
  const selectHandler = useCallback(async () => {
    if (canvasRef.current === null) return;

    // ディスプレイの内容を MediaStream として取得
    const canvas = canvasRef.current;

    inputStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "window",
      },
      audio: false,
    });

    // キャンバスに inputStream から取得した映像を表示する
    const ctx = canvas.getContext("2d");
    const track = inputStreamRef.current.getVideoTracks()[0];
    const processor = new MediaStreamTrackProcessor({ track });
    const reader = processor.readable.getReader();
    await readChunk(ctx, reader);
  }, [readChunk]);

  /**
   * キャプチャ開始されたときのハンドラ
   */
  const startHandler = useCallback(() => {
    if (canvasRef.current === null) return;

    try {
      // キャプチャデータを削除
      setRecordedChunks([]);

      // キャンバスの内容を MediaRecorder でキャプチャする
      const canvas = canvasRef.current;
      captureStreamRef.current = canvas.captureStream(30);
      mediaRecorderRef.current = new MediaRecorder(captureStreamRef.current);
      mediaRecorderRef.current.addEventListener(
        "dataavailable",
        dataAvailableHandler
      );
      mediaRecorderRef.current.start();
    } catch (err) {
      console.error(err);
    }
  }, [dataAvailableHandler]);

  /**
   * キャプチャ停止されたときのハンドラ
   */
  const stopHandler = useCallback(() => {
    if (inputStreamRef.current === null) return;
    inputStreamRef.current.getTracks().forEach((track) => {
      track.stop();
    });

    if (captureStreamRef.current === null) return;
    captureStreamRef.current.getTracks().forEach((track) => {
      track.stop();
    });
  }, []);

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

    setLoaded(true);
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
  }, [recordedChunks]);

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

      <p>
        {loaded ? (
          <>
            <button
              onClick={selectHandler}
              className="px-6 py-2 text-gray-700 font-bold rounded-3xl border-1 hover:bg-gray-100"
            >
              画面選択
            </button>
            <button
              onClick={startHandler}
              className="ml-2 px-6 py-2 text-green-700 font-bold rounded-3xl border-1 hover:bg-green-100"
            >
              キャプチャ開始
            </button>
            <button
              onClick={stopHandler}
              className="ml-2 px-6 py-2  text-red-700 font-bold rounded-3xl border-1 hover:bg-red-100"
            >
              キャプチャ停止
            </button>
            <button
              onClick={transcodeHandler}
              className="ml-2 px-6 py-2 text-white font-bold rounded-3xl bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400"
            >
              GIFアニメに変換
            </button>
          </>
        ) : (
          <button
            onClick={loadHandler}
            className="px-6 py-2 text-white font-bold rounded-3xl bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400"
          >
            @ffmpeg/core をロードする
          </button>
        )}
      </p>

      <h2>モニタ</h2>
      <div
        onMouseDown={({ clientX, clientY }) => {
          const canvas = canvasRef.current;
          if (canvas === null) return;
          if (clientX > canvas.width - 100 || clientY > canvas.height - 100) {
            setInCanvas(true);
          } else {
            setInCanvas(false);
          }
        }}
        onMouseMove={({ buttons, clientX, clientY }) => {
          if (buttons !== 1) return;

          if (!inCanvas) {
            return;
          }

          setCanvasWidth(clientX);
          setCanvasHeight(clientY);
        }}
        className="bg-red-500 pb-10"
      >
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onMouseDown={() => {
            setInCanvas(true);
          }}
          onMouseMove={({
            buttons,
            movementX,
            movementY,
            clientX,
            clientY,
          }: MouseEvent) => {
            if (buttons !== 1) return;

            if (inCanvas) {
              setCanvasWidth(clientX);
              setCanvasHeight(clientY);
            } else {
              setDestX(Number(destX.current + movementX));
              setDestY(Number(destY.current + movementY));
              forceUpdate();
            }
          }}
          onWheel={({ deltaY }) => {
            if (deltaY > 0) {
              setScale(Number(scale.current - 0.01));
            } else if (deltaY < 0) {
              setScale(Number(scale.current + 0.01));
            }
            forceUpdate();
          }}
          className="bg-black inline"
        />
      </div>

      <br />
      <label className="text-lg text-gray-700">
        X
        <input
          type="number"
          value={destX.current}
          step={10}
          onChange={({ currentTarget }) => {
            setDestX(Number(currentTarget.value));
            forceUpdate();
          }}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>
      <label className="ml-2 text-lg text-gray-700">
        Y
        <input
          type="number"
          value={destY.current}
          step={10}
          onChange={({ currentTarget }) => {
            setDestY(Number(currentTarget.value));
            forceUpdate();
          }}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>
      <label className="ml-2 text-lg text-gray-700">
        Scale
        <input
          type="number"
          value={scale.current}
          step={0.01}
          onChange={({ currentTarget }) => {
            setScale(Number(currentTarget.value));
            forceUpdate();
          }}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>
      <label className="ml-2 text-lg text-gray-700">
        Width
        <input
          type="number"
          value={canvasWidth}
          step={10}
          onChange={({ currentTarget }) => {
            setCanvasWidth(Number(currentTarget.value));
          }}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>
      <label className="ml-2 text-lg text-gray-700">
        Height
        <input
          type="number"
          value={canvasHeight}
          step={10}
          onChange={({ currentTarget }) => {
            setCanvasHeight(Number(currentTarget.value));
          }}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>

      <h2>キャプチャ内容</h2>
      <video ref={videoRef} controls />

      <h2>変換結果</h2>
      <img src={gif} />
      <pre ref={logRef} />
    </div>
  );
}

export default App;
