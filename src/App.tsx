import { useState, useRef, useCallback, useEffect, JSX } from "react";
import { FFmpeg, LogEvent } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import "./App.css";

const baseURL = "https://unpkg.com/@ffmpeg/core@latest/dist/esm";

function App(): JSX.Element {
  // @ffmpeg/core がロードされているかどうか
  const [loaded, setLoaded] = useState(false);

  // キャプチャデータ
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);

  // キャプチャ映像がキャンバス上のどこにあるか
  const [destX, setDestX] = useState(0);
  const [destY, setDestY] = useState(0);

  // キャプチャ映像の表示倍率
  const [scale, setScale] = useState(0.5);

  // キャンバスのサイズ
  const [canvasWidth, setCanvasWidth] = useState(1280);
  const [canvasHeight, setCanvasHeight] = useState(720);

  const ffmpegRef = useRef(new FFmpeg());
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const inputStreamRef = useRef<MediaStream>(null);
  const captureStreamRef = useRef<MediaStream>(null);
  const mediaRecorderRef = useRef<MediaRecorder>(null);

  /**
   * MediaRecorder でデータが利用可能になったときのハンドラ
   */
  const handleDataAvailable = useCallback(
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
      reader: ReadableStreamDefaultReader<VideoFrame>,
      destX: number,
      destY: number,
      scale: number
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
        destX,
        destY,
        value.displayWidth * scale,
        value.displayHeight * scale
      );

      value.close();

      if (!done) {
        await readChunk(ctx, reader, destX, destY, scale);
      }
    },
    []
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
    await readChunk(ctx, reader, destX, destY, scale);
  }, [destX, destY, readChunk, scale]);

  /**
   * キャプチャ開始されたときのハンドラ
   */
  const startHandler = useCallback(() => {
    if (canvasRef.current === null) return;

    try {
      // 前回のキャプチャ内容を削除
      setRecordedChunks([]);

      // キャンバスの内容を MediaRecorder でキャプチャする
      const canvas = canvasRef.current;
      captureStreamRef.current = canvas.captureStream(30);
      mediaRecorderRef.current = new MediaRecorder(captureStreamRef.current);
      mediaRecorderRef.current.addEventListener(
        "dataavailable",
        handleDataAvailable
      );
      mediaRecorderRef.current.start();
    } catch (err) {
      console.error(err);
    }
  }, [handleDataAvailable]);

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
    if (imageRef.current === null) return;

    // キャプチャデータを ffmpeg に読み込ませ、GIFアニメに変換する
    const ffmpeg = ffmpegRef.current;
    await ffmpeg.writeFile("input", await fetchFile(new Blob(recordedChunks)));
    await ffmpeg.exec(["-i", "input", "output.gif"]);
    const data = await ffmpeg.readFile("output.gif");
    imageRef.current.src = URL.createObjectURL(
      new Blob([data], { type: "image/gif" })
    );
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
    <>
      <h1>画面キャプチャしてGIFアニメに変換</h1>

      <p>
        {loaded ? (
          <>
            <button onClick={selectHandler}>画面選択</button>
            <button onClick={startHandler}>キャプチャ開始</button>
            <button onClick={stopHandler}>キャプチャ停止</button>
            <button onClick={transcodeHandler}>GIFアニメに変換</button>
          </>
        ) : (
          <button onClick={loadHandler}>@ffmpeg/core をロードする</button>
        )}
      </p>

      <h2>モニタ</h2>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{ border: "2px solid black" }}
      />

      <br />
      <label>
        X
        <input
          type="number"
          value={-destX}
          onChange={({ currentTarget }) => {
            setDestX(-Number(currentTarget.value));
          }}
        />
      </label>
      <label>
        Y
        <input
          type="number"
          value={-destY}
          onChange={({ currentTarget }) => {
            setDestY(-Number(currentTarget.value));
          }}
        />
      </label>
      <label>
        Scale
        <input
          type="number"
          value={scale}
          onChange={({ currentTarget }) => {
            setScale(Number(currentTarget.value));
          }}
        />
      </label>
      <label>
        Width
        <input
          type="number"
          value={canvasWidth}
          onChange={({ currentTarget }) => {
            setCanvasWidth(Number(currentTarget.value));
          }}
        />
      </label>
      <label>
        Height
        <input
          type="number"
          value={canvasHeight}
          onChange={({ currentTarget }) => {
            setCanvasHeight(Number(currentTarget.value));
          }}
        />
      </label>

      <h2>キャプチャ内容</h2>
      <video ref={videoRef} controls />

      <h2>変換結果</h2>
      <img ref={imageRef} />
      <pre ref={logRef} />
    </>
  );
}

export default App;
