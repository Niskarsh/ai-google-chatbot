import { NextApiRequest, NextApiResponse } from "next";
import { Server as NetServer } from "http";
import { Server as IOServer } from "socket.io";

// Extend NextApiResponse to include a server property in socket.
type NextApiResponseWithSocket = NextApiResponse & {
  socket: {
    server: NetServer & { io?: IOServer }
  }
};

export const config = {
  api: {
    bodyParser: false, // Disables body parsing for WebSocket compatibility.
  },
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponseWithSocket
) {
  // Confirm that the socket is available.
  if (!res.socket) {
    console.error("Socket is null");
    res.end();
    return;
  }

  // Check if the Socket.IO server is already initialized.
  if (!res.socket.server.io) {
    console.log("Initializing new Socket.IO server...");
    // Initialize a new Socket.IO server instance and specify the custom path.
    const io = new IOServer(res.socket.server, {
      path: "/api/socket/socket.io",
    });

    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);

      // Handle incoming audio-stream event.
      socket.on("audio-stream", (data: Buffer) => {
        console.log("Received audio chunk, size:", data.length);
        socket.emit("audio-response", data);
        // Process the audio data (for example, forward to a speech-to-text engine).
      });

      // Handle a silence event.
      socket.on("silence", () => {
        console.log("Silence event received");
      });

      // Handle a sample echo event.
      socket.on("echo", (msg: string) => {
        socket.emit("echo-response", msg);
      });
    });

    // Cache the IO server on the socket so that it is not re-initialized.
    res.socket.server.io = io;
  }
  
  res.end();
}
