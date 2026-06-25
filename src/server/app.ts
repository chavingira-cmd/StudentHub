import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import multer from "multer";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic/robust database initialization helper
let dbInstance: any = null;
let isInMemoryFallback = false;

// Global state for in-memory fallback
const inMemoryTables: Record<string, any[]> = {
  users: [],
  resources: [],
  flashcards: [],
  planner: [],
  favorites: []
};
let lastInsertId = 1000;

function createInMemoryFallback() {
  return {
    exec(sql: string) {
      // Schema initialized dynamically in memory
    },
    prepare(sql: string) {
      const sqlLower = sql.toLowerCase().trim().replace(/\s+/g, ' ');

      return {
        get(...params: any[]) {
          // SELECT COUNT(*) as count FROM resources
          if (sqlLower.includes("select count(*)")) {
            return { count: inMemoryTables.resources.length };
          }
          // SELECT * FROM users WHERE email = ?
          if (sqlLower.includes("select * from users where email =")) {
            const email = params[0]?.toLowerCase().trim();
            return inMemoryTables.users.find(u => u.email.toLowerCase().trim() === email) || null;
          }
          // SELECT * FROM users WHERE username = ?
          if (sqlLower.includes("select * from users where username =")) {
            const username = params[0]?.toLowerCase().trim();
            return inMemoryTables.users.find(u => u.username.toLowerCase().trim() === username) || null;
          }
          return null;
        },
        all(...params: any[]) {
          // SELECT DISTINCT subject FROM resources
          if (sqlLower.includes("select distinct subject from resources")) {
            const subjects = [...new Set(inMemoryTables.resources.map(r => r.subject))];
            return subjects.map(s => ({ subject: s }));
          }
          // SELECT * FROM resources
          if (sqlLower.includes("from resources")) {
            return inMemoryTables.resources;
          }
          // SELECT * FROM flashcards WHERE user_id = ?
          if (sqlLower.includes("from flashcards where user_id =")) {
            const userId = Number(params[0]);
            return inMemoryTables.flashcards.filter(c => Number(c.user_id) === userId);
          }
          // SELECT * FROM planner WHERE user_id = ?
          if (sqlLower.includes("from planner where user_id =")) {
            const userId = Number(params[0]);
            return inMemoryTables.planner.filter(t => Number(t.user_id) === userId);
          }
          return [];
        },
        run(...params: any[]) {
          lastInsertId++;

          // INSERT INTO resources
          if (sqlLower.includes("insert into resources")) {
            const [title, type, subject, topic, content, author] = params;
            inMemoryTables.resources.push({ id: lastInsertId, title, type, subject, topic, content, author });
          }
          // INSERT INTO flashcards
          else if (sqlLower.includes("insert into flashcards")) {
            const [userId, subject, question, answer] = params;
            inMemoryTables.flashcards.push({ id: lastInsertId, user_id: userId, subject, question, answer });
          }
          // INSERT INTO planner
          else if (sqlLower.includes("insert into planner")) {
            const [userId, title, date] = params;
            inMemoryTables.planner.push({ id: lastInsertId, user_id: userId, title, date, completed: 0 });
          }
          // INSERT INTO users
          else if (sqlLower.includes("insert into users")) {
            const [email, username] = params;
            inMemoryTables.users.push({ id: lastInsertId, email, username });
          }
          // UPDATE planner SET completed = ? WHERE id = ?
          else if (sqlLower.includes("update planner set completed")) {
            const [completed, id] = params;
            const task = inMemoryTables.planner.find(t => t.id === Number(id));
            if (task) {
              task.completed = completed ? 1 : 0;
            }
          }

          return { lastInsertRowid: lastInsertId };
        }
      };
    }
  };
}

async function getDB() {
  if (dbInstance) return dbInstance;

  const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/studenthub.db' : 'studenthub.db';

  const schemaSql = `
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
  `;

  try {
    const Database = require("better-sqlite3");
    dbInstance = new Database(dbPath);
    console.log(`Connected to SQLite database at ${dbPath}`);
    dbInstance.exec(schemaSql);
    
    // Quick verification check to catch schema mismatch/corruption early
    dbInstance.prepare("SELECT * FROM users LIMIT 1").get();
    dbInstance.prepare("SELECT * FROM resources LIMIT 1").get();
    dbInstance.prepare("SELECT * FROM flashcards LIMIT 1").get();
    dbInstance.prepare("SELECT * FROM planner LIMIT 1").get();
  } catch (e: any) {
    console.warn("Database initialization failed or schema was mismatched, trying self-healing recreation:", e);
    
    try {
      if (dbInstance && typeof dbInstance.close === "function") {
        dbInstance.close();
      }
    } catch (_) {}
    dbInstance = null;

    try {
      const fs = require("fs");
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log("Successfully unlinked corrupted/mismatched SQLite file.");
      }
    } catch (fsErr) {
      console.error("Failed to delete corrupted SQLite file:", fsErr);
    }

    try {
      const Database = require("better-sqlite3");
      dbInstance = new Database(dbPath);
      dbInstance.exec(schemaSql);
      console.log("Successfully recreated fresh database.");
    } catch (retryErr) {
      console.error("Database recreation failed. Falling back to robust in-memory database system:", retryErr);
      isInMemoryFallback = true;
      dbInstance = createInMemoryFallback();
    }
  }

  // Seed initial data if database has no resources
  const getResourceCount = () => {
    try {
      const resourceCount = dbInstance.prepare("SELECT COUNT(*) as count FROM resources").get() as { count: number };
      return resourceCount ? resourceCount.count : 0;
    } catch (err) {
      return 0;
    }
  };

  if (getResourceCount() === 0) {
    const insertResource = dbInstance.prepare("INSERT INTO resources (title, type, subject, topic, content, author) VALUES (?, ?, ?, ?, ?, ?)");
    
    const seedData = [
      // Core Areas & Compulsory Subjects
      ["Heritage Studies Grade 7", "book", "Heritage Studies", "National Values", "Exploring Zimbabwean history and Ubuntu principles.", "Ministry of Education"],
      ["Mathematics Form 1", "book", "Mathematics", "Algebra", "Foundational algebra for secondary students.", "ZIMSEC"],
      ["Combined Science Notes", "note", "Combined Science", "Biology", "Summary of biological systems for O-Level.", "StudyHub"],
      ["English Language Guide", "book", "English", "Composition", "Improving creative writing and grammar.", "Oxford Press"],
      ["Shona Literature", "book", "Indigenous Languages", "Poetry", "Analysis of modern Shona poetry.", "ZPH"],

      // STEM Pathway
      ["Software Engineering Basics", "note", "Software Engineering", "SDLC", "Introduction to the Software Development Life Cycle.", "Dev Academy"],
      ["Computer Science: Python", "book", "Computer Science", "Programming", "Learning Python for A-Level Computer Science.", "TechBooks"],
      ["Physics: Mechanics", "note", "Physics", "Forces", "Notes on Newton's laws and motion.", "Science Pro"],
      ["Biology: Genetics", "book", "Biology", "DNA", "Comprehensive guide to genetic engineering.", "BioWorld"],

      // Humanities & Commercials
      ["Geography of Zimbabwe", "book", "Geography", "Physical Geography", "Study of Zimbabwe's landforms and climate.", "GeoPress"],
      ["Economics: Macroeconomics", "note", "Economics", "GDP", "Understanding national income and growth.", "Finance Hub"],
      ["Business Enterprise", "book", "Business Enterprise", "Entrepreneurship", "Starting and managing a business in Zimbabwe.", "SME Connect"],
      ["Principles of Accounts", "note", "Principles of Accounts", "Ledgers", "Basic accounting principles and bookkeeping.", "Accountant Pro"],

      // Technical & Vocational
      ["Agriculture: Crop Science", "book", "Agriculture", "Maize Production", "Best practices for maize farming in Zimbabwe.", "AgriZim"],
      ["Wood Technology Projects", "note", "Wood Technology", "Joinery", "Guide to basic woodworking joints.", "Craftsman"],
      ["Food Technology", "book", "Food Technology", "Nutrition", "Study of food processing and preservation.", "Home Science"],

      // Arts & Physical Education
      ["Visual Arts: Shona Sculpture", "book", "Visual Arts", "Sculpture", "History and techniques of stone carving.", "Art Gallery"],
      ["Theatre Arts: Performance", "note", "Theatre Arts", "Acting", "Techniques for stage performance and drama.", "Drama Club"],
      ["Physical Education: Athletics", "note", "Physical Education", "Track & Field", "Training guide for competitive athletics.", "Sports Academy"]
    ];

    for (const row of seedData) {
      insertResource.run(...row);
    }
  }

  return dbInstance;
}

const app = express();
app.use(express.json());

// API Routes
app.get("/api/resources", async (req, res) => {
  try {
    const db = await getDB();
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/subjects", async (req, res) => {
  try {
    const db = await getDB();
    const subjects = db.prepare("SELECT DISTINCT subject FROM resources").all();
    res.json(subjects.map((s: any) => s.subject));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/flashcards/:userId", async (req, res) => {
  try {
    const db = await getDB();
    const cards = db.prepare("SELECT * FROM flashcards WHERE user_id = ?").all(req.params.userId);
    res.json(cards);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/flashcards", async (req, res) => {
  try {
    const db = await getDB();
    const { userId, subject, question, answer } = req.body;
    const info = db.prepare("INSERT INTO flashcards (user_id, subject, question, answer) VALUES (?, ?, ?, ?)").run(userId, subject, question, answer);
    res.json({ id: info.lastInsertRowid });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/planner/:userId", async (req, res) => {
  try {
    const db = await getDB();
    const tasks = db.prepare("SELECT * FROM planner WHERE user_id = ? ORDER BY date ASC").all(req.params.userId);
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/planner", async (req, res) => {
  try {
    const db = await getDB();
    const { userId, title, date } = req.body;
    const info = db.prepare("INSERT INTO planner (user_id, title, date) VALUES (?, ?, ?)").run(userId, title, date);
    res.json({ id: info.lastInsertRowid });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/planner/:id", async (req, res) => {
  try {
    const db = await getDB();
    const { completed } = req.body;
    db.prepare("UPDATE planner SET completed = ? WHERE id = ?").run(completed ? 1 : 0, req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    const db = await getDB();
    const trimmedEmail = email.trim();
    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(trimmedEmail) as any;
    
    if (!user) {
      let username = trimmedEmail.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "");
      if (!username) {
        username = "student";
      }

      // Ensure username is unique to satisfy UNIQUE constraint
      let existing = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
      let count = 1;
      const originalUsername = username;
      while (existing) {
        username = `${originalUsername}${count}`;
        existing = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
        count++;
      }

      const info = db.prepare("INSERT INTO users (email, username) VALUES (?, ?)").run(trimmedEmail, username);
      user = { id: info.lastInsertRowid, email: trimmedEmail, username };
    }
    res.json(user);
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message || "Failed to log in." });
  }
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

let openaiInstance: OpenAI | null = null;
function getOpenAIClient() {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      openaiInstance = new OpenAI({ apiKey });
    }
  }
  return openaiInstance;
}

app.post("/api/chatbot", async (req, res) => {
  const { messages, documentContext } = req.body;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  try {
    let systemInstruction = "You are 'StudenthubAI', the friendly AI Study Tutor for StudentHub, aligned with the Zimbabwe Heritage-Based Curriculum (2024-2030). Your goal is to make learning easy, engaging, and extremely accessible for students. Since students can sometimes find long texts overwhelming, you must: 1. Explain complex academic concepts in simple, digestible, and friendly language. 2. Use bullet points, bold text, and brief summaries to break up information. 3. Be friendly and encourage the Ubuntu principle ('Hunhu/Unhu') and cultural pride. 4. Offer to quiz them, build fun study rhymes/songs, or explain processes using analogies matching local Zimbabwean contexts (e.g. comparing database indexing to sorting bags of grain or comparing CPU cache to quick-access tools at a domestic forge). Focus on being extremely clear so they don't have to read massive textbooks! Keep your answers relatively concise, highly engaging, and formatted beautifully in Markdown.";

    if (documentContext) {
      systemInstruction += `\n\n[ATTACHED DOCUMENT CONTEXT]\nThe student has attached a syllabus or study document. Use the following content extracted from this document as your primary reference and context source to answer, search, or summarize according to their prompts:\n${documentContext}\n[END OF ATTACHED DOCUMENT CONTEXT]`;
    }

    const openai = getOpenAIClient();
    if (openai) {
      try {
        const chatMessages = [
          { role: "system" as const, content: systemInstruction },
          ...messages.map(m => ({
            role: m.role === "model" || m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: m.text || m.content
          }))
        ];
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: chatMessages,
        });
        const replyText = response.choices[0]?.message?.content;
        if (replyText) {
          return res.json({ text: replyText });
        }
      } catch (err) {
        console.error("OpenAI chatbot request failed, falling back to Gemini:", err);
      }
    }

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: messages.map(m => ({
        role: m.role === "assistant" ? "model" : m.role,
        parts: [{ text: m.text || m.content }]
      })),
      config: {
        systemInstruction
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Chatbot error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI response" });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // limit to 10MB
  },
});

app.post("/api/parse-file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const fileBuffer = req.file.buffer;
    const originalName = req.file.originalname.toLowerCase();

    let text = "";

    if (originalName.endsWith(".pdf")) {
      const pdfData = await pdf(fileBuffer);
      text = pdfData.text;
    } else if (
      originalName.endsWith(".txt") ||
      originalName.endsWith(".md") ||
      originalName.endsWith(".csv") ||
      originalName.endsWith(".json")
    ) {
      text = fileBuffer.toString("utf-8");
    } else {
      return res.status(400).json({
        error: "Unsupported file format. Please upload a PDF, TXT, MD, CSV, or JSON file.",
      });
    }

    res.json({ 
      text, 
      filename: req.file.originalname, 
      size: req.file.size 
    });
  } catch (error: any) {
    console.error("File parsing error:", error);
    res.status(500).json({ error: error.message || "Failed to parse the file." });
  }
});

export default app;
