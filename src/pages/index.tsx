// pages/index.tsx
import { signIn, signOut, useSession } from "next-auth/react";
import type { NextPage } from "next";
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const Home: NextPage = () => {
  const { data: session } = useSession();
  const [isRecording, setIsRecording] = useState(false);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  // Store echoed chunks as Blob parts.
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const conversationStartedRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<number | null>(null);
  const levelIntervalRef = useRef<number | null>(null);

  const SILENCE_THRESHOLD = 10; // adjust as needed
  const SILENCE_DURATION = 3000; // in ms

  useEffect(() => {
    // Hit the API to initialize the socket server.
    fetch("/api/socket");
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Monitor audio level to detect silence.
  const monitorAudioLevel = () => {
    if (!analyserRef.current) return;
    const bufferLength = analyserRef.current.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);
    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      const deviation = dataArray[i] - 128;
      sumSquares += deviation * deviation;
    }
    const rms = Math.sqrt(sumSquares / bufferLength);
    console.log("RMS:", rms);
    if (rms > SILENCE_THRESHOLD && !conversationStartedRef.current) {
      conversationStartedRef.current = true;
    }
    if (rms < SILENCE_THRESHOLD && conversationStartedRef.current) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = window.setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            console.log("Silence detected, stopping recording");
            mediaRecorderRef.current.stop();
          }
          silenceTimerRef.current = null;
          conversationStartedRef.current = false;
          socketRef.current?.emit("silence");
        }, SILENCE_DURATION);
      }
    } else {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    }
  };

  const startRecording = async () => {
    // Clear previous echoed audio chunks.
    audioChunksRef.current = [];

    // Establish a new Socket.IO connection with the proper path.
    socketRef.current = io("", { path: "/api/socket/socket.io" });

    // Listen for echoed audio chunks.
    socketRef.current.on("audio-response", (data: any) => {
      // Convert the binary data into a Blob part.
      console.log("Echo response received");
      const blobChunk = new Blob([data], { type: "audio/webm; codecs=opus" });
      audioChunksRef.current.push(blobChunk);
    });

    // Optional echo test.
    socketRef.current.on("echo-response", (msg: string) => {
      console.log("Echo response received:", msg);
    });
    socketRef.current.emit("echo", "Test echo from client");

    // Create AudioContext.
    const audioContext = new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = audioContext;

    // Get user's audio stream.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioStreamRef.current = stream;

    // Set up MediaRecorder with MIME type.
    mediaRecorderRef.current = new MediaRecorder(stream, {
      mimeType: "audio/webm; codecs=opus",
    });

    // Create a source node and an analyser to monitor audio level.
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyserRef.current = analyser;

    // When a new chunk is available, send it to the server.
    mediaRecorderRef.current.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0 && socketRef.current) {
        socketRef.current.emit("audio-stream", event.data);
      }
    });

    // When recording stops, create a Blob from the echoed data and play it.
    mediaRecorderRef.current.addEventListener("stop", () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm; codecs=opus" });
      const audioURL = URL.createObjectURL(blob);
      const audio = new Audio(audioURL);
      audio.play().catch((err) => console.error("Error playing echoed audio:", err));
    });

    levelIntervalRef.current = window.setInterval(monitorAudioLevel, 100);
    // Start recording with data chunks every 250ms.
    mediaRecorderRef.current.start(250);
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    socketRef.current?.disconnect();
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "2rem" }}>
      {!session ? (
        <>
          <h2>You are not signed in</h2>
          <button onClick={() => signIn("google")}>Sign in with Google</button>
        </>
      ) : (
        <>
          <h2>Welcome, {session.user?.name}!</h2>
          {session.user?.image && (
            <img
              src={session.user.image}
              alt={`${session.user.name}'s avatar`}
              style={{
                borderRadius: "50%",
                width: "100px",
                height: "100px",
                objectFit: "cover",
                marginBottom: "1rem",
              }}
            />
          )}
          {session.user?.email && <p>Email: {session.user.email}</p>}
          <button onClick={() => signOut()}>Sign out</button>
          <button onClick={startRecording} disabled={isRecording}>
            Start Recording
          </button>
          <button onClick={stopRecording} disabled={!isRecording}>
            Stop Recording
          </button>
        </>
      )}
    </div>
  );
};

export default Home;
