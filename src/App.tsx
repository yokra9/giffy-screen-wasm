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

  const ffmpegRef = useRef(new FFmpeg());
  const monitorRef = useRef<HTMLVideoElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const mediaStreamRef = useRef<MediaStream>(null);
  const mediaRecorderRef = useRef<MediaRecorder>(null);

  /**
   * MediaRecorderでデータが利用可能になったときのハンドラ
   */
  const handleDataAvailable = useCallback(
    ({ data }: BlobEvent) => {
      if (data.size === 0) return;
      setRecordedChunks([...recordedChunks, data]);
    },
    [recordedChunks]
  );

  /**
   * キャプチャ開始されたときのハンドラ
   */
  const startHandler = useCallback(async () => {
    if (monitorRef.current === null) return;

    try {
      // 前回のキャプチャ内容を削除
      setRecordedChunks([]);

      // ディスプレイの内容を MediaStream として取得
      mediaStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "window",
        },
        audio: false,
      });
      // キャプチャ中の内容を表示
      monitorRef.current.srcObject = mediaStreamRef.current;

      // MediaRecorder に MediaStream を流し込んでキャプチャ
      mediaRecorderRef.current = new MediaRecorder(mediaStreamRef.current);
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
    if (mediaStreamRef.current === null) return;

    // MediaStream の全トラックを停止
    const tracks = mediaStreamRef.current.getTracks();
    tracks.forEach((track) => {
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
            <button onClick={startHandler}>キャプチャ開始</button>
            <button onClick={stopHandler}>キャプチャ停止</button>
            <button onClick={transcodeHandler}>GIFアニメに変換</button>
          </>
        ) : (
          <button onClick={loadHandler}>@ffmpeg/core をロードする</button>
        )}
      </p>

      <h2>モニタ</h2>
      <video ref={monitorRef} width={720} autoPlay></video>

      <h2>キャプチャ内容</h2>
      <video ref={videoRef} width={720} controls></video>

      <h2>変換結果</h2>
      <img ref={imageRef} width={720}></img>
      <pre ref={logRef}></pre>
    </>
  );
}

export default App;
