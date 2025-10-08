# No Kitty Card Game

A browser game inspired by Kitty Card game from Love and Deepspace.

## Status

[![Test CI](https://github.com/sakan811/no-kitty-cards-game/actions/workflows/ci.yml/badge.svg)](https://github.com/sakan811/no-kitty-cards-game/actions/workflows/ci.yml)

## Game Mechanics

### Room System

- **Dynamic Creation**: Rooms are created when the first player joins
- **Room Codes**: 6-character alphanumeric codes (uppercase letters and numbers)
- **Player Limit**: Maximum 2 players per room
- **Auto Cleanup**: Empty rooms are automatically removed

### Core Gameplay

- **Starting Cards**: Each player begins with 3 heart cards and 2 magic cards
- **Turn Order**: Random player starts first, then players alternate turns
- **Deck Size**: 16 heart cards and 16 magic cards total (balanced deck sizes)
- **Win Condition**: Player with the most points when all tiles are filled or deck is empty wins

### Turn Structure

During your turn, you can:

1. **Draw Cards**: Draw 1 heart card and 1 magic card (mandatory)
2. **Place Hearts**: Place multiple heart cards on empty tiles (if you have cards)
3. **Use Magic**: Activate magic card abilities (if you have cards)
4. **End Turn**: Pass control to the next player

### Scoring System

- **Heart Values**: Each heart card ❤️ 💛 💚 has 1-3 points
- **White Tiles ⬜**: Place heart → gain face value points
- **Color Mismatch**: Different colored heart/tile (e.g., ❤️ on 🟨) → 0 points
- **Color Match**: Same colored heart/tile (e.g., ❤️ on 🟥) → double points

### Placement Rules

- Hearts can only be placed on empty tiles
- Players can place multiple hearts per turn
- Hearts can only be placed during your turn

### Magic Cards

#### Wind 💨

- **Effect**: Remove an opponent's heart ❤️ from any tile
- **Target**: Only tiles occupied by opponent's hearts
- **Shield Interaction**: Cannot be used on tiles protected by Shield 🛡️
- **Tile Color Rule**: The underlying tile color never changes
  - ❤️ removed from 🟥 → tile stays 🟥
  - ❤️ removed from ⬜ → tile stays ⬜

#### Recycle ♻️

- **Effect**: Change any colored tile to white ⬜
- **Target**: Only non-white tiles 🟥 🟨 🟩
- **Shield Interaction**: Cannot be used on tiles protected by Shield 🛡️
- **Result**: Tile becomes ⬜ regardless of original color

#### Shield 🛡️

- **Effect**: Protect your tiles from opponent's Wind 💨 and Recycle ♻️ cards
- **Duration**: Active for 3 full turns (starts at 3, decrements each turn end)
- **Protection**: Blocks opponent's magic cards from targeting your tiles
- **Heart Placement**: You can still place hearts on your tiles while shield is active
- **Self-Recycle**: You can still use your own Recycle ♻️ cards on tiles while shield is active
- **Visual Indicators**:
  - Green shield icon (your perspective) / Red shield icon (opponent's perspective)
  - Shield icons appear on protected tiles with turn counter
  - Icons show in upper-left corner of each protected tile
- **Limitations**:
  - Only one shield per player allowed
  - Both players cannot have active shields simultaneously
  - New shield replaces your previous shield (not opponent's)

### Game Elements

- **Tiles**: 8 colored tiles ⬜ 🟥 🟨 🟩
  - Each tile has a color and can hold one heart card
  - **Visual Feedback**:
    - Green ring: Your hearts, Red ring: Opponent's hearts
    - Score badge shows points earned on placed hearts
    - Original tile color indicator when hearts are placed
    - Blue shield icon (top-left): Your shield protects all tiles
    - Red shield icon (top-right): Opponent shield protects their hearts
    - Hover highlights show valid moves and card targets
- **Hearts**: Colored cards ❤️ 💛 💚 with 1-3 points
- **Magic Cards**: Special ability cards 💨 ♻️ 🛡️ (Wind, Recycle, Shield)
  - Wind 💨: 6 cards in deck
  - Recycle ♻️: 5 cards in deck
  - Shield 🛡️: 5 cards in deck

### Game Flow

1. **Authentication**: Players sign in to access game features
2. **Room Creation**: Create new room or join existing room with code
3. **Ready Phase**: Both players must mark themselves as ready
4. **Game Start**: Random player selected to go first
5. **Turn Play**: Players take turns drawing, placing, and using cards
6. **Game End**: All tiles filled or deck empty → winner determined
