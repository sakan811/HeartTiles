# Game Rules for Heart Tiles

## Room System

Players create rooms by clicking the "Create Room" button, which generates a unique 6-character code that other players can use to join. Each room supports exactly 2 players for strategic gameplay.

**Authentication**: Players must sign in to create or join rooms.

## How to Play

Heart Tiles is a strategic card game where players compete for the highest score by placing colored hearts on matching tiles while using magic cards to gain advantages.

**Starting the Game**: Each player receives 3 heart cards and 2 magic cards. A random player gets the first turn, and players alternate turns throughout the match.

**Winning Conditions**: The game ends when:

1. All 8 tiles are filled with hearts
2. BOTH the heart deck AND magic deck are empty AND the current player ends their turn

## Turn Structure

During your turn, you can perform these actions in any order:

1. **Draw Cards**: Draw 1 heart card AND 1 magic card (if decks have cards available)
2. **Place Hearts**: Place up to 2 numbers of heart cards from your hand on empty tiles
3. **Use Magic Cards**: Use up to 1 number of magic cards from your hand
4. **End Turn**: Pass control to your opponent

**Important Rules**:

- You must draw both a heart and magic card (if available) before ending your turn
- You can end your turn without placing cards or using magic cards
- Each player can only draw 1 heart and 1 magic card per turn

## Scoring Points

Hearts come in three colors (red ❤️, yellow 💛, and green 💚) with point values from 1-3 points:

- **White Tiles ⬜**: Earn the heart's face value points
- **Color Match**: Place a matching color heart (red ❤️ on red 🟥) and earn double points
- **Color Mismatch**: Place a different color heart (red ❤️ on yellow 🟨) and earn zero points
- **Player Score**: Player's score is the sum of all their hearts' placed on the tiles. When a heart is removed, its points are subtracted from the player's score.

## Heart Placement Rules

- Hearts can only be placed on tiles that don't already have a heart
- You can place multiple hearts during your turn if you have enough cards
- Hearts can only be placed during your own turn

## Magic Cards

The game contains 16 heart cards and 16 magic cards with this distribution:

- **Wind (💨)**: 6 cards
- **Recycle (♻️)**: 5 cards
- **Shield (🛡️)**: 5 cards

### Wind 💨 - Remove Hearts

Wind cards remove an opponent's heart from any tile.

**Targeting Rules**:

- Can only target tiles occupied by opponent's hearts
- Cannot target empty tiles or your own hearts

**Tile Color Rules**: When Wind removes a heart, the tile returns to its original color:

- Red heart removed from red tile → Tile remains red (🟥)
- Red heart removed from white tile → Tile becomes white (⬜)
- Yellow heart removed from yellow tile → Tile remains yellow (🟨)
- Green heart removed from green tile → Tile remains green (🟩)

### Recycle ♻️ - Change Tile Color

Recycle cards transform any empty, non-white tile into a white tile.

**Targeting Rules**:

- Can only target empty tiles (no hearts present)
- Can only target colored tiles (red, yellow, green) - not white tiles

### Shield 🛡️ - Protection

Shield cards protect your hearts and tiles for 2 any-player turns.

**Protection Rules**:

- **Wind Protection**: Blocks all Wind cards targeting your hearts while shield is active
- **Recycle Protection**: Blocks all opponent Recycle cards from converting colored tiles to white while shield is active
- You can still place hearts while shielded

**Activation Rules**:

- Only one player can have an active shield at any time
- You cannot activate a shield if your opponent has one active
- You can use another Shield card to reset your 2-turn timer

## Game Elements

**Tiles**: 8 tiles with random colors (white, red, yellow, green)

**Visual Feedback**:

- Green rings highlight your placed hearts
- Red rings show opponent's hearts
- Number badges display points earned on each heart at the upper-right of the tile
- Shield icons show remaining turns when active at the upper-left of the tile
- Hover highlights show valid moves during gameplay
- Original color of tiles is indicated by a small square at the bottom-right corner

## Complete Game Flow

1. **Sign In**: Players authenticate to access the game
2. **Create/Join Room**: Use the "Create Room" button or enter a room code
3. **Get Ready**: Both players mark themselves ready to start
4. **Game Start**: Random starting player gets 3 hearts and 2 magic cards
5. **Turn-Based Play**: Players alternate turns drawing cards, placing hearts, and using magic cards
6. **Game End**: Winner is determined when tiles are filled or both decks are empty
