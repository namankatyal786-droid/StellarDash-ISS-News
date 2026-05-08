import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory cache for News
let newsCache: { data: any; timestamp: number } | null = null;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

app.get("/api/news", async (req, res) => {
  const { category = 'space', query = '' } = req.query;
  const apiKey = process.env.GNEWS_API_KEY;

  const mockData = {
    articles: [
      {
        title: "Astronauts Perform Critical Maintenance on ISS Solar Arrays",
        source: { name: "Mission Dispatch" },
        publishedAt: new Date().toISOString(),
        image: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa",
        description: "A team of researchers successfully completed a relocation of external payload modules today.",
        url: "#"
      },
      {
        title: "Deep Space Gateway Reaches New Integration Milestone",
        source: { name: "Astra News" },
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
        image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa",
        description: "Engineers have verified the life support systems for the upcoming lunar outpost.",
        url: "#"
      }
    ]
  };

  if (!apiKey || apiKey === "MY_GNEWS_API_KEY" || apiKey === "") {
    return res.json(mockData);
  }

  if (!query && newsCache && Date.now() - newsCache.timestamp < CACHE_DURATION) {
    return res.json(newsCache.data);
  }

  try {
    const q = query || category || 'space station';
    const response = await fetch(
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(String(q))}&lang=en&max=10&token=${apiKey}`
    );
    
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    
    if (!query) newsCache = { data, timestamp: Date.now() };
    res.json(data);
  } catch (error) {
    console.error("News fetch failed:", error);
    res.json(mockData);
  }
});

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

app.post("/api/chat", async (req, res) => {
  const { messages, context } = req.body;
  const hfToken = process.env.HF_TOKEN;

  // If HF_TOKEN exists, try the requested Hugging Face router
  if (hfToken && hfToken !== "MY_HF_TOKEN" && hfToken !== "") {
    try {
      const response = await fetch(
        "https://router.huggingface.co/v1/chat/completions",
        {
          headers: {
            Authorization: `Bearer ${hfToken}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            model: "meta-llama/Llama-3.2-1B-Instruct:novita",
            messages: [
              {
                role: "system",
                content: `You are Astra, a mission assistant. You ONLY answer based on the provided dashboard context. Do not use outside knowledge.
                
                DASHBOARD DATA:
                ${JSON.stringify(context)}`
              },
              ...messages
            ],
            max_tokens: 500,
          }),
        }
      );
      const result = await response.json();
      return res.json(result);
    } catch (error) {
      console.warn("HF Relay failed, falling back to Gemini...");
    }
  }

  // Robust Fallback using Gemini (which is always available in this environment)
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `You are ASTRA, a high-fidelity mission assistant for the Stellaris Dashboard.
    
    STRICT OPERATIONAL DIRECTIVE:
    1. You ONLY have access to the telemetry and broadcast data provided below.
    2. If a user asks a question that CANNOT be answered using the provided data, you MUST state that the data is not available in the current relay.
    3. Do NOT invent missions, astronauts, or locations.
    4. Maintain a technical, slightly futuristic "mission control" tone.
    5. Always provide specific numbers (latitude, velocity, etc.) if available.
    
    CURRENT MISSION TELEMETRY (JSON):
    ${JSON.stringify(context, null, 2)}
    
    COMMUNICATION HISTORY:
    ${messages.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}
    
    ASTRA RESPONSE:`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    res.json({
      choices: [{ message: { content: responseText } }]
    });
  } catch (error) {
    console.error("AI processing error:", error);
    res.status(500).json({ error: "Mission control communication failure." });
  }
});

app.get("/api/iss", async (req, res) => {
  try {
    const response = await fetch("http://api.open-notify.org/iss-now.json");
    if (!response.ok) throw new Error("ISS feed unavailable");
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.warn("ISS fetch failed, using fallback coordinates");
    res.json({
      timestamp: Math.floor(Date.now() / 1000),
      iss_position: { latitude: "51.5074", longitude: "-0.1278" },
      message: "success"
    });
  }
});

app.get("/api/astros", async (req, res) => {
  try {
    const response = await fetch("http://api.open-notify.org/astros.json");
    if (!response.ok) throw new Error("Astro feed unavailable");
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.warn("Astronauts fetch failed, returning mock crew");
    res.json({
      people: [
        { name: "Oleg Kononenko", craft: "ISS" },
        { name: "Nikolai Chub", craft: "ISS" },
        { name: "Tracy Caldwell Dyson", craft: "ISS" },
        { name: "Matthew Dominick", craft: "ISS" },
        { name: "Michael Barratt", craft: "ISS" }
      ],
      number: 5,
      message: "success"
    });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

export default app;

if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
