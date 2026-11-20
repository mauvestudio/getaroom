# Personnages The Room

Crée un dossier par personnage dans `public/characters/` ou `~/.getaroom/characters/`, ou utilise le bouton **+ Personnage** de The Room (aperçu animé, détourage automatique du fond, attribution à un agent / hôte).

## Format universel : sprite sheet 4 × 4

La feuille est découpée automatiquement en `largeur / 4` × `hauteur / 4` (frames carrées recommandées, rendu net sans lissage).

| Ligne | Orientation |
| --- | --- |
| 0 | Bas / face-gauche |
| 1 | Gauche / haut-gauche |
| 2 | Droite / bas-droite |
| 3 | Haut / dos-droite |

| Colonne | Posture |
| --- | --- |
| 0 | `idle` |
| 1 | `walk_1` |
| 2 | `walk_2` |
| 3 | `sitting_typing` (assis, face au bureau) — **ligne 3 : `grabbed`**, suspendu par le col |

Quand un agent travaille à son poste, la frame `sitting_typing` de la ligne correspondant au champ `facing` du poste (`room.json`) est utilisée. En mode calibrage (`Shift + E`), clic droit ou touche `R` sur un poste de travail pour le pivoter.

## Manifeste `character.json`

```json
{
  "name": "Mon personnage",
  "image": "sprites.png",
  "agentId": "webmaster",
  "hostId": "unraid",
  "shared": false,
  "maps": ["severance-mdr"],
  "spriteSheet": true,
  "frameSize": 64,
  "columns": 4,
  "rows": 4,
  "monochromeFilter": true
}
```

- `agentId` associe le visuel à un agent Room ; sans association, le nom du manifeste est utilisé.
- `hostId` dédie le visuel aux agents d'un hôte ; `shared: true` l'ajoute au pool partagé (attribué de façon stable aux agents sans visuel dédié).
- `maps` limite le personnage à certains décors (ids de `room.json`). Par défaut, l'import crée **un personnage par décor** ; un décor sans personnage garde son design d'origine (fantômes noir et blanc sur Monument Citadelle). Sans `maps`, le personnage vaut pour tous les décors.
- Les anciens PNG/WebP placés directement à la racine, et les avatars carrés fixes (`spriteSheet: false`), restent compatibles.
