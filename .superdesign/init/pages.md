# Component Dependency Trees for Key Pages

## 1. / (Home / DeckList)

Entry: src/ui/views/Home/DeckList.tsx
Dependencies:

- src/ui/primitives/Header/FlashcardHeader.tsx
    - src/ui/primitives/Button/Button.tsx
    - src/ui/primitives/Menu/Menu.tsx
- src/ui/primitives/Input/Input.tsx
- src/ui/primitives/Button/Button.tsx
- src/ui/primitives/Modal/Modal.tsx
- src/ui/views/Card/CardEditorModal.tsx
- src/ui/views/DeckSettings/DeckSettingsModal.tsx

## 2. /study (Study Session)

Entry: src/ui/views/Card/CardView.tsx
Dependencies:

- src/ui/primitives/Header/FlashcardHeader.tsx
- src/ui/primitives/Markdown/PronounceableMarkdown.tsx
    - src/ui/primitives/Markdown/MarkdownContent.tsx
    - src/ui/primitives/PronunciationButton/PronunciationButton.tsx
- src/ui/primitives/SessionToolbar/SessionToolbar.tsx
    - src/ui/primitives/Button/Button.tsx
- src/ui/primitives/SessionTimer/SessionTimer.tsx

## 3. /practice (Practice Session)

Entry: src/ui/views/Practice/PracticeView.tsx
Dependencies:

- src/ui/primitives/Header/FlashcardHeader.tsx
- src/ui/primitives/Markdown/PronounceableMarkdown.tsx
- src/ui/primitives/Button/Button.tsx
- src/ui/primitives/SessionToolbar/SessionToolbar.tsx

## 4. /spelling (Spelling Test Session)

Entry: src/ui/views/Spelling/SpellingView.tsx
Dependencies:

- src/ui/primitives/Header/FlashcardHeader.tsx
- src/ui/primitives/Input/Input.tsx
- src/ui/primitives/Button/Button.tsx
- src/ui/primitives/PronunciationButton/PronunciationButton.tsx

## 5. /stats (Stats Dashboard)

Entry: src/ui/views/Stats/StatsView.tsx
Dependencies:

- src/ui/primitives/Header/FlashcardHeader.tsx
- src/ui/primitives/Button/Button.tsx
- src/ui/primitives/Select/Select.tsx
