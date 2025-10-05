# No Kitty Card Game

A browser game inspired by Kitty Card game from Love and Deepspace.

## Status

[![Test CI](https://github.com/sakan811/no-kitty-cards-game/actions/workflows/ci.yml/badge.svg)](https://github.com/sakan811/no-kitty-cards-game/actions/workflows/ci.yml)

## Game Mechanics

### Room System
- Rooms are created dynamically when first player joins
- 6-character alphanumeric codes (uppercase)
- Maximum 2 players per room
- Automatic cleanup of empty rooms

### Game Rules
- Game start with 3 heart cards and 2 Magic cards each
- Turn-based gameplay with random starting player
- Player actions: 
    - draw 1 heart; player can only draw 1 card per turn
    - draw 1 magic card; player can only draw 1 card per turn
    - place heart on tile; can place multiple hearts if have enough hearts
    - use magic card ability; can use multiple magic cards if have enough magic cards
    - end turn
- Player can end turn without placing or using cards
- Player must draw heart and magic card
- There is 10 heart cards in deck
- There is 10 magic cards in deck
- Game ends when all tiles are filled
- If deck is empty, game ends

#### How to Win
Player with most points at end of game wins.

#### Point system
- Each heart card has it owns points ranged from 1 to 3
- Place a heart on a white tile: gain points as it is
- Place a heart on a tile with different color: gain 0 points
- Place a heart on a tile with the same color a heart: gain double points

#### Heart placing system
- Players can only place hearts on tiles that do not already have a heart
- Players can only place hearts during their turn
- Players can only place hearts if they have hearts in their hand
- Players can only place hearts on tiles that are not already filled

#### Magic Cards
- **Wind (💨)**: Remove an opponent's heart from a tile
    - Can only target tiles occupied by opponent's hearts
    - After removal, the tile color is the same as before
        - For example, if a red heart is removed from a red tile, the tile remains red
        - If a red heart is removed from a white tile, the tile becomes white
- **Recycle (♻️)**: Change a tile into a white tile
    - Can only target non-white tiles

### Gameplay Flow
1. Players must authenticate to create or join rooms
2. Players create or join rooms
3. Players mark themselves ready
4. Game starts when both players are ready
5. Random player starts first
6. Turn-based heart placement gameplay

### Game Elements
- **Tiles**: 8 colored tiles
    - Tiles can be white or colored (red, yellow, green) (⬜, 🟥, 🟨, 🟩)
- **Hearts**: 3 colored heart cards
    - Hearts can be red, yellow, or green (❤️, 💛, 💚)
- **Deck**: Starts with 10 heart cards and 10 magic cards
- **Player Hands**: Each player starts with 3 hearts, 2 magic cards
- **Magic Cards**: Special cards with unique abilities (Wind, Recycle)
- **Scoring System**: Points awarded for matching hearts on tiles
