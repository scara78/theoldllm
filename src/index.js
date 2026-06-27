import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chatRoutes from "./routes/chat.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5678;
const HOST = "0.0.0.0";

// Middleware
app.use(cors());

app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(`Response status: ${res.statusCode}`);
  });
  next();
});

app.use(express.json({ limit: "10mb" }));

// Routes
app.use(chatRoutes);

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", endpoints: ["/v1/chat/completions"] });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});