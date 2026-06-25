import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";

let aiInstance: GoogleGenAI | null = null;
let openaiInstance: OpenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not defined. AI features will not work.");
    }
    aiInstance = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return aiInstance;
}

function getOpenAI() {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      openaiInstance = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    }
  }
  return openaiInstance;
}

export async function generateStudyNotes(topic: string, documentContext?: string) {
  const openai = getOpenAI();
  let contents = `Generate comprehensive study notes for the topic: ${topic}. Include key concepts, definitions, and a summary. Format as Markdown.`;
  if (documentContext) {
    contents += `\n\nUse the following attached syllabus or study document as your primary reference and context source to compile these notes:\n\n[ATTACHED DOCUMENT]\n${documentContext}\n[END OF ATTACHED DOCUMENT]`;
  }

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: contents }],
      });
      const text = response.choices[0]?.message?.content;
      if (text) return text;
    } catch (err) {
      console.error("OpenAI study notes generation failed, falling back to Gemini:", err);
    }
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
  });
  return response.text;
}

export async function generateFlashcards(topic: string, count: number = 5) {
  const openai = getOpenAI();

  if (openai) {
    try {
      const systemPrompt = `Generate ${count} flashcards for the topic: ${topic}. Each flashcard should have a question and an answer.
Return a JSON object in this exact format:
{
  "flashcards": [
    {
      "question": "Question here",
      "answer": "Answer here"
    }
  ]
}`;
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: systemPrompt }],
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.flashcards)) {
        return parsed.flashcards;
      } else if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (err) {
      console.error("OpenAI flashcards generation failed, falling back to Gemini:", err);
    }
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate ${count} flashcards for the topic: ${topic}. Each flashcard should have a question and an answer.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
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
    },
  });
  return JSON.parse(response.text);
}
