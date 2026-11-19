# Mauve — Design System

Client personnel pour le daemon Paseo : **Ma Room** (assistants) et **Studio Dev** (projets de code). Ce document décrit ce qui est réellement implémenté dans `styles/globals.css` et `src/components/`.

---

## 1. Principes : « papier chaud et outillage précis »

1. **Chaleur avant tout** : fonds ivoire (clair) ou charbon brun (sombre). Jamais de blanc ou de noir purs, jamais de gris bleutés.
2. **Filets fins** : les zones sont séparées par des bordures de 1 px et de l'espace, pas par des ombres lourdes.
3. **Une couleur = un sens** : les composants n'emploient que des classes sémantiques (`bg-card`, `text-muted-foreground`…). Les seules couleurs libres sont celles des **agents** (`accentColor` de `src/config/agents.json`), posées en style en ligne.
4. **Hiérarchie nette** : un titre fort, des informations secondaires plus petites et plus discrètes, le technique en mono.
5. **Le mouvement signale l'activité** : seule la pastille d'un agent qui travaille ou attend une validation pulse. Les animations respectent `prefers-reduced-motion` (`motion-safe:`).
6. **Interface en français** : tous les textes visibles, y compris `title` et `aria-label`.

---

## 2. Couleurs

Tout passe par les variables CSS de `styles/globals.css` ; le thème est choisi par la classe `dark` sur `<html>` (préférence mémorisée, `system` par défaut).

| Élément | Clair (papier chaud) | Sombre (nuit chaude) | Classe Tailwind |
|---|---|---|---|
| Fond | `#fdfcfa` | `#181816` | `bg-background` |
| Barre latérale | `#f7f4ed` | `#1e1e1b` | `bg-sidebar` |
| Cartes, composeur | `#f5f1ea` | `#242420` | `bg-card` |
| Pastilles, remplissages | `#eee9df` | `#2c2c27` | `bg-muted` |
| Bordures | `#e8e4dc` | `#33332d` | `border-border` |
| Texte principal | `#393a34` | `#e5e5df` | `text-foreground` |
| Texte secondaire | `#6b6d63` | `#8a8a82` | `text-muted-foreground` |
| Bouton principal | `#1c1c1a` | `#f4f4f0` | `bg-primary text-primary-foreground` |
| Erreur | `#c0392b` | `#f0716a` | `text-destructive` |

**Lisibilité** : le gris secondaire du design initial (`#82847a`, contraste 3,6:1 sur le fond clair) a été foncé à `#6b6d63` (5,3:1) pour rester conforme AA sur le petit texte.

### États des agents

Un seul vocabulaire, partout (barre latérale, cartes Bento, en-tête, fils) — composants `LiveBadge` / `StatusDot` :

| État | Libellé | Teinte | Mouvement |
|---|---|---|---|
| `working` | Au travail | couleur d'accent de l'agent | pulse |
| `approval` | À valider | ambre | pulse |
| `review` | À relire | bleu | fixe |
| `idle` | Au repos | gris | fixe |

Priorité quand plusieurs s'appliquent : À valider > Au travail > À relire > Au repos.

### Couleurs opérationnelles

Ambre = en attente / en cours · Émeraude = succès, ajouts git · Rose/rouge = erreur, suppressions git · Bleu = information, relecture · Violet = plan, recherche.

---

## 3. Typographie

- **Texte** : Geist (variable), embarquée localement via `@fontsource-variable/geist` — aucun appel réseau. Repli : pile système (`-apple-system`, `SF Pro Text`, …).
- **Technique** : Geist Mono (`@fontsource-variable/geist-mono`) pour chemins, commandes, modèles, compteurs.

| Usage | Classes |
|---|---|
| Titre d'écran | `text-2xl font-semibold tracking-tight` |
| Titre de fiche | `text-xl font-semibold tracking-tight` |
| Libellé de section | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Corps | `text-sm leading-relaxed` |
| Secondaire | `text-xs text-muted-foreground` |
| Technique | `font-mono text-[11px] text-muted-foreground` |

---

## 4. Rayons

`rounded-[22px]` fiches Bento · `rounded-2xl` cartes d'approbation, composeur · `rounded-xl` boutons larges, avatars, lignes de liste · `rounded-lg` petits boutons · `rounded-full` pastilles et filtres.

---

## 5. Structure

**Barre latérale** (`w-64`, tiroir sur iPhone) : en-tête, contenu du mode, **sélecteur de mode en pied** (Ma Room / Studio Dev, mémorisé).

### Ma Room
- **Vue d'ensemble** : grille Bento (1 colonne sur iPhone, 2 puis 4 colonnes). Carte « À valider », une grande fiche par agent (portrait à 38 % sur fond teinté de son accent ; état, nom, rôle, dernier fil, modèle), fiche en pointillés « Nouvel agent ».
- **Espace d'un agent** : en-tête d'identité, colonne **Fils** (bandeau défilant sur iPhone), conversation, tiroir **Documents**.
- **Documents** : liste des `.md` / `.txt` du dossier de travail (agents Paseo), aperçu Markdown ; plein écran sur iPhone.
- **Approbations** (`ApprovalCard`) : ce que l'agent veut faire en une phrase, la cible en mono, un aperçu du changement, deux boutons de 48 px **Refuser / Valider**. Les questions à choix gardent le formulaire d'origine.

### Studio Dev
- Projets regroupés **Mauve / Perso / Autres** d'après le chemin (`…/Dev/Mauve/`, `…/Dev/Perso/`), filtre Tous / Mauve / Perso mémorisé.
- Projets → worktrees → sessions, diffs et actions git, terminal intégré (repris d'Amble, textes traduits).
- Retirés comme hors périmètre : lanceur de scripts de workspace, pastille de détail des tokens.

---

## 6. Iconographie

`lucide-react`, tailles : `w-3 h-3` (micro), `w-3.5 h-3.5` (contrôles), `w-4 h-4` (actions), `w-6 h-6` et plus (états vides). Les icônes dans un bouton ont `pointer-events: none`.

---

## 7. Mobile et tactile

Règles détaillées dans `AGENTS.md` : primitives `PressButton` / `PressTarget` (React Aria), `:hover` limité à `(hover: hover)`, zones tactiles ≥ 44 px (`min-h-11` / `min-h-12`), `touch-manipulation`, marges de zone sûre iOS.

---

## 8. Ajouter un thème

Définir une classe (ex. `.theme-x`) qui surcharge les variables de `globals.css` ; aucune modification de JSX n'est nécessaire.
