# Extractable UI Components

## FlashcardHeader

- Source: src/ui/primitives/Header/FlashcardHeader.tsx
- Category: layout
- Description: Top navigation and view header with title, subtitle, back navigation, and action buttons.
- Extractable props: title (string), subtitle (string), showBack (boolean, default: false)

## SessionToolbar

- Source: src/ui/primitives/SessionToolbar/SessionToolbar.tsx
- Category: layout
- Description: Fixed bottom action bar for card rating, next/prev, and undo.
- Extractable props: canUndo (boolean, default: false), showAnswer (boolean, default: false)

## DeckCard

- Source: src/ui/views/Home/DeckList.tsx
- Category: basic
- Description: Individual deck card showing deck title, due counts (new, learning, review), and menu actions.
- Extractable props: deckName (string), newCount (number), learningCount (number), reviewCount (number)

## AnswerRatingGroup

- Source: src/ui/views/Card/CardView.tsx
- Category: basic
- Description: Spaced repetition rating 4-button group (Again, Hard, Good, Easy) with intervals.
- Extractable props: againInterval (string), hardInterval (string), goodInterval (string), easyInterval (string)
