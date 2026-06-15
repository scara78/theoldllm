import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chatRoutes from "./routes/chat.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5678;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use(chatRoutes);

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", endpoints: ["/v1/chat/completions"] });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
