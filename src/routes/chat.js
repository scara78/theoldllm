import { Router } from "express";
import { chatCompletions, listModels } from "../controllers/chatController.js";

const router = Router();

router.post("/v1/chat/completions", chatCompletions);
router.get("/v1/models", listModels);

export default router;
