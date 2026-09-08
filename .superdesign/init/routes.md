# Page and Route Mapping

The WSR Flash Card UI is an Obsidian view plugin driven by React state (ViewState) managed within FlashcardApp.tsx.

## View State Routes

### 1. Home / Deck List (home)

- View State: { type: "home" }
- Component: src/ui/views/Home/DeckList.tsx
- Description: Main dashboard displaying all decks, due card counters (new, learning, review), deck search/filter, and quick action buttons (create deck, start study, stats, settings).

### 2. Study Setup (study-setup)

- View State: { type: "study-setup", deckId: string }
- Component: src/ui/views/Study/StudySetup.tsx
- Description: Configuration screen before starting a spaced repetition study session (new cards limit, review limit, order, tags).

### 3. Study Session (study)

- View State: { type: "study", sessionReference: ... }
- Component: src/ui/views/Card/CardView.tsx
- Description: Core flashcard review screen. Shows card front, flip animation, markdown content, pronunciation audio, answer rating buttons (Again, Hard, Good, Easy with FSRS next interval previews), and undo button.

### 4. Practice Setup (practice-setup)

- View State: { type: "practice-setup", deckId: string }
- Component: src/ui/views/Practice/PracticeSetup.tsx
- Description: Configuration screen for casual practice mode (filter by tags, status, shuffle).

### 5. Practice Session (practice)

- View State: { type: "practice", sessionReference: ... }
- Component: src/ui/views/Practice/PracticeView.tsx
- Description: Free practice session screen with pass/fail tracking without affecting FSRS scheduling weights.

### 6. Practice Summary (practice-summary)

- View State: { type: "practice-summary", results: ... }
- Component: src/ui/views/Practice/PracticeSummary.tsx
- Description: Practice completion summary screen showing total reviewed, accuracy percentage, and action to review mistakes.

### 7. Spelling Setup (spelling-setup)

- View State: { type: "spelling-setup", deckId: string }
- Component: src/ui/views/Spelling/SpellingSetup.tsx
- Description: Dictation / spelling test configuration screen.

### 8. Spelling Session (spelling)

- View State: { type: "spelling", sessionReference: ... }
- Component: src/ui/views/Spelling/SpellingView.tsx
- Description: Spelling mode with audio prompt, input text box, instant diff/error highlighting, and feedback.

### 9. Spelling Summary (spelling-summary)

- View State: { type: "spelling-summary", results: ... }
- Component: src/ui/views/Spelling/SpellingSummary.tsx
- Description: Summary of spelling test results with mistake list.

### 10. Word / Card List (word-list)

- View State: { type: "word-list", deckId: string }
- Component: src/ui/views/WordList/WordListView.tsx
- Description: Browse, search, filter and batch operate on cards in a deck.

### 11. Statistics Dashboard (stats)

- View State: { type: "stats" }
- Component: src/ui/views/Stats/StatsView.tsx
- Description: Heatmap, review count charts, retention rate, card distribution by interval.

### 12. Card Editor Modal

- Component: src/ui/views/Card/CardEditorModal.tsx
- Description: Modal dialog for creating or editing card front/back/explanation/tags.

### 13. Deck Settings Modal

- Component: src/ui/views/DeckSettings/DeckSettingsModal.tsx
- Description: Modal dialog for configuring deck-specific FSRS parameters, retention targets, and limits.
