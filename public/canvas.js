const TEXT_TOOL = "text";
const TEXT_FONT_SIZE = 24;
const TEXT_FONT_FAMILY = "Arial, sans-serif";
const TEXT_LINE_HEIGHT = 1.35;
const TEXT_BOX_MIN_WIDTH = 220;
const TEXT_BOX_MIN_HEIGHT = 56;
const TEXT_PADDING_X = 10;
const TEXT_PADDING_Y = 8;

const clientId = crypto.randomUUID();
const clientColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
const remoteCursors = new Map();
const roomId = getRoomId();
const socket = io();

let strokes = [];
let currentColor = "#000000";
let currentTool = "pen";
let prevStrokes = [];
let lastCursorEmit = 0;
let currentStroke = null;
let redoStack = [];
let activeTextDraft = null;

const roomInput = document.getElementById("roomInput");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const canvas = document.getElementById("writecanvas");
const canvasStage = canvas.parentElement;
const textEditor = document.getElementById("textEditor");
const ctx = canvas.getContext("2d");

const colorButtons = {
  black: document.getElementById("black"),
  blue: document.getElementById("blue"),
  red: document.getElementById("red"),
  green: document.getElementById("green"),
  pink: document.getElementById("pink"),
};

const toolButtons = {
  pen: document.getElementById("pencil"),
  eraser: document.getElementById("eraser"),
  text: document.getElementById("textTool"),
};

const clearBtn = document.getElementById("clear");
const restoreBtn = document.getElementById("restore");
const undoBtn = document.getElementById("undo");
const redoBtn = document.getElementById("redo");
const exportBtn = document.getElementById("export");

joinRoomBtn.addEventListener("click", () => {
  const value = roomInput.value.trim();
  if (!value) return;

  window.location.href = `/?room=${encodeURIComponent(value)}`;
});

console.log("Client identity:", clientId, clientColor);

function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  let nextRoomId = params.get("room");

  if (!nextRoomId) {
    nextRoomId = crypto.randomUUID();
    params.set("room", nextRoomId);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  return nextRoomId;
}

function cloneStroke(stroke) {
  if (stroke.tool === TEXT_TOOL) {
    return { ...stroke };
  }

  return {
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function isTextEditorOpen() {
  return !textEditor.hasAttribute("hidden");
}

function closeTextEditor() {
  textEditor.setAttribute("hidden", "");
  textEditor.value = "";
  textEditor.style.width = "";
  textEditor.style.height = "";
  activeTextDraft = null;
  updateCanvasCursor();
}

function syncTextEditorHeight() {
  textEditor.style.height = "auto";
  textEditor.style.height = `${Math.max(TEXT_BOX_MIN_HEIGHT, textEditor.scrollHeight)}px`;
}

function commitTextStroke() {
  if (!isTextEditorOpen() || !activeTextDraft) return;

  const text = textEditor.value.trim();
  const draft = {
    ...activeTextDraft,
    text,
    width: Math.max(TEXT_BOX_MIN_WIDTH, Math.round(textEditor.offsetWidth)),
  };

  closeTextEditor();

  if (!text) {
    redraw();
    return;
  }

  strokes.push(draft);
  socket.emit("DRAW_STROKE", draft);
  redoStack = [];
  redraw();
}

function cancelTextStroke() {
  if (!isTextEditorOpen()) return;

  closeTextEditor();
  redraw();
}

function openTextEditor(x, y) {
  if (isTextEditorOpen()) {
    commitTextStroke();
  }

  const clampedX = Math.min(x, Math.max(0, canvas.width - TEXT_BOX_MIN_WIDTH - 12));
  const clampedY = Math.min(y, Math.max(0, canvas.height - TEXT_BOX_MIN_HEIGHT - 12));

  activeTextDraft = {
    id: crypto.randomUUID(),
    tool: TEXT_TOOL,
    color: currentColor,
    x: clampedX,
    y: clampedY,
    fontSize: TEXT_FONT_SIZE,
    fontFamily: TEXT_FONT_FAMILY,
    lineHeight: TEXT_LINE_HEIGHT,
  };

  textEditor.style.left = `${clampedX}px`;
  textEditor.style.top = `${clampedY}px`;
  textEditor.style.width = `${TEXT_BOX_MIN_WIDTH}px`;
  textEditor.style.color = currentColor;
  textEditor.removeAttribute("hidden");
  syncTextEditorHeight();
  textEditor.focus();
  updateCanvasCursor();
}

function updateCanvasCursor() {
  if (isTextEditorOpen() || currentTool === TEXT_TOOL) {
    canvas.style.cursor = "text";
    return;
  }

  canvas.style.cursor = currentTool === "eraser" ? "cell" : "crosshair";
}

function updateToolState() {
  Object.entries(toolButtons).forEach(([tool, button]) => {
    button.classList.toggle("is-active", tool === currentTool);
  });
}

function updateColorState() {
  const colorMap = {
    black: "#000000",
    blue: "#0000ff",
    red: "#ff0000",
    green: "#00ff00",
    pink: "#f119adff",
  };

  Object.entries(colorButtons).forEach(([key, button]) => {
    button.classList.toggle("is-active", colorMap[key] === currentColor);
  });

  if (activeTextDraft) {
    activeTextDraft.color = currentColor;
    textEditor.style.color = currentColor;
  }
}

function setCurrentTool(tool) {
  currentTool = tool;
  if (tool !== TEXT_TOOL) {
    commitTextStroke();
  }

  updateToolState();
  updateCanvasCursor();
}

function resizeCanvas() {
  canvas.width = canvasStage.clientWidth;
  canvas.height = canvasStage.clientHeight;
  redraw();
}

function getTextLines(renderCtx, stroke) {
  const maxWidth = Math.max(1, stroke.width - TEXT_PADDING_X * 2);
  const paragraphs = stroke.text.split("\n");
  const lines = [];

  paragraphs.forEach((paragraph) => {
    if (paragraph === "") {
      lines.push("");
      return;
    }

    let currentLine = "";

    for (const char of paragraph) {
      const nextLine = currentLine + char;
      if (currentLine && renderCtx.measureText(nextLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = char === " " ? "" : char;
      } else {
        currentLine = nextLine;
      }
    }

    lines.push(currentLine);
  });

  return lines;
}

function drawPathStroke(renderCtx, stroke) {
  renderCtx.save();
  renderCtx.lineCap = "round";
  renderCtx.lineJoin = "round";
  renderCtx.lineWidth = stroke.width;

  if (stroke.tool === "eraser") {
    renderCtx.globalCompositeOperation = "destination-out";
  } else {
    renderCtx.globalCompositeOperation = "source-over";
    renderCtx.strokeStyle = stroke.color;
    renderCtx.fillStyle = stroke.color;
  }

  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    renderCtx.beginPath();
    renderCtx.arc(point.x, point.y, stroke.width / 2, 0, Math.PI * 2);
    renderCtx.fill();
    renderCtx.restore();
    return;
  }

  renderCtx.beginPath();
  stroke.points.forEach((point, index) => {
    if (index === 0) {
      renderCtx.moveTo(point.x, point.y);
    } else {
      renderCtx.lineTo(point.x, point.y);
    }
  });
  renderCtx.stroke();
  renderCtx.restore();
}

function drawTextStroke(renderCtx, stroke) {
  renderCtx.save();
  renderCtx.globalCompositeOperation = "source-over";
  renderCtx.fillStyle = stroke.color;
  renderCtx.textBaseline = "top";
  renderCtx.font = `${stroke.fontSize || TEXT_FONT_SIZE}px ${stroke.fontFamily || TEXT_FONT_FAMILY}`;

  const lineHeight = (stroke.fontSize || TEXT_FONT_SIZE) * (stroke.lineHeight || TEXT_LINE_HEIGHT);
  const lines = getTextLines(renderCtx, stroke);

  lines.forEach((line, index) => {
    renderCtx.fillText(
      line,
      stroke.x + TEXT_PADDING_X,
      stroke.y + TEXT_PADDING_Y + index * lineHeight,
    );
  });

  renderCtx.restore();
}

function drawStroke(renderCtx, stroke) {
  if (stroke.tool === TEXT_TOOL) {
    drawTextStroke(renderCtx, stroke);
    return;
  }

  drawPathStroke(renderCtx, stroke);
}

function drawRemoteCursors(renderCtx) {
  remoteCursors.forEach(({ x, y, color }) => {
    renderCtx.beginPath();
    renderCtx.arc(x, y, 4, 0, Math.PI * 2);
    renderCtx.fillStyle = color;
    renderCtx.fill();
  });
}

function drawBoard(
  renderCtx,
  { includeCurrentStroke = true, includeRemote = true, clear = true } = {},
) {
  if (clear) {
    renderCtx.clearRect(0, 0, renderCtx.canvas.width, renderCtx.canvas.height);
  }

  strokes.forEach((stroke) => drawStroke(renderCtx, stroke));

  if (includeCurrentStroke && currentStroke) {
    drawStroke(renderCtx, currentStroke);
  }

  renderCtx.globalCompositeOperation = "source-over";

  if (includeRemote) {
    drawRemoteCursors(renderCtx);
  }
}

function redraw() {
  drawBoard(ctx);
}

function clearCanvas() {
  strokes = [];
  currentStroke = null;
  redoStack = [];
  closeTextEditor();
  redraw();
}

//************************************Socket************************************************** */

socket.on("connect", () => {
  console.log("CLIENT joining room:", roomId);
  socket.emit("JOIN_ROOM", { roomId });
});

socket.on("connect_error", (err) => {
  console.error("Socket connection error:", err.message);
});

socket.on("CANVAS_CLEARED", () => {
  clearCanvas();
});

socket.on("INIT_STROKES", (serverStrokes) => {
  strokes = serverStrokes.map(cloneStroke);
  redraw();
});

socket.on("DRAW_STROKE", (stroke) => {
  const index = strokes.findIndex((item) => item.id === stroke.id);
  const nextStroke = cloneStroke(stroke);

  if (index === -1) {
    strokes.push(nextStroke);
  } else {
    strokes[index] = nextStroke;
  }

  redraw();
});

socket.on("STROKE_REMOVED", ({ strokeId }) => {
  const index = strokes.findIndex((stroke) => stroke.id === strokeId);
  if (index === -1) return;

  const [removed] = strokes.splice(index, 1);

  if (removed.ownerId && removed.ownerId === socket.id) {
    redoStack.push(cloneStroke(removed));
  }

  redraw();
});

socket.on("CURSOR_MOVE", ({ clientId: remoteClientId, x, y, color }) => {
  remoteCursors.set(remoteClientId, { x, y, color });
  redraw();
});

socket.on("USER_LEFT", ({ clientId: remoteClientId }) => {
  remoteCursors.delete(remoteClientId);
  redraw();
});

//**********************************Canvas***************************************************** */

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

canvas.addEventListener("mousedown", (event) => {
  event.preventDefault();

  if (currentTool === TEXT_TOOL) {
    openTextEditor(event.offsetX, event.offsetY);
    return;
  }

  if (isTextEditorOpen()) {
    commitTextStroke();
  }

  currentStroke = {
    id: crypto.randomUUID(),
    tool: currentTool,
    color: currentColor,
    width: currentTool === "eraser" ? 30 : 2,
    points: [{ x: event.offsetX, y: event.offsetY }],
  };
});

canvas.addEventListener("mousemove", (event) => {
  if (currentStroke || isTextEditorOpen()) return;

  const now = Date.now();
  if (now - lastCursorEmit < 30) return;
  lastCursorEmit = now;

  socket.emit("CURSOR_MOVE", {
    x: event.offsetX,
    y: event.offsetY,
    clientId,
    color: clientColor,
  });
});

canvas.addEventListener("mousemove", (event) => {
  if (!currentStroke || event.buttons !== 1) return;

  event.preventDefault();
  currentStroke.points.push({
    x: event.offsetX,
    y: event.offsetY,
  });

  redraw();
});

document.addEventListener("mouseup", () => {
  if (!currentStroke) return;

  const stroke = currentStroke;
  strokes.push(cloneStroke(stroke));
  socket.emit("DRAW_STROKE", stroke);
  currentStroke = null;
  redoStack = [];
  redraw();
});

textEditor.addEventListener("input", () => {
  syncTextEditorHeight();
});

textEditor.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    cancelTextStroke();
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    commitTextStroke();
  }
});

textEditor.addEventListener("blur", () => {
  commitTextStroke();
});

//************************************************tool bar options**************************** */

colorButtons.black.addEventListener("click", () => {
  currentColor = "#000000";
  updateColorState();
});

colorButtons.red.addEventListener("click", () => {
  currentColor = "#ff0000";
  updateColorState();
});

colorButtons.blue.addEventListener("click", () => {
  currentColor = "#0000ff";
  updateColorState();
});

colorButtons.green.addEventListener("click", () => {
  currentColor = "#00ff00";
  updateColorState();
});

colorButtons.pink.addEventListener("click", () => {
  currentColor = "#f119adff";
  updateColorState();
});

toolButtons.pen.addEventListener("click", () => {
  setCurrentTool("pen");
});

toolButtons.eraser.addEventListener("click", () => {
  setCurrentTool("eraser");
});

toolButtons.text.addEventListener("click", () => {
  setCurrentTool(TEXT_TOOL);
});

clearBtn.addEventListener("click", () => {
  const proceed = confirm("Do you want to clear the Canvas?");
  if (!proceed) return;

  commitTextStroke();
  prevStrokes = strokes.map(cloneStroke);
  redoStack = [];

  socket.emit("CLEAR_CANVAS");
});

restoreBtn.addEventListener("click", () => {
  if (!prevStrokes || prevStrokes.length === 0) {
    alert("Nothing to restore");
    return;
  }

  const proceed = confirm(
    "Restore will bring back the canvas to what it was before the last clear. Continue?",
  );

  if (!proceed) return;

  strokes = prevStrokes.map(cloneStroke);
  currentStroke = null;
  redoStack = [];
  closeTextEditor();
  redraw();
});

//*****************************************Undo/Redo******************************************* */

undoBtn.addEventListener("click", () => {
  commitTextStroke();
  socket.emit("UNDO_STROKE");
});

redoBtn.addEventListener("click", () => {
  commitTextStroke();

  const stroke = redoStack.pop();
  if (!stroke) return;

  socket.emit("REDO_STROKE", stroke);
});

//**************************************EXPORT************************************************ */

function exportCanvasAsPNG() {
  commitTextStroke();

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;

  const exportCtx = exportCanvas.getContext("2d");
  exportCtx.fillStyle = "#ffffff";
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  drawBoard(exportCtx, { includeCurrentStroke: false, includeRemote: false, clear: false });

  return exportCanvas.toDataURL("image/png");
}

exportBtn.addEventListener("click", () => {
  const dataURL = exportCanvasAsPNG();
  const currentRoomId = new URLSearchParams(window.location.search).get("room");

  const link = document.createElement("a");
  link.href = dataURL;
  link.download = `whiteboard-${currentRoomId}.png`;
  link.click();
});

updateToolState();
updateColorState();
updateCanvasCursor();
