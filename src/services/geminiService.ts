export async function generateStudyNotes(topic: string) {
  const response = await fetch("/api/generate-notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topic }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to generate study notes: ${errText}`);
  }

  const data = await response.json();
  return data.text;
}

export async function generateFlashcards(topic: string, count: number = 5) {
  const response = await fetch("/api/generate-flashcards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topic, count }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to generate flashcards: ${errText}`);
  }

  const data = await response.json();
  return data;
}
