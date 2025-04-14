const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const Server = require("./src/server/Server");

const app = express();

app.use(express.static(path.join(__dirname, "client")));

app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, "client", "index.html"));
});
  
app.use((req, res) => {
  res.status(404).send("404 Not Found");
});

let httpServer = http.createServer(app);

const wss = new WebSocketServer({ server: httpServer });

const server = new Server(wss);

const port = parseInt(process.env.WS_PORT) || 8080;
httpServer.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});

httpServer.on("error", (error) => {
  console.error(`Server error:`, error);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM. Shutting down...");
  await server.destroy();
  httpServer.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

require("./src/config/env");

