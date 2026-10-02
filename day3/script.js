let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

// 1. Search notes
function searchNotes(word) {
  return notes.filter((note) =>
    note.text.toLowerCase().includes(word.toLowerCase())
  );
}

console.log("searchNotes('day'):", searchNotes("day"));
// Expected: [{ id: 2, text: "Finish the Day 3 assignment", category: "study" }]

console.log("searchNotes('python'):", searchNotes("python"));
// Expected: []


// 2. Find the longest note
function longestNote() {
  if (notes.length === 0) {
    return null;
  }

  let longest = notes[0];

  for (let i = 1; i < notes.length; i++) {
    if (notes[i].text.length > longest.text.length) {
      longest = notes[i];
    }
  }

  return longest;
}

console.log("longestNote():", longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }

let savedNotesForTest = notes;
notes = [];

console.log("longestNote() with empty array:", longestNote());
// Expected: null

notes = savedNotesForTest;


// 3. Count notes by category
function countByCategory() {
  const counts = {};

  for (const note of notes) {
    if (!counts[note.category]) {
      counts[note.category] = 0;
    }

    counts[note.category]++;
  }

  return counts;
}

console.log("countByCategory():", countByCategory());
// Expected: { personal: 2, study: 2, work: 1 }

let originalNotesForCountTest = notes;
notes = [];

console.log("countByCategory() with empty array:", countByCategory());
// Expected: {}

notes = originalNotesForCountTest;


// 4. Get notes summary
function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const noteWord = total === 1 ? "note" : "notes";

  return `${total} ${noteWord}: ${counts.personal || 0} personal, ${
    counts.work || 0
  } work, ${counts.study || 0} study.`;
}

console.log("getSummary():", getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."

let originalNotesForSummaryTest = notes;
notes = [notes[0]];

console.log("getSummary() with one note:", getSummary());
// Expected: "1 note: 1 personal, 0 work, 0 study."

notes = originalNotesForSummaryTest;


// 5. Check for duplicate notes
function isDuplicate(text) {
  const normalizedText = text.trim().toLowerCase();

  return notes.some(
    (note) => note.text.trim().toLowerCase() === normalizedText
  );
}

console.log("isDuplicate('  CALL MUM  '):", isDuplicate("  CALL MUM  "));
// Expected: true

console.log("isDuplicate('Go shopping'):", isDuplicate("Go shopping"));
// Expected: false


// 6. Add a note
function addNote(text, category) {
  const validCategories = ["personal", "work", "study"];

  if (typeof text !== "string" || text.trim().length < 1) {
    console.log("Note not added: text cannot be empty.");
    return false;
  }

  if (text.trim().length > 200) {
    console.log("Note not added: text must be 1–200 characters.");
    return false;
  }

  if (isDuplicate(text)) {
    console.log("Note not added: duplicate note.");
    return false;
  }

  if (!validCategories.includes(category)) {
    console.log("Note not added: invalid category.");
    return false;
  }

  const newId =
    notes.length > 0 ? Math.max(...notes.map((note) => note.id)) + 1 : 1;

  notes.push({
    id: newId,
    text: text.trim(),
    category: category,
  });

  console.log("Note added successfully.");
  return true;
}

console.log(
  "addNote('Prepare presentation', 'work'):",
  addNote("Prepare presentation", "work")
);
// Expected: true

console.log(
  "addNote('  CALL MUM  ', 'personal'):",
  addNote("  CALL MUM  ", "personal")
);
// Expected: false (duplicate note)