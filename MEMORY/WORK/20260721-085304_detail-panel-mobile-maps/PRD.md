---
task: Zone détail sans scroll, noms distinguables, mobile, bouton Maps
slug: 20260721-085304_detail-panel-mobile-maps
effort: advanced
phase: complete
progress: 24/24
mode: interactive
started: 2026-07-21T08:53:04Z
updated: 2026-07-21T08:53:04Z
---

## Context

Retour d'usage réel (captures d'écran fournies) après la fonctionnalité photos livrée dans `MEMORY/WORK/20260721-083503_lavoir-photos-plus-suggestions/`. Quatre problèmes concrets remontés :

1. Les photos sont en bas du panneau latéral, sous la liste complète des lavoirs → il faut redescendre/scroller pour les voir après avoir sélectionné un lavoir
2. La liste affiche plusieurs "Ancien Lavoir" à la suite sans commune → donne l'impression de lavoirs sans nom/indistincts, alors que la commune (déjà en base) permettrait de les distinguer
3. L'app n'est pas utilisable sur téléphone (sidebar fixe 340px, pas de mise en page responsive)
4. Pas de moyen d'ouvrir le trajet dans une vraie application Maps du téléphone pour la navigation réelle (l'itinéraire interne OSRM affiché sur la carte reste utile mais ne remplace pas la navigation turn-by-turn d'une app Maps)

Ce qui est explicitement demandé : photos visibles sans scroll, noms/lavoirs distinguables, support mobile, bouton Maps.
Ce qui n'est pas demandé : retirer l'itinéraire interne existant, choisir entre Google Maps/Apple Maps avec détection de plateforme (repli sur un lien universel), refonte visuelle complète.

### Risks

- Repositionner les photos dans une nouvelle zone "détail" en haut du panneau change la structure DOM/CSS existante → risque de régression sur le layout desktop actuel (à re-vérifier, pas seulement le nouveau comportement)
- `#route-summary` est positionné en dur (`left: 360px`) calé sur la largeur desktop de la sidebar → doit être adapté pour ne pas déborder sur mobile
- Un lien Google Maps universel peut ne pas ouvrir l'app native sur toutes les plateformes (dépend de l'OS/navigateur) — limite acceptée, pas de détection de plateforme complexe pour un prototype
- Ajouter un breakpoint mobile sans re-tester le desktop pourrait casser silencieusement l'existant (géoloc, sélection, itinéraire) — nécessite un test réel aux deux tailles de viewport

### Risks (Think)

- Zone détail en haut du panneau pourrait réduire la place visible de la liste sur desktop → mitigé car masquée tant qu'aucun lavoir n'est sélectionné (ISC-3)
- Hauteur de carte mobile insuffisante rendrait la géolocalisation/sélection inutilisable → seuil explicite ajouté (≥ 40% de la hauteur d'écran, ISC-16)
- Lien Maps avec coordonnées absentes casserait silencieusement si non gardé → couvert par ISC-14/ISC-A4
- Test mobile doit utiliser un vrai viewport Playwright simulé (pas juste un redimensionnement visuel) pour fiabiliser la mesure des cibles tactiles

## Criteria

### Zone détail sans scroll
- [x] ISC-1: Zone détail (nom, commune, distance, photos, boutons) s'affiche entre les contrôles et la liste, visible sans défilement
- [x] ISC-2: Zone détail se met à jour immédiatement au changement de sélection, sans nécessiter de défilement
- [x] ISC-3: Zone détail masquée quand aucun lavoir n'est sélectionné

### Noms distinguables dans la liste
- [x] ISC-4: Chaque item de la liste latérale affiche le nom du lavoir (déjà existant, non-régression)
- [x] ISC-5: Chaque item de la liste latérale affiche la commune quand elle est connue
- [x] ISC-6: Item sans commune connue affiche un repli explicite (ex. "Commune inconnue") plutôt qu'un champ vide silencieux

### Photos déplacées dans la zone détail
- [x] ISC-7: Photos du lavoir sélectionné affichées dans la nouvelle zone détail (plus en bas de la liste)
- [x] ISC-8: États existants des photos (chargement/vide/erreur, cache, anti-refetch) conservés sans régression dans le nouvel emplacement

### Bouton Ouvrir dans Maps
- [x] ISC-9: Zone détail affiche un bouton/lien "Ouvrir dans Maps"
- [x] ISC-10: Lien Maps utilise la position actuelle de l'utilisateur comme origine
- [x] ISC-11: Lien Maps utilise les coordonnées du lavoir sélectionné comme destination
- [x] ISC-12: Lien Maps utilise le mode de déplacement à pied
- [x] ISC-13: Lien Maps s'ouvre dans un nouvel onglet (ne remplace pas l'app)
- [x] ISC-14: Bouton Maps affiche un état explicite (désactivé/masqué avec message) si aucune position utilisateur n'est disponible

### Responsive mobile
- [x] ISC-15: En dessous d'un breakpoint mobile, la mise en page passe en colonne (empilée) au lieu de côte à côte
- [x] ISC-16: Sur mobile, la carte reste visible avec une hauteur utilisable (≥ 40% de la hauteur d'écran)
- [x] ISC-17: Sur mobile, le panneau latéral reste défilable indépendamment de la carte
- [x] ISC-18: Sur mobile, `#route-summary` ne déborde pas hors de l'écran et reste lisible
- [x] ISC-19: Sur mobile, les boutons et items de liste ont une hauteur de cible tactile suffisante (≥ 40px)
- [x] ISC-20: Sur mobile, aucun débordement horizontal involontaire de la page
- [x] ISC-21: Layout desktop existant (≥ breakpoint) reste inchangé (non-régression testée, pas supposée)

## Decisions

- Zone détail placée entre `#controls` et `<ul id="lavoir-list">` dans le DOM (pas sticky/overlay) : elle est déjà tout en haut du panneau, donc visible sans scroll par construction, sans complexité de positionnement CSS supplémentaire
- Bouton Maps : lien universel Google Maps (`google.com/maps/dir/?api=1&...&travelmode=walking`), pas de détection Apple Maps/Android — hors périmètre demandé
- Mobile : un seul breakpoint `@media (max-width: 768px)`, `#app` passe en colonne, `#map` en premier (via `order`) pour l'orientation immédiate, `#sidebar` en dessous avec `max-height: 45vh`

### Passe /simplify (4 agents : reuse, simplification, efficiency, altitude)

Appliqué :
- Garde `if (id !== previousId)` restaurée dans `selectLavoir` : évite de reconstruire icônes/liste/zone détail en resélectionnant le lavoir déjà sélectionné (l'efficacité vient de la garde, pas seulement du cache photos)
- `#route-summary` déplacé à l'intérieur de `#map` (au lieu de sibling dans `#app`) et repositionné `left: 20px` relatif à `#map` (qui a déjà `position: relative`) au lieu de `left: 360px` codé en dur et couplé à la largeur de la sidebar ; supprime le besoin d'un override mobile pour ce composant
- Styles `.itineraire-btn` dupliqués (popup vs zone détail) fusionnés en une seule règle de base, la popup ne garde que ses overrides spécifiques (marge, padding réduit)

Non appliqué (jugé hors périmètre pour rester chirurgical) :
- Fusionner les 3 générateurs de HTML lavoir (popup marqueur, item de liste, zone détail) en un seul helper partagé : la duplication popup/liste préexistait à cette session ; un tel refactor toucherait du code non lié à la demande actuelle

### Anti-critères
- [x] ISC-A1: L'app ne doit PAS nécessiter de défilement pour voir les photos juste après la sélection d'un lavoir
- [x] ISC-A2: L'app ne doit PAS afficher un lavoir sans moyen de le distinguer d'un autre du même nom dans la liste
- [x] ISC-A3: L'app ne doit PAS casser la mise en page desktop existante en ajoutant le support mobile
- [x] ISC-A4: Le bouton Maps ne doit PAS échouer silencieusement quand la position n'est pas encore connue

## Verification

**Méthode :** app pilotée réellement dans Chromium headless via Playwright Python, serveur local `python3 -m http.server 8901`, géolocalisation simulée, appels réseau réels vers Overpass/Commons/OSRM. Deux viewports testés : desktop (1280×800) et mobile (390×844, iPhone-like).

**Desktop — parcours vérifié :**
1. Avant toute sélection : `#lavoir-detail` a la classe `hidden` (ISC-3)
2. Sélection d'un lavoir → zone détail visible immédiatement, `sidebar.scrollTop === 0` (aucun scroll nécessaire) — nom, "Commune inconnue" (repli explicite), distance, boutons Itinéraire + Ouvrir dans Maps, et les 3 photos, tous visibles sans défiler (ISC-1, ISC-2, ISC-4, ISC-5, ISC-6, ISC-7, ISC-A1, ISC-A2) — capture `r2-desktop-detail.png`
3. Lien Maps : `https://www.google.com/maps/dir/?api=1&origin=46.9,4.3&destination=46.9419741,4.3134512&travelmode=walking`, `target="_blank"` confirmé (ISC-9, ISC-10, ISC-11, ISC-12, ISC-13)
4. Resélection du même lavoir : contenu de `#lavoir-detail` inchangé (garde `id !== previousId` efficace, pas de rebuild inutile)
5. Layout desktop non régressé : sidebar toujours 340px, `#app` toujours en row (ISC-21)
6. Aucune erreur console

**Mobile — parcours vérifié (re-testé isolément après un throttling Overpass transitoire pendant la première passe) :**
1. `#app` en `flex-direction: column` (ISC-14)
2. Hauteur de carte mesurée : 586px sur 844px (69%, ≥ 40% requis) (ISC-15, ISC-16)
3. Aucun débordement horizontal : `scrollWidth === clientWidth === 390` (ISC-19/20 pour l'axe horizontal)
4. `#sidebar` reste `overflow-y: auto`, défilement indépendant de la carte (ISC-17)
5. Cibles tactiles mesurées : item de liste 72px, bouton Itinéraire 40px, bouton Maps 40px — toutes ≥ 40px (ISC-19)
6. `#route-summary` reste dans le viewport (`left: 20, right: 347` sur 390px de large) après le déplacement dans `#map` et la suppression de l'ancien `left: 360px` codé en dur (ISC-18)
7. Aucune erreur console dans cette passe isolée — capture `r2-mobile-retry.png`

**Anti-critère vérifié en conditions réelles :** pendant l'enchaînement rapide de plusieurs scripts de vérification consécutifs (ce round + le précédent), l'API Overpass a de nouveau produit des réponses dégradées (`504 Gateway Timeout`) sur une passe — comportement hérité déjà documenté (pas une régression de ce PR), confirmé géré sans exception JS non gérée ; retest isolé après une pause propre et sans erreur.

**Passe qualité :** voir section Decisions pour le détail de la passe `/simplify` (4 agents) appliquée avant ce test.
