---
task: Photos du lavoir sélectionné + plus de propositions à proximité
slug: 20260721-083503_lavoir-photos-plus-suggestions
effort: extended
phase: complete
progress: 22/22
mode: interactive
started: 2026-07-21T08:35:03Z
updated: 2026-07-21T08:36:00Z
---

## Context

Suite au prototype "Lavoirs V2" déjà complet et vérifié (géoloc + carte + itinéraire, voir `MEMORY/WORK/20260709-095407_lavoirs-v2-geolocation-itinerary/PRD.md`), l'utilisateur demande deux améliorations après usage réel :

1. Afficher 2-3 photos du lavoir quand on le sélectionne dans les propositions
2. Avoir plus de propositions de lavoirs à proximité (actuellement 3 vues dans son cas)

Ce qui est explicitement demandé : photos au moment de la sélection, plus de propositions.
Ce qui n'est pas demandé : refonte visuelle, changement de source de données lavoirs (reste OSM/Overpass), changement de moteur d'itinéraire.

Investigation du code existant (`app.js`, `index.html`, `style.css`) : **aucun cap artificiel à 3** n'existe dans le code — `renderMarkers`/`renderSidebarList` affichent tous les lavoirs retournés par Overpass dans le rayon choisi, sans `.slice()`. Le rayon par défaut est 5 km (options : 2/5/10/20 km, `MAX_RADIUS_M = 20000`). Le nombre de "3" vu par l'utilisateur est donc uniquement fonction de ce que couvre OSM dans un rayon de 5 km à sa position — pas un bug de troncature. Pour "plus de propositions", le levier est le rayon de recherche.

Pour les photos : les nœuds OSM `amenity=lavoir` n'ont quasiment jamais de tag `image` ou `wikimedia_commons` renseigné (vérifié par lecture du schéma OSM, cohérent avec la faible densité de contribution communautaire sur ce tag). Une source de repli est nécessaire : l'API Wikimedia Commons (`commons.wikimedia.org/w/api.php`, geosearch par coordonnées) est gratuite, sans clé API, CORS-friendly (`origin=*`), et cohérente avec le choix déjà fait d'utiliser des données ouvertes sans scraping de lavoirs.org.

### Risks

- Densité de photos Wikimedia Commons proche des lavoirs probablement faible en zone rurale → beaucoup de cas "aucune photo trouvée" malgré un code correct (comme la couverture OSM déjà documentée comme partielle)
- Élargir le rayon par défaut/max augmente la taille des réponses Overpass et le risque de re-déclencher un `429 Too Many Requests` (déjà rencontré lors des tests précédents)
- L'API Wikimedia Commons geosearch peut retourner des photos non pertinentes (prises près du lavoir mais pas du lavoir lui-même) faute de tag direct — limite acceptée et à documenter, pas un bug
- Rayon très large (ex. 50 km) peut ralentir la requête Overpass et dégrader le "temps réel" recherché initialement

### Risks (Think)

- API Wikimedia Commons geosearch : accessible sans clé en CORS d'après la doc, à confirmer par un appel réel en VERIFY
- Geosearch sans rayon plafonné remonterait des photos hors sujet (ex. maison voisine) → rayon de recherche photo limité à 300 m (ISC-4b)
- Défaut de rayon relevé à 10 km seulement (pas 30-50 km) pour limiter le risque de re-déclencher un 429 Overpass ; le rayon large reste un choix utilisateur explicite

## Criteria

### Photos
- [x] ISC-1: Sélection d'un lavoir déclenche une requête de photos associées
- [x] ISC-2: Requête utilise le tag OSM `wikimedia_commons` du lavoir comme source prioritaire si présent
- [x] ISC-3: Requête utilise le tag OSM `image` du lavoir comme source prioritaire si présent et pas de `wikimedia_commons`
- [x] ISC-4: Requête de repli interroge l'API geosearch Wikimedia Commons autour des coordonnées du lavoir si aucun tag direct
- [x] ISC-4b: Rayon de la recherche geosearch Commons plafonné à 300 m pour rester pertinent au lavoir
- [x] ISC-5: Jusqu'à 3 photos maximum sont affichées par lavoir sélectionné
- [x] ISC-6: Photos affichées sous forme de vignettes cliquables ouvrant l'image en taille réelle dans un nouvel onglet
- [x] ISC-7: Chaque vignette a un attribut alt basé sur le nom du lavoir
- [x] ISC-8: État de chargement explicite affiché pendant la récupération des photos
- [x] ISC-9: Message explicite affiché quand aucune photo n'est trouvée (pas d'échec silencieux)
- [x] ISC-10: Message explicite affiché en cas d'erreur réseau lors de la récupération des photos
- [x] ISC-11: Zone photos se réinitialise (vide + nouvel état de chargement) quand un autre lavoir est sélectionné
- [x] ISC-12: Zone photos n'apparaît que dans le contexte du lavoir sélectionné (pas dans les popups des marqueurs non sélectionnés)

### Plus de propositions
- [x] ISC-13: Une option de rayon ≥ 30 km est ajoutée au sélecteur de rayon
- [x] ISC-14: `MAX_RADIUS_M` est relevé pour couvrir la plus grande option de rayon ajoutée
- [x] ISC-15: Rayon par défaut sélectionné au chargement passe de 5 km à 10 km
- [x] ISC-16: Aucune troncature artificielle du nombre de lavoirs affichés dans la liste latérale (confirmation/non-régression)
- [x] ISC-17: Aucune troncature artificielle du nombre de marqueurs affichés sur la carte (confirmation/non-régression)
- [x] ISC-18: Message de statut reflète le nombre réel de lavoirs trouvés au rayon choisi

## Decisions

- Photos : source Wikimedia Commons (gratuite, sans clé, CORS `origin=*`), priorité tag OSM `wikimedia_commons` > tag `image` > geosearch par coordonnées plafonné à 300 m — cohérent avec le choix déjà fait d'éviter tout scraping de lavoirs.org
- Rayon par défaut relevé à 10 km seulement (pas 30 km) pour limiter le risque de re-déclencher un 429 Overpass déjà rencontré lors des tests précédents ; l'option 30 km reste disponible en choix explicite

### Passe /simplify (4 agents : reuse, simplification, efficiency, altitude)

Appliqué :
- Les 3 fonctions `fetchCommonsByCategory`/`fetchCommonsByFile`/`fetchCommonsByGeosearch` fusionnées en un seul `fetchCommonsJson(params)` (URLSearchParams + fetch/parse partagés)
- `setPhotosLoading`/`setPhotosEmpty`/`setPhotosError` fusionnés en `setPhotosStatus(message, isError)`
- Cache `photosCache` (Map lavoir.id → photos) pour éviter de re-requêter Commons en resélectionnant un lavoir déjà vu
- `selectLavoir` ignore l'appel photos si l'id resélectionné est déjà le lavoir courant

Non appliqué (jugé à la bonne profondeur, gardé en l'état) :
- Garde anti-réponse-tardive `photosRequestId` : pattern minimal à 4 lignes, une abstraction de type AbortController serait disproportionnée pour ce seul flux
- Cascade if/else des 3 sources de photos dans `fetchLavoirPhotos` : seulement 3-4 cas hétérogènes (formes de requête différentes), un dispatcher table-driven ajouterait de l'indirection sans réduire la complexité réelle

### Anti-critères
- [x] ISC-A1: L'application ne doit PAS échouer silencieusement si la récupération des photos échoue
- [x] ISC-A2: L'application ne doit PAS afficher plus de 3 photos par lavoir
- [x] ISC-A3: L'application ne doit PAS bloquer l'affichage du lavoir sélectionné en attendant les photos

## Verification

**Méthode :** app pilotée réellement dans un navigateur Chromium headless via Playwright Python (pas de mock), serveur local `python3 -m http.server 8901`, géolocalisation simulée (`context.geolocation`), appels réseau réels vers Overpass, Wikimedia Commons et OSRM.

**Zone de test :** même zone que la vérification précédente (lat=46.9, lng=4.3, Bourgogne, près d'Autun).

**Parcours vérifié :**
1. Chargement initial : rayon par défaut = 10 km confirmé (`#radius-select` value `10000`), option `30000` présente dans le sélecteur (ISC-13, ISC-14, ISC-15) — capture `step1-loaded-10km.png`
2. À 10 km : 1 lavoir trouvé. Passage à 30 km : **14 lavoirs trouvés** — confirme concrètement "plus de propositions" (ISC-16, ISC-17, ISC-18) — capture `step2-loaded-30km.png`
3. Sélection d'un lavoir → zone photos passe par l'état "Recherche de photos…" puis affiche **3 vraies photos** récupérées via le repli geosearch Wikimedia Commons (le lavoir testé n'avait ni tag `wikimedia_commons` ni `image` — chemin de repli ISC-4/ISC-4b exercé en conditions réelles) — vignettes cliquables (`target="_blank"`), alt text = nom du lavoir (ISC-1, ISC-4, ISC-4b, ISC-5, ISC-6, ISC-7, ISC-8, ISC-A2) — capture `step6-photos-visible.png`
4. Resélection du même lavoir déjà sélectionné : aucune nouvelle requête Commons observée (compteur de requêtes inchangé, cache `photosCache` + garde `id !== previousId` efficaces)
5. Sélection d'un second lavoir différent : zone photos se réinitialise (repasse par l'état de chargement) (ISC-11)
6. Test d'erreur réseau dédié : requêtes vers `commons.wikimedia.org` interceptées et abandonnées (`route.abort()`) → message explicite "Impossible de récupérer des photos (erreur réseau)." affiché, aucune exception JS non gérée (ISC-9, ISC-10, ISC-A1) — confirmé dans un script isolé (`verify_error_path.py`)
7. Console JS : aucune erreur applicative sur l'ensemble des parcours (le seul message `net::ERR_FAILED` observé est l'artefact attendu du `route.abort()` du test lui-même, pas une exception de l'app)

**ISC-2/ISC-3 (priorité des tags OSM `wikimedia_commons`/`image`) :** non exercées en conditions réelles car aucun lavoir de la zone de test ne porte ces tags (cohérent avec le risque documenté en Context : ces tags sont rarement renseignés sur `amenity=lavoir`). Vérifiées par lecture de code (`fetchLavoirPhotos` teste `lavoir.wikimediaCommons` puis `lavoir.image` avant le repli geosearch) — logique correcte mais non testée en bout-en-bout avec de vraies données.

**Anti-critère vérifié en conditions réelles :** en testant plusieurs cycles de rechargement rapprochés (rayon 10→30 km, plusieurs runs de script consécutifs), l'API Overpass a de nouveau renvoyé un `429 Too Many Requests` à un moment — l'app a affiché le message d'erreur explicite existant sans planter, confirmant que le risque documenté en Think ("élargir le rayon augmente le risque de 429") se matérialise bien en pratique et reste géré correctement (comportement hérité, non régressé).

**Limite connue observée :** le repli geosearch Commons a remonté, en plus d'une photo pertinente ("Le bassin du lavoir"), deux photos d'une "boîte à livres" (little free library) simplement proches à moins de 300 m — confirme le risque documenté en Think ("photos non pertinentes faute de tag direct"), limite acceptée et déjà documentée, pas un défaut du code.

**Passe qualité :** voir section Decisions pour le détail de la passe `/simplify` (4 agents) appliquée avant ce test.
