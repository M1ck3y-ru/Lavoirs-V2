# Zone détail sans scroll, noms distinguables, mobile, bouton Maps

## Context

Retour d'usage réel sur le prototype Lavoirs V2 (captures d'écran à l'appui), après la fonctionnalité photos livrée juste avant dans cette même session. Quatre problèmes concrets :

1. Les photos sont tout en bas du panneau latéral, sous la liste entière des lavoirs → il faut scroller pour les voir après sélection
2. La liste affiche plusieurs "Ancien Lavoir" à la suite sans commune → donne l'impression de lavoirs indistincts/sans nom, alors que la commune est déjà en base et déjà affichée dans la popup marqueur
3. Aucune mise en page mobile (sidebar fixe 340px, carte+panneau côte à côte uniquement) → inutilisable sur téléphone
4. Pas de bouton pour ouvrir le trajet dans une vraie app Maps du téléphone (navigation turn-by-turn), en plus de l'itinéraire interne OSRM déjà affiché sur la carte

Fichiers connus (déjà écrits dans cette session) : `app.js`, `index.html`, `style.css`. Pas de framework, pas de build step.

## Approche

### 1. Zone détail sans scroll (`index.html`, `style.css`, `app.js`)

Ajouter `<div id="lavoir-detail" class="hidden"></div>` dans `index.html`, placé entre `#controls` et `<ul id="lavoir-list">`. Supprimer le `<div id="lavoir-photos">` existant (en bas) — son contenu est absorbé par la nouvelle zone détail.

Cette zone contient, générée dynamiquement dans `app.js` :
- Nom du lavoir + commune (repli "Commune inconnue" si absente)
- Distance
- Bouton "Itinéraire" (réutilise `showRoute` existant, déjà appelé via `selectLavoir({computeRoute: true})`)
- Bouton "Ouvrir dans Maps" (nouveau, voir §3)
- Photos (logique déplacée telle quelle depuis les fonctions existantes `setPhotosStatus`/`renderPhotos`/`loadLavoirPhotos`, qui ciblent déjà `document.getElementById('lavoir-photos')` — on renomme simplement l'id ciblé vers l'intérieur de `#lavoir-detail`, aucune réécriture de la logique de fetch/cache)

Nouvelle fonction `renderLavoirDetail(lavoir)` appelée depuis `selectLavoir()` : construit le nom/commune/distance/boutons, appelle `loadLavoirPhotos(lavoir)` pour la partie photos (inchangée). `hideLavoirDetail()` si jamais `selectedLavoirId` redevient null (pas de cas actuel qui déclenche ça, mais gardé pour cohérence avec ISC-3).

CSS : `#lavoir-detail` en position normale (pas sticky — pas nécessaire puisqu'il est déjà tout en haut, juste après les contrôles, donc visible sans scroll par construction), avec `border-bottom` pour séparer visuellement de la liste en dessous.

### 2. Noms distinguables (`app.js`)

Dans `renderSidebarList`, ajouter la commune sous le nom (comme dans la popup marqueur déjà existante) :
```
<span class="lavoir-name">${lavoir.name}</span>
<span class="lavoir-commune">${lavoir.commune || 'Commune inconnue'}</span>
<span class="lavoir-distance">${formatDistance(lavoir.distance)}</span>
```
CSS `.lavoir-commune` : petit, couleur `--text-muted` (déjà définie), cohérent avec le style existant.

### 3. Bouton "Ouvrir dans Maps" (`app.js`)

Fonction `buildMapsUrl(from, to)` :
```js
`https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=walking`
```
Lien universel (fonctionne sur desktop/iOS/Android — sur mobile avec l'app Google Maps installée, le lien web est intercepté par l'OS ; sinon ouvre le web). Pas de détection Apple Maps/Google Maps — hors périmètre demandé.

Dans `renderLavoirDetail(lavoir)` : si `state.currentPosition` existe, afficher `<a href="${buildMapsUrl(...)}" target="_blank" rel="noopener">Ouvrir dans Maps</a>`. Si `state.currentPosition` est `null` (rare, avant résolution géoloc), afficher un bouton visuellement désactivé avec message explicite ("Position requise pour ouvrir Maps") au lieu d'un lien mort silencieux — cohérent avec le principe anti-échec-silencieux déjà appliqué partout ailleurs dans ce fichier (ex. `onPositionError`).

### 4. Responsive mobile (`style.css` principalement, `index.html` marginalement)

Un seul breakpoint (`@media (max-width: 768px)`) :
- `#app` : `flex-direction: column` au lieu de `row`
- `#sidebar` : `width: 100%`, hauteur limitée (`max-height: 45vh` ou similaire) avec `overflow-y: auto` (déjà présent) — placé en second dans le DOM donc sous la carte, ou au-dessus selon lisibilité (à trancher visuellement pendant l'implémentation, probablement carte en haut pour l'orientation immédiate, panneau en dessous)
- `#map` (`main`) : `flex: 1` garantit qu'elle prend le reste de la hauteur (≥ 40% d'écran vérifié en VERIFY)
- `#route-summary` : `left: 360px` en dur → remplacé par une règle mobile `left: 16px; right: 16px;` (pleine largeur avec marge) au lieu de la position calée sur la largeur desktop de la sidebar
- Cibles tactiles : `#controls select/button`, `#lavoir-list li`, boutons de la zone détail → `min-height: 40px` ajouté en mobile (ou globalement si ça n'abîme pas le desktop — à vérifier)
- Aucune règle desktop existante supprimée ; le breakpoint n'ajoute que des overrides scoping `@media`, donc pas de régression desktop par construction

## Fichiers touchés

- `index.html` — nouveau `#lavoir-detail`, suppression de l'ancien `#lavoir-photos` en bas
- `app.js` — `renderLavoirDetail`/`hideLavoirDetail`, `buildMapsUrl`, commune dans `renderSidebarList`, adaptation des fonctions photos existantes pour cibler le nouvel id
- `style.css` — styles `#lavoir-detail`, `.lavoir-commune`, media query mobile, correctif `#route-summary`

## Vérification

Réutiliser la méthode déjà validée dans cette session (Playwright Python réel, serveur local, géoloc simulée, vraies données OSM/Commons) :
1. Desktop (viewport existant) : sélectionner un lavoir → détail + photos visibles sans scroll (capture écran), liste affiche commune, bouton Maps présent avec bon lien, non-régression de l'itinéraire interne existant
2. Mobile (viewport type 390×844) : layout empilé, carte ≥ 40% de la hauteur, pas de débordement horizontal (`document.documentElement.scrollWidth <= viewport.width`), `#route-summary` ne déborde pas, cibles tactiles mesurées ≥ 40px
3. Cas position absente : bouton Maps affiche l'état désactivé explicite, pas de lien cassé
4. Repasser rapidement les critères de la session précédente (photos, plus de propositions) pour confirmer l'absence de régression après la réorganisation DOM
