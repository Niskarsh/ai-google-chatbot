import { NextApiRequest, NextApiResponse } from "next";
import { Server as NetServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import { getToken } from "next-auth/jwt";
import { OAuth2Client } from "google-auth-library";
import { SpeechClient } from "@google-cloud/speech";

// Extend NextApiResponse so that its socket property includes a server.
type NextApiResponseWithSocket = NextApiResponse & {
  socket: {
    server: NetServer & { io?: IOServer }
  }
};

// We derive the type for the speech stream from the SpeechClient's streamingRecognize method.
type SpeechStreamType = ReturnType<SpeechClient["streamingRecognize"]>;

// Extend Socket with an optional speechStream property.
interface CustomSocket extends Socket {
  speechStream?: SpeechStreamType;
}

export const config = {
  api: {
    bodyParser: false, // Disable body parsing for raw upgrade requests.
  },
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponseWithSocket
) {
  // Ensure the socket exists.
  if (!res.socket) {
    console.error("Socket is null");
    res.end();
    return;
  }

  // If Socket.IO hasn't been initialized, do so.
  if (!res.socket.server.io) {
    console.log("Initializing new Socket.IO server...");

    const io = new IOServer(res.socket.server, {
      path: "/api/socket/socket.io",
    });

    io.on("connection", (socket: CustomSocket) => {
      console.log("Client connected:", socket.id);

      (async () => {
        try {
          // Create a fake request with the handshake cookies so getToken can extract the token.
          const fakeReq = { headers: { cookie: socket.handshake.headers.cookie || "" } } as NextApiRequest;
          const token = await getToken({ req: fakeReq, secret: process.env.NEXT_PUBLIC_SECRET });
          if (!token || !token.accessToken) {
            console.error("No valid access token found; disconnecting socket");
            socket.disconnect();
            return;
          }

          // Set up an OAuth2Client using your Google client credentials.
          const oauth2Client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
          );
          // Cast the accessToken to string.
          oauth2Client.setCredentials({ access_token: token.accessToken as string });

          // Workaround: cast oauth2Client to the type expected by SpeechClient.
          // @ts-expect-error Type 'unknown' is not assignable to type 'GoogleAuth<AuthClient> | undefined'.
          const speechClient = new SpeechClient({ auth: oauth2Client as unknown });

          // Configure the Speech-to-Text streaming request.
          const request = {
            config: {
              encoding: "WEBM_OPUS", // Must match the client recording (e.g. audio/webm; codecs=opus)
              sampleRateHertz: 24000, // Must match the AudioContext sample rate
              languageCode: "en-US",
            },
            interimResults: true,
          } as const;

          // Create the streamingRecognize stream.
          const recognizeStream = speechClient
            .streamingRecognize(request)
            .on("error", (error) => {
              console.error("Speech-to-Text error:", error);
            })
            .on("data", (data) => {
              const transcription = data.results?.[0]?.alternatives?.[0]?.transcript;
              console.log("Transcription:", transcription);
              if (transcription) {
                socket.emit("transcription", transcription);
              }
            });

          // Save the speech stream on the socket.
          socket.speechStream = recognizeStream;
        } catch (error) {
          console.error("Error setting up Speech-to-Text:", error);
          socket.disconnect();
        }
      })();

      // When an audio chunk arrives, write it to the speech stream.
      socket.on("audio-stream", (data: Buffer) => {
        if (socket.speechStream) {
          socket.speechStream.write(data);
        }
      });

      // When silence is detected, close the speech stream.
      socket.on("silence", () => {
        if (socket.speechStream) {
          console.log("Silence event received, closing speech stream.");
          socket.speechStream.end();
          delete socket.speechStream;
        }
      });

      // For an echo test.
      socket.on("echo", (msg: string) => {
        console.log("Echo message received:", msg);
        socket.emit("echo-response", msg);
      });
    });

    res.socket.server.io = io;
  }

  res.end();
}
