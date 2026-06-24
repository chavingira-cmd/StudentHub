import express from "express";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

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

app.post("/api/chatbot", async (req, res) => {
  const { messages } = req.body;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: messages.map(m => ({
        role: m.role === "assistant" ? "model" : m.role,
        parts: [{ text: m.text || m.content }]
      })),
      config: {
        systemInstruction: "You are 'StudenthubAI', the friendly AI Study Tutor for StudentHub, aligned with the Zimbabwe Heritage-Based Curriculum (2024-2030). Your goal is to make learning easy, engaging, and extremely accessible for students. Since students can sometimes find long texts overwhelming, you must: 1. Explain complex academic concepts in simple, digestible, and friendly language. 2. Use bullet points, bold text, and brief summaries to break up information. 3. Be friendly and encourage the Ubuntu principle ('Hunhu/Unhu') and cultural pride. 4. Offer to quiz them, build fun study rhymes/songs, or explain processes using analogies matching local Zimbabwean contexts (e.g. comparing database indexing to sorting bags of grain or comparing CPU cache to quick-access tools at a domestic forge). Focus on being extremely clear so they don't have to read massive textbooks! Keep your answers relatively concise, highly engaging, and formatted beautifully in Markdown."
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Chatbot error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI response" });
  }
});

export default app;
