import express from "express";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 5001;

app.use(express.json());
app.use(express.static("public"));

const rooms = {};

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("JOIN_ROOM", ({ roomId }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        strokes: [],
        clients: new Set(),
      };
    }

    socket.join(roomId);
    socket.roomId = roomId;
    rooms[roomId].clients.add(socket.id);

    socket.emit("INIT_STROKES", rooms[roomId].strokes);

    socket.to(roomId).emit("USER_JOINED", {
      clientId: socket.id,
    });
  });

  socket.on("CURSOR_MOVE", (data) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    socket.to(roomId).emit("CURSOR_MOVE", data);
  });

  socket.on("CLEAR_CANVAS", () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].strokes = [];
    io.to(roomId).emit("CANVAS_CLEARED");
  });

  socket.on("DRAW_STROKE", (stroke) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const serverStroke = {
      ...stroke,
      ownerId: socket.id,
    };

    rooms[roomId].strokes.push(serverStroke);
    io.to(roomId).emit("DRAW_STROKE", serverStroke);
  });

  socket.on("UNDO_STROKE", () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const strokes = rooms[roomId].strokes;

    for (let i = strokes.length - 1; i >= 0; i--) {
      if (strokes[i].ownerId === socket.id) {
        const [removedStroke] = strokes.splice(i, 1);

        io.to(roomId).emit("STROKE_REMOVED", {
          strokeId: removedStroke.id,
        });
        break;
      }
    }
  });

  socket.on("REDO_STROKE", (stroke) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    if (stroke.ownerId !== socket.id) return;

    rooms[roomId].strokes.push(stroke);
    io.to(roomId).emit("DRAW_STROKE", stroke);
  });

  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    socket.to(roomId).emit("USER_LEFT", {
      clientId: socket.id,
    });

    rooms[roomId].clients.delete(socket.id);
    if (rooms[roomId].clients.size === 0) {
      delete rooms[roomId];
    }

    console.log("Socket disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
