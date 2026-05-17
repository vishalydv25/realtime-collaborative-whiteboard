# Realtime Collaborative Whiteboard

A real-time, room-based collaborative whiteboard built using Node.js, Express, Socket.IO, and the HTML Canvas API.

Users can create or join a room via a shared link and draw together live — no accounts, no database, no setup.

---

## Live Demo

Live URL: https://realtime-collaborative-whiteboard-zlvr.onrender.com/

Join a room by adding a room query parameter:

Just enter a room id that you want to join and press "JOIN" or start drawing in the default one.

---

## Features

- Real-time drawing with multiple users
- Room-based collaboration using shared URLs
- Undo / Redo (per user)
- Clear and Restore canvas
- Live cursor presence with unique colors
- Late joiners receive existing strokes
- Export whiteboard as PNG
- Ephemeral rooms (destroyed when all users leave)

---

## Design Philosophy

This whiteboard is intentionally ephemeral.

- No authentication
- No database
- No persistence

Rooms exist only while users are connected. When the last user leaves, the room and its strokes are destroyed.  
This keeps the system simple, fast, and ideal for short-lived collaboration.

---

## Architecture Overview

### Client
- HTML, CSS, Vanilla JavaScript
- HTML Canvas for drawing
- Stroke-based rendering
- Cursor presence rendered locally

### Server
- Node.js + Express
- Socket.IO for real-time communication
- In-memory room state

Room structure:

rooms[roomId] = {
  strokes: [],
  clients: Set()
}

### Communication Model

- Clients emit drawing and cursor events
- Server acts as the source of truth per room
- Events are scoped to Socket.IO rooms
- Late joiners receive full stroke history

---

## Tech Stack

- Backend: Node.js, Express, Socket.IO
- Frontend: HTML, CSS, JavaScript
- Deployment: Render
- Version Control: Git, GitHub

---

## Project Structure
```
writeUp/
├── index.js
├── package.json
├── package-lock.json
├── public/
│   ├── index.html
│   ├── canvas.js
│   ├── style.css
│   └── assets/
```
---

## Run Locally

git clone https://github.com/InvincibleASH/realtime-collaborative-whiteboard.git
cd realtime-collaborative-whiteboard
npm install
npm run dev

Open in browser:

http://localhost:5001

---

## Use Cases

- Brainstorming
- Teaching and tutoring
- Diagrams and sketches
- Pair problem-solving
- Casual collaborative drawing

---

## Notes

- No database is used by design
- No authentication is used by design
- Focus is on real-time systems and event-driven architecture

---

## License

MIT
