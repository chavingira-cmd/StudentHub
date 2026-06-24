import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

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

export async function generateStudyNotes(topic: string, documentContext?: string) {
  const ai = getAI();
  let contents = `Generate comprehensive study notes for the topic: ${topic}. Include key concepts, definitions, and a summary. Format as Markdown.`;
  if (documentContext) {
    contents += `\n\nUse the following attached syllabus or study document as your primary reference and context source to compile these notes:\n\n[ATTACHED DOCUMENT]\n${documentContext}\n[END OF ATTACHED DOCUMENT]`;
  }
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
  });
  return response.text;
}

export async function generateFlashcards(topic: string, count: number = 5) {
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
