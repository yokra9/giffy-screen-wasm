import {
  useState,
  useRef,
  useCallback,
  JSX,
  MouseEvent,
  WheelEvent,
  ChangeEvent,
} from "react";

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

interface Props {
  /**
   * キャプチャデータ
   */
  recordedChunks: Blob[];
  /**
   * キャプチャデータのセッタ
   */
  setRecordedChunks: (value: React.SetStateAction<Blob[]>) => void;
  /**
   * 画面の状態のセッタ
   */
  setCurretView: (
    value: React.SetStateAction<"captured" | "init" | "loaded" | "converted">
  ) => void;
  /**
   * FPS
   */
  fps: number;
  /**
   * FPSのセッタ
   */
  setFps: (value: React.SetStateAction<number>) => void;
}

/**
 * 画面録画コンポーネント
 */
function DisplayRecorder({
  recordedChunks,
  setRecordedChunks,
  setCurretView,
  fps,
  setFps,
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputStreamRef = useRef<MediaStream>(null);
  const captureStreamRef = useRef<MediaStream>(null);
  const mediaRecorderRef = useRef<MediaRecorder>(null);

  // キャプチャ中かどうかのフラグ
  const [isCapturing, setIsCapturing] = useState(false);

  // キャンバスのサイズ
  const [canvasWidth, setCanvasWidth] = useState(1280);
  const [canvasHeight, setCanvasHeight] = useState(720);

  // ドラッグ開始位置がキャンバス内かのフラグ
  const [inCanvas, setInCanvas] = useState(false);

  // キャプチャ映像がキャンバス上のどこにあるか
  const [destX, setDestX] = useSetRef(0);
  const [destY, setDestY] = useSetRef(0);

  // キャプチャ映像の表示倍率
  const [scale, setScale] = useSetRef(0.5);

  // 描画の強制更新用フラグ: StateをRefObjectで代替している箇所のために強制更新が必要。
  const [update, setUpdate] = useState(false);

  /**
   * 描画の強制更新
   */
  const forceUpdate = useCallback(() => {
    setUpdate(update ? false : true);
  }, [update]);

  /**
   * MediaRecorder でデータが利用可能になったときのハンドラ
   */
  const dataAvailableHandler = useCallback(
    ({ data }: BlobEvent) => {
      if (data.size === 0) return;
      setRecordedChunks([...recordedChunks, data]);
    },
    [recordedChunks, setRecordedChunks]
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

    // inputStreamRef に内容があれば停止しておく
    if (inputStreamRef.current !== null) {
      inputStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
    }

    // ディスプレイの内容を MediaStream として取得して inputStreamRef に設定
    inputStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "window",
      },
      audio: false,
    });

    // キャンバスに inputStreamRef から取得した映像を表示する
    const canvas = canvasRef.current;
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
      setIsCapturing(true);

      // キャプチャデータを削除
      setRecordedChunks([]);

      // キャンバスの内容を MediaRecorder でキャプチャする
      const canvas = canvasRef.current;
      captureStreamRef.current = canvas.captureStream(fps);
      mediaRecorderRef.current = new MediaRecorder(captureStreamRef.current);
      mediaRecorderRef.current.addEventListener(
        "dataavailable",
        dataAvailableHandler
      );
      mediaRecorderRef.current.start();
    } catch (err) {
      console.error(err);
    }
  }, [dataAvailableHandler, fps, setRecordedChunks]);

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

    setIsCapturing(false);
    setCurretView("captured");
  }, [setCurretView]);

  /**
   * キャンバス上でマウスが動いたときのハンドラ
   */
  const canvasMouseMoveHandler = useCallback(
    ({ buttons, movementX, movementY, clientX, clientY }: MouseEvent) => {
      if (buttons !== 1) return;

      if (inCanvas) {
        setCanvasWidth(clientX);
        setCanvasHeight(clientY);
      } else {
        setDestX(Number(destX.current + movementX));
        setDestY(Number(destY.current + movementY));
        forceUpdate();
      }
    },
    [destX, destY, forceUpdate, inCanvas, setDestX, setDestY]
  );

  /**
   * キャンバス上でスクロールされたときのハンドラ
   */
  const canvasWheelHandler = useCallback(
    ({ deltaY }: WheelEvent) => {
      if (deltaY > 0) {
        setScale(Number(scale.current - 0.01));
      } else if (deltaY < 0) {
        setScale(Number(scale.current + 0.01));
      }
      forceUpdate();
    },
    [forceUpdate, scale, setScale]
  );

  /**
   * コンテナ要素上でマウスが動いたときのハンドラ
   */
  const containerMouseDownHandler = useCallback(
    ({ clientX, clientY }: MouseEvent) => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      if (clientX > canvas.width - 100 || clientY > canvas.height - 100) {
        setInCanvas(true);
      } else {
        setInCanvas(false);
      }
    },
    []
  );

  /**
   * コンテナ要素上でマウスが押下されたときのハンドラ
   */
  const containerMouseMoveHandler = useCallback(
    ({ buttons, clientX, clientY }: MouseEvent) => {
      if (buttons !== 1) return;

      if (!inCanvas) {
        return;
      }

      setCanvasWidth(clientX);
      setCanvasHeight(clientY);
    },
    [inCanvas]
  );

  /**
   * X 入力が変更されたときのハンドラ
   */
  const xInputChangeHandler = useCallback(
    ({ currentTarget }: ChangeEvent<HTMLInputElement>) => {
      setDestX(Number(currentTarget.value));
      forceUpdate();
    },
    [forceUpdate, setDestX]
  );

  /**
   * Y 入力が変更されたときのハンドラ
   */
  const yInputChangeHandler = useCallback(
    ({ currentTarget }: ChangeEvent<HTMLInputElement>) => {
      setDestY(Number(currentTarget.value));
      forceUpdate();
    },
    [forceUpdate, setDestY]
  );

  /**
   * Scale 入力が変更されたときのハンドラ
   */
  const scaleInputChangeHandler = useCallback(
    ({ currentTarget }: ChangeEvent<HTMLInputElement>) => {
      setScale(Number(currentTarget.value));
      forceUpdate();
    },
    [forceUpdate, setScale]
  );

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
   * Width 入力が変更されたときのハンドラ
   */
  const widthInputChangeHandler = useCallback(
    ({ currentTarget }: ChangeEvent<HTMLInputElement>) => {
      setCanvasWidth(Number(currentTarget.value));
    },
    []
  );

  /**
   * Height 入力が変更されたときのハンドラ
   */
  const heightInputChangeHandler = useCallback(
    ({ currentTarget }: ChangeEvent<HTMLInputElement>) => {
      setCanvasHeight(Number(currentTarget.value));
    },
    []
  );

  return (
    <>
      <p>
        <button
          onClick={() => void selectHandler()}
          className="px-6 py-2 text-gray-700 font-bold rounded-3xl border-1 hover:bg-gray-100"
        >
          画面選択
        </button>
        {isCapturing ? (
          <button
            onClick={stopHandler}
            className="ml-2 px-6 py-2 text-red-700 font-bold rounded-3xl border-1 hover:bg-red-100"
          >
            キャプチャ停止
          </button>
        ) : (
          <button
            onClick={startHandler}
            className="ml-2 px-6 py-2 text-green-700 font-bold rounded-3xl border-1 hover:bg-green-100"
          >
            キャプチャ開始
          </button>
        )}
      </p>

      <h2>モニタ</h2>
      <div
        onMouseDown={containerMouseDownHandler}
        onMouseMove={containerMouseMoveHandler}
        className="pb-10"
      >
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onMouseDown={() => {
            setInCanvas(true);
          }}
          onMouseMove={canvasMouseMoveHandler}
          onWheel={canvasWheelHandler}
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
          onChange={xInputChangeHandler}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>
      <label className="ml-2 text-lg text-gray-700">
        Y
        <input
          type="number"
          value={destY.current}
          step={10}
          onChange={yInputChangeHandler}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>
      <label className="ml-2 text-lg text-gray-700">
        Scale
        <input
          type="number"
          value={scale.current}
          step={0.01}
          onChange={scaleInputChangeHandler}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>
      <label className="ml-2 text-lg text-gray-700">
        FPS
        <input
          type="number"
          value={fps}
          onChange={fpsInputChangeHandler}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>
      <label className="ml-2 text-lg text-gray-700">
        Width
        <input
          type="number"
          value={canvasWidth}
          step={10}
          onChange={widthInputChangeHandler}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>
      <label className="ml-2 text-lg text-gray-700">
        Height
        <input
          type="number"
          value={canvasHeight}
          step={10}
          onChange={heightInputChangeHandler}
          className="text-sm leading-none font-medium border border-gray-300 rounded-md ml-2 px-2 py-1 focus:outline-none focus:border-blue-500 "
        />
      </label>
    </>
  );
}

export default DisplayRecorder;
