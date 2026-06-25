import express from "express";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use /tmp for SQLite in serverless environments if needed, 
// but for now we'll stick to the local file for dev compatibility.
const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/studenthub.db' : 'studenthub.db';
const db = new Database(dbPath);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    type TEXT,
    subject TEXT,
    topic TEXT,
    content TEXT,
    author TEXT,
    url TEXT
  );

  CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    subject TEXT,
    question TEXT,
    answer TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS planner (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    date TEXT,
    completed INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER,
    resource_id INTEGER,
    PRIMARY KEY(user_id, resource_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(resource_id) REFERENCES resources(id)
  );
`);

// Seed initial data
const resourceCount = db.prepare("SELECT COUNT(*) as count FROM resources").get() as { count: number };
if (resourceCount.count === 0) {
  const insertResource = db.prepare("INSERT INTO resources (title, type, subject, topic, content, author) VALUES (?, ?, ?, ?, ?, ?)");
  
  // Core Areas & Compulsory Subjects
  insertResource.run("Heritage Studies Grade 7", "book", "Heritage Studies", "National Values", "Exploring Zimbabwean history and Ubuntu principles.", "Ministry of Education");
  insertResource.run("Mathematics Form 1", "book", "Mathematics", "Algebra", "Foundational algebra for secondary students.", "ZIMSEC");
  insertResource.run("Combined Science Notes", "note", "Combined Science", "Biology", "Summary of biological systems for O-Level.", "StudyHub");
  insertResource.run("English Language Guide", "book", "English", "Composition", "Improving creative writing and grammar.", "Oxford Press");
  insertResource.run("Shona Literature", "book", "Indigenous Languages", "Poetry", "Analysis of modern Shona poetry.", "ZPH");

  // STEM Pathway
  insertResource.run("Software Engineering Basics", "note", "Software Engineering", "SDLC", "Introduction to the Software Development Life Cycle.", "Dev Academy");
  insertResource.run("Computer Science: Python", "book", "Computer Science", "Programming", "Learning Python for A-Level Computer Science.", "TechBooks");
  insertResource.run("Physics: Mechanics", "note", "Physics", "Forces", "Notes on Newton's laws and motion.", "Science Pro");
  insertResource.run("Biology: Genetics", "book", "Biology", "DNA", "Comprehensive guide to genetic engineering.", "BioWorld");

  // Humanities & Commercials
  insertResource.run("Geography of Zimbabwe", "book", "Geography", "Physical Geography", "Study of Zimbabwe's landforms and climate.", "GeoPress");
  insertResource.run("Economics: Macroeconomics", "note", "Economics", "GDP", "Understanding national income and growth.", "Finance Hub");
  insertResource.run("Business Enterprise", "book", "Business Enterprise", "Entrepreneurship", "Starting and managing a business in Zimbabwe.", "SME Connect");
  insertResource.run("Principles of Accounts", "note", "Principles of Accounts", "Ledgers", "Basic accounting principles and bookkeeping.", "Accountant Pro");

  // Technical & Vocational
  insertResource.run("Agriculture: Crop Science", "book", "Agriculture", "Maize Production", "Best practices for maize farming in Zimbabwe.", "AgriZim");
  insertResource.run("Wood Technology Projects", "note", "Wood Technology", "Joinery", "Guide to basic woodworking joints.", "Craftsman");
  insertResource.run("Food Technology", "book", "Food Technology", "Nutrition", "Study of food processing and preservation.", "Home Science");

  // Arts & Physical Education
  insertResource.run("Visual Arts: Shona Sculpture", "book", "Visual Arts", "Sculpture", "History and techniques of stone carving.", "Art Gallery");
  insertResource.run("Theatre Arts: Performance", "note", "Theatre Arts", "Acting", "Techniques for stage performance and drama.", "Drama Club");
  insertResource.run("Physical Education: Athletics", "note", "Physical Education", "Track & Field", "Training guide for competitive athletics.", "Sports Academy");
}

const app = express();
app.use(express.json());

// API Routes
app.get("/api/resources", (req, res) => {
  const { q, type, subject } = req.query;
  let query = "SELECT * FROM resources WHERE 1=1";
  const params = [];

  if (q) {
    query += " AND (title LIKE ? OR topic LIKE ? OR subject LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) {
    query += " AND type = ?";
    params.push(type);
  }
  if (subject) {
    query += " AND subject = ?";
    params.push(subject);
  }

  const resources = db.prepare(query).all(...params);
  res.json(resources);
});

app.get("/api/subjects", (req, res) => {
  const subjects = db.prepare("SELECT DISTINCT subject FROM resources").all();
  res.json(subjects.map((s: any) => s.subject));
});

app.get("/api/flashcards/:userId", (req, res) => {
  const cards = db.prepare("SELECT * FROM flashcards WHERE user_id = ?").all(req.params.userId);
  res.json(cards);
});

app.post("/api/flashcards", (req, res) => {
  const { userId, subject, question, answer } = req.body;
  const info = db.prepare("INSERT INTO flashcards (user_id, subject, question, answer) VALUES (?, ?, ?, ?)").run(userId, subject, question, answer);
  res.json({ id: info.lastInsertRowid });
});

app.get("/api/planner/:userId", (req, res) => {
  const tasks = db.prepare("SELECT * FROM planner WHERE user_id = ? ORDER BY date ASC").all(req.params.userId);
  res.json(tasks);
});

app.post("/api/planner", (req, res) => {
  const { userId, title, date } = req.body;
  const info = db.prepare("INSERT INTO planner (user_id, title, date) VALUES (?, ?, ?)").run(userId, title, date);
  res.json({ id: info.lastInsertRowid });
});

app.patch("/api/planner/:id", (req, res) => {
  const { completed } = req.body;
  db.prepare("UPDATE planner SET completed = ? WHERE id = ?").run(completed ? 1 : 0, req.params.id);
  res.json({ success: true });
});

app.post("/api/login", (req, res) => {
  const { email } = req.body;
  let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (!user) {
    const info = db.prepare("INSERT INTO users (email, username) VALUES (?, ?)").run(email, email.split('@')[0]);
    user = { id: info.lastInsertRowid, email, username: email.split('@')[0] };
  }
  res.json(user);
});

let aiInstance: GoogleGenAI | null = null;
function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    aiInstance = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

// Low-level helper to call OpenAI using standard fetch API
async function callOpenAI(messages: any[], systemInstruction?: string, responseFormatJson?: boolean) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const openaiMessages: any[] = [];
  if (systemInstruction) {
    openaiMessages.push({ role: "system", content: systemInstruction });
  }
  openaiMessages.push(...messages);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      response_format: responseFormatJson ? { type: "json_object" } : undefined,
      temperature: 0.7,
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// Low-level helper to call Gemini using GoogleGenAI
async function callGemini(messages: any[], systemInstruction?: string, jsonSchema?: any) {
  const ai = getAI();
  const geminiMessages = messages.map(m => ({
    role: m.role === "assistant" || m.role === "system" ? "model" : "user",
    parts: [{ text: m.content || m.text }]
  }));

  const config: any = {};
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }
  if (jsonSchema) {
    config.responseMimeType = "application/json";
    config.responseSchema = jsonSchema;
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: geminiMessages,
    config
  });

  return response.text;
}

// Unified high-level helper with fallback capabilities
async function generateAIResponse({
  messages,
  systemInstruction,
  jsonSchema,
  useJsonForOpenAI = false,
  openAiPromptEnhancement = ""
}: {
  messages: any[];
  systemInstruction?: string;
  jsonSchema?: any;
  useJsonForOpenAI?: boolean;
  openAiPromptEnhancement?: string;
}) {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  if (!hasOpenAI && !hasGemini) {
    throw new Error("Neither OPENAI_API_KEY nor GEMINI_API_KEY is configured.");
  }

  // Define ordered list of models to try.
  // Since the user requested using OPENAI_API_KEY to solve the high demand/unavailability (503) error with Gemini,
  // we will try OpenAI first if it is available, and fall back to Gemini.
  const attempts = [];
  if (hasOpenAI) {
    attempts.push({
      name: "OpenAI",
      fn: async () => {
        const openaiMessages = messages.map(m => ({
          role: m.role === "assistant" || m.role === "model" ? "assistant" : m.role === "system" ? "system" : "user",
          content: m.content || m.text
        }));
        if (openAiPromptEnhancement) {
          const lastMsg = openaiMessages[openaiMessages.length - 1];
          if (lastMsg && lastMsg.role === "user") {
            lastMsg.content += "\n\n" + openAiPromptEnhancement;
          }
        }
        return await callOpenAI(openaiMessages, systemInstruction, useJsonForOpenAI);
      }
    });
  }

  attempts.push({
    name: "Gemini",
    fn: async () => {
      return await callGemini(messages, systemInstruction, jsonSchema);
    }
  });

  let lastError: any = null;
  for (const attempt of attempts) {
    try {
      console.log(`[AI] Attempting generation with ${attempt.name}...`);
      const result = await attempt.fn();
      if (result) {
        console.log(`[AI] Success with ${attempt.name}!`);
        return result;
      }
    } catch (err: any) {
      console.error(`[AI] ${attempt.name} generation failed:`, err.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("AI generation failed with all available models.");
}

function buildDocsContext(docs?: { name: string; content: string }[]) {
  if (!docs || docs.length === 0) return "";
  return "\n\n=== SUPPORTING DOCUMENTS (HELD LOCALLY BY USER) ===\n" + 
    docs.map(doc => `[Document: ${doc.name}]\n${doc.content}`).join("\n\n") + 
    "\n==================================================\n";
}

app.post("/api/chatbot", async (req, res) => {
  const { messages, supportingDocuments } = req.body;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  try {
    const systemInstruction = "You are 'StudenthubAI', the friendly AI Study Tutor for StudentHub, aligned with the Zimbabwe Heritage-Based Curriculum (2024-2030). Your goal is to make learning easy, engaging, and extremely accessible for students. Since students can sometimes find long texts overwhelming, you must: 1. Explain complex academic concepts in simple, digestible, and friendly language. 2. Use bullet points, bold text, and brief summaries to break up information. 3. Be friendly and encourage the Ubuntu principle ('Hunhu/Unhu') and cultural pride. 4. Offer to quiz them, build fun study rhymes/songs, or explain processes using analogies matching local Zimbabwean contexts (e.g. comparing database indexing to sorting bags of grain or comparing CPU cache to quick-access tools at a domestic forge). Focus on being extremely clear so they don't have to read massive textbooks! Keep your answers relatively concise, highly engaging, and formatted beautifully in Markdown.";

    const docContext = buildDocsContext(supportingDocuments);
    const enhancedMessages = messages.map((m, idx) => {
      const isLastUserMsg = m.role !== "assistant" && idx === messages.length - 1;
      if (isLastUserMsg && docContext) {
        return {
          role: m.role === "assistant" ? "assistant" : "user",
          content: (m.text || m.content) + docContext
        };
      }
      return {
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text || m.content
      };
    });

    const text = await generateAIResponse({
      messages: enhancedMessages,
      systemInstruction
    });

    res.json({ text });
  } catch (error: any) {
    console.error("Chatbot error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI response" });
  }
});

app.post("/api/generate-notes", async (req, res) => {
  const { topic, supportingDocuments } = req.body;
  if (!topic) {
    return res.status(400).json({ error: "Topic is required" });
  }

  try {
    const systemInstruction = "You are an expert curriculum planner and study assistant, highly knowledgeable about the Zimbabwe Heritage-Based Curriculum.";
    const docContext = buildDocsContext(supportingDocuments);
    const notesText = await generateAIResponse({
      messages: [
        {
          role: "user",
          content: `Generate comprehensive study notes for the topic: ${topic}. Include key concepts, definitions, and a summary. Format as Markdown.${docContext}`
        }
      ],
      systemInstruction
    });

    res.json({ text: notesText });
  } catch (error: any) {
    console.error("Generate notes error:", error);
    res.status(500).json({ error: error.message || "Failed to generate study notes" });
  }
});

app.post("/api/generate-flashcards", async (req, res) => {
  const { topic, count = 5 } = req.body;
  if (!topic) {
    return res.status(400).json({ error: "Topic is required" });
  }

  try {
    const rawResult = await generateAIResponse({
      messages: [
        {
          role: "user",
          content: `Generate ${count} flashcards for the topic: ${topic}. Each flashcard should have a question and an answer.`
        }
      ],
      jsonSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            answer: { type: Type.STRING },
          },
          required: ["question", "answer"],
        },
      },
      useJsonForOpenAI: true,
      openAiPromptEnhancement: `Return a JSON object with a single key "flashcards", containing an array of ${count} objects. Each object must have "question" and "answer" properties. Example: { "flashcards": [ { "question": "What is 1+1?", "answer": "2" } ] }`
    });

    let parsed: any;
    try {
      parsed = JSON.parse(rawResult);
    } catch (e) {
      const cleaned = rawResult.replace(/```json/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    let flashcardsArray: any[] = [];
    if (Array.isArray(parsed)) {
      flashcardsArray = parsed;
    } else if (parsed && Array.isArray(parsed.flashcards)) {
      flashcardsArray = parsed.flashcards;
    } else if (parsed && typeof parsed === "object") {
      const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (arrayKey) {
        flashcardsArray = parsed[arrayKey];
      }
    }

    res.json(flashcardsArray);
  } catch (error: any) {
    console.error("Generate flashcards error:", error);
    res.status(500).json({ error: error.message || "Failed to generate flashcards" });
  }
});

export default app;
