// pages/api/socket/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import { Server as NetServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import { GoogleGenAI, GenerateContentResponse, Modality, LiveServerMessage, Session } from "@google/genai";
// import dotenv from "dotenv";

// dotenv.config();

// Extend Socket to add our live session property.
interface CustomSocket extends Socket {
  liveSession?: {
    // We assume the liveSession object returned from the SDK is both
    // an async iterable of response chunks and a writable stream.
    write: (input: { audio: { inlineData: { data: string; mimeType: string } } }) => void;
    end: () => void;
  } & AsyncIterable<GenerateContentResponse>;
}

// Extend NextApiResponse so that its socket property includes a server.
interface NextApiResponseWithSocket extends NextApiResponse {
  socket: {
    server: NetServer & { io?: IOServer };
  };
}

// Disable body parsing so that the raw upgrade request comes through.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponseWithSocket
) {
  if (!res.socket.server.io) {
    console.log("Initializing new Socket.IO server...");
    const io = new IOServer(res.socket.server, {
      path: "/api/socket/socket.io",
    });
    let liveSession: Session | undefined;
    io.on("connection", async (socket: CustomSocket) => {
      console.log("Client connected:", socket.id);

      try {
        // Initialize the Google Gen AI client in Vertex AI mode.
        // (Make sure these environment variables are set: GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION)
        const genaiClient = new GoogleGenAI({
          // vertexai: true,
          // project: process.env.GOOGLE_CLOUD_PROJECT,
          // location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            apiVersion: 'v1alpha',
          },
        });

        // Start a live transcription session using the Gemini model.
        // Here we use the model "gemini-2.0-flash-exp"; adjust generation_config as needed.
        liveSession = await genaiClient.live.connect({
          model: 'gemini-2.0-flash-live-001',
          config: {
            responseModalities: [Modality.TEXT],
            // realtimeInputConfig: {
            //   automaticActivityDetection: {
            //     disabled: false,
            //     silenceDurationMs: 5000,
            //   }
            // },
          },
          callbacks: {
            onopen: () => {
              console.log('Connected to the socket.');
            },
            onmessage: (e: LiveServerMessage) => {
              console.log('Received message from the server: %s\n',
                e
              );
            },
            onerror: (e: ErrorEvent) => {
              console.log('Error occurred: %s\n', e.error);
            },
            onclose: (e: CloseEvent) => {
              console.log('Connection closed.');
            },
          },
          });
          console.log(`@@@@@@@@@@@@@@@@@@@@@@@@`, liveSession);
          // liveSession.conn.send()
          
        
        // const liveSession = await genaiClient.models.generateContentStream({
        //   model: "gemini-2.0-flash-exp",
        //   // config: {
        //   //   // For transcription you probably want deterministic output (temperature 0)
        //   //   temperature: 0.0,
        //   //   maxOutputTokens: 2048,
        //   //   // Other transcription-specific settings may be needed here.
        //   // },
        //   // stream: true,
        // });
        // socket.liveSession = liveSession;
        console.log("Live session initialized for socket", socket.id);

        // Continuously iterate over the live session output and emit transcription results.
        // (async () => {
        //   try {
        //     for await (const chunk of liveSession) {
        //       // Each chunk is assumed to have a candidates array; 
        //       // we extract any transcribed text from candidate[0].delta.content.
        //       if (chunk.choices && chunk.choices[0]?.delta?.content) {
        //         const text = chunk.choices[0].delta.content;
        //         // Emit the text to the client as it arrives.
        //         socket.emit("transcription", text);
        //       }
        //     }
        //     console.log("Live session stream closed for socket", socket.id);
        //   } catch (err) {
        //     console.error("Error in live session stream:", err);
        //   }
        // })();
      } catch (error) {
        console.error("Error initializing live session:", error);
        socket.disconnect();
        return;
      }

      // When an audio chunk is received from the client, write it to the live session.
      socket.on("audio-stream", async (data: Buffer) => {
        console.log("Received audio chunk from client", socket.id);
        if (liveSession) {
          try {
            // Convert binary audio data into Base64.
            const base64Data = data.toString("base64");
            // const blob = new Blob([data], { type: "audio/webm" });
            // await liveSession.sendClientContent({
            //   turns: {
            //     role: "user",
            //     parts: [{
                  
            //     }],
            //   },
            // });
            const content = await liveSession.sendRealtimeInput({ media: { data: base64Data } });
            console.log("1111111111111111111111111:", content);
            // Write this audio chunk into the live session.
            // socket.liveSession.write({
            //   audio: {
            //     inlineData: {
            //       data: base64Data,
            //       mimeType: "audio/webm; codecs=opus", // Ensure this matches your recording format.
            //     },
            //   },
            // });
          } catch (err) {
            console.error("Error writing audio chunk to live session:", err);
          }
        } else {
          console.error("No live session available for socket", socket.id);
        }
      });

      // When silence is detected, end the live transcription session.
      socket.on("silence", () => {
        console.log("Silence detected on socket", socket.id);
        if (socket.liveSession) {
          socket.liveSession.end();
          delete socket.liveSession;
          console.log("Live session ended due to silence for socket", socket.id);
        }
      });

      // Optional echo test.
      socket.on("echo", (msg: string) => {
        console.log("Echo message received:", msg);
        socket.emit("echo-response", msg);
      });
    });

    res.socket.server.io = io;
  }
  res.end();
}
