---
task: Version 2 lavoirs.org avec géolocalisation et itinéraire
slug: 20260709-095407_lavoirs-v2-geolocation-itinerary
effort: advanced
phase: complete
progress: 33/33
mode: interactive
started: 2026-07-09T09:54:07Z
updated: 2026-07-09T10:15:00Z
---

## Context

Le dossier de travail `LAVOIRV2` est vide (projet greenfield, pas de dépôt git). L'utilisateur a consulté https://www.lavoirs.org/ (site patrimonial recensant ~23 000 lavoirs français) et souhaite créer une "V2" avec trois fonctionnalités clés : géolocalisation temps réel de l'utilisateur, affichage des lavoirs à proximité, et calcul d'itinéraire vers le lavoir choisi.

Ce qui est explicitement demandé : géolocalisation en temps réel, visualisation des lavoirs proches, proposition d'itinéraire vers un lavoir sélectionné.

Ce qui n'est pas demandé : reproduire l'intégralité du site (contribution communautaire, circuits, cartes postales, livre d'or) — le périmètre est la fonctionnalité de géolocalisation/proximité/itinéraire uniquement, pas un clone complet.

Point d'attention : nous n'avons pas accès à la base de données propriétaire de ~23 000 lavoirs de lavoirs.org (contenu communautaire tiers). Le scraping non autorisé de ce contenu n'est pas acceptable. Une source de données alternative est nécessaire (OpenStreetMap via Overpass API, qui référence des lavoirs/wash-houses en tant que données ouvertes, ou un jeu de données d'exemple fourni par l'utilisateur).

### Risks

- Dépendance à des services tiers gratuits avec quotas limités (Overpass API, serveur de démo OSRM) pouvant être instables en production
- La géolocalisation navigateur nécessite HTTPS et l'autorisation explicite de l'utilisateur ; doit être gérée avec états de repli clairs
- Sans base de données réelle équivalente à celle de lavoirs.org, la couverture géographique du prototype sera partielle
- Le choix de la stack technique (frontend framework, backend ou 100% client) n'a pas encore été validé avec l'utilisateur
- Ouvrir le fichier en `file://` direct peut bloquer fetch()/CORS ; nécessite un serveur HTTP local
- Zone de test sans lavoir référencé dans OSM peut rendre la démo peu convaincante malgré un code correct
- CORS potentiellement bloqué sur le serveur de démo OSRM public depuis certaines origines

## Criteria

### UI / Carte
- [x] ISC-1: Carte s'affiche centrée sur une position par défaut avant résolution de la géolocalisation
- [x] ISC-2: Carte affiche un marqueur pour la position actuelle de l'utilisateur après autorisation
- [x] ISC-3: Carte affiche un marqueur par lavoir dans le rayon configuré
- [x] ISC-4: Clic sur un marqueur lavoir ouvre une popup avec nom et commune
- [x] ISC-5: Popup de détail inclut un bouton "Itinéraire"
- [x] ISC-6: Panneau liste affiche les lavoirs proches triés par distance croissante
- [x] ISC-7: Panneau liste affiche la distance en km/m pour chaque lavoir
- [x] ISC-8: UI affiche un message explicite si la géolocalisation est refusée
- [x] ISC-9: UI affiche un état de chargement pendant l'acquisition de la position
- [x] ISC-10: UI affiche un message explicite si aucun lavoir n'est trouvé à proximité

### Géolocalisation
- [x] ISC-11: App demande l'autorisation de géolocalisation au chargement
- [x] ISC-12: App utilise un suivi continu (watchPosition) pour la mise à jour temps réel de la position
- [x] ISC-13: Liste des lavoirs proches se recalcule quand la position change significativement
- [x] ISC-14: App gère le timeout de géolocalisation avec un message de repli

### Données
- [x] ISC-15: Jeu de données lavoirs contient au minimum nom, latitude, longitude, commune
- [x] ISC-16: Source de données est documentée comme non issue d'un scraping non autorisé de lavoirs.org
- [x] ISC-17: Fonction/endpoint retourne les lavoirs dans un rayon donné autour de coordonnées
- [x] ISC-18: Calcul de distance utilise la formule de Haversine
- [x] ISC-19: Recherche de proximité est plafonnée à un rayon maximum configurable

### Itinéraire
- [x] ISC-20: Sélection d'un lavoir déclenche le calcul d'un itinéraire depuis la position utilisateur
- [x] ISC-21: Itinéraire est tracé sous forme de polyligne sur la carte
- [x] ISC-22: Résumé d'itinéraire affiche distance totale et durée estimée
- [x] ISC-23: Mode de déplacement par défaut est la marche à pied
- [x] ISC-24: Absence d'itinéraire trouvé affiche un message de repli à l'utilisateur

### Infrastructure
- [x] ISC-25: Projet démarre localement via une seule commande documentée (serveur HTTP local, pas file://)
- [x] ISC-26: Fond de carte provient d'un fournisseur ouvert (OSM) sans clé API payante requise par défaut
- [x] ISC-27: App gère les géométries OSM way/relation (centroïde) en plus des nodes pour les marqueurs lavoir
- [x] ISC-28: App propose un mode position manuelle/simulée pour tester sans géolocalisation réelle
- [x] ISC-29: Position de secours par défaut est définie pour l'affichage initial de la carte

### Anti-critères
- [x] ISC-A1: Application ne doit PAS scraper/copier la base propriétaire de lavoirs.org sans autorisation
- [x] ISC-A2: Application ne doit PAS échouer silencieusement quand la géolocalisation est indisponible
- [x] ISC-A3: Application ne doit PAS bloquer le rendu de la carte en attendant la permission de géolocalisation
- [x] ISC-A4: Application ne doit PAS échouer silencieusement en cas d'erreur réseau Overpass/OSRM

## Decisions

- Stack : HTML/CSS/JS statique + Leaflet.js (pas de framework, pas de build step) — choix par défaut recommandé faute de réponse utilisateur, permet un prototype ouvrable directement dans le navigateur
- Données : OpenStreetMap via Overpass API, tag confirmé `amenity=lavoir` (wiki.openstreetmap.org/wiki/Tag:amenity=lavoir) — choix par défaut recommandé, données ouvertes légales, pas de scraping de lavoirs.org
- Routing : OSRM serveur de démo public (router.project-osrm.org), profil `foot` (marche à pied) par défaut

### Passe /simplify (4 agents : reuse, simplification, efficiency, altitude)

Appliqué :
- Couleurs : source unique via les CSS custom properties (`getComputedStyle`), suppression de l'objet `COLORS` codé en dur dupliqué avec `style.css`
- Sélection d'un lavoir unifiée dans une seule fonction `selectLavoir(id, {computeRoute})` (au lieu de deux chemins `setSelectedInList`/`selectLavoir`)
- Mise à jour ciblée du marqueur/item sélectionné (`updateMarkerIcon`, `updateListHighlight`) au lieu de reconstruire tous les marqueurs et toute la liste à chaque clic
- `state.markersById` (Map) remplace la mutation `lavoir._marker` sur les objets de données
- Throttle de rechargement simplifié : un seul critère (distance parcourue), `force: true` explicite pour le changement de rayon/la position manuelle, au lieu de trafiquer `lastFetchPosition = null`
- `enableHighAccuracy: false` (watchPosition) : suffisant pour une recherche à l'échelle km, moins coûteux en continu
- Libellés du bouton "position manuelle" et leur réinitialisation extraits en constantes + `setManualModeUI()`
- CSS `.status-loading`/`.status-info` fusionnés (règles identiques)

Non appliqué (jugé mineur, gardé en l'état) :
- Fusionner `renderMarkers`/`renderSidebarList` en un seul `render()` : ils opèrent sur deux arbres DOM différents (carte vs liste) et restent nécessaires tels quels pour le rafraîchissement initial après fetch ; la vraie duplication de coût (re-render complet à la sélection) est déjà résolue séparément
- Extraire un helper `lavoirLabel()` pour factoriser nom+distance entre popup et item liste : duplication jugée trop mineure (un seul appel à `formatDistance` de plus) pour justifier une abstraction

## Verification

**Méthode :** app pilotée réellement via un agent navigateur (Playwright), serveur local `python3 -m http.server 8743`, géolocalisation simulée (contextOptions.geolocation), appels réseau réels vers Overpass API et OSRM (pas de mock).

**Parcours vérifié (zone Bourgogne, lat=46.9/lng=4.3) :**
1. Carte Leaflet + tuiles OSM affichées (ISC-1, ISC-26) — screenshot `step1-map-loaded.png`
2. Overpass retourne 1 lavoir réel, statut "1 lavoir(s) trouvé(s) à proximité." (ISC-3, ISC-6, ISC-7, ISC-15, ISC-17, ISC-18)
3. Clic sur le lavoir dans la liste → itinéraire OSRM calculé, ligne verte tracée, résumé "Vers Lavoir sans nom — 6.7 km · 23 min à pied" (ISC-4, ISC-5, ISC-20, ISC-21, ISC-22, ISC-23) — screenshot `step4-route-calculated.png`
4. Mode position manuelle : bouton bascule d'état, clic sur la carte repositionne le marqueur violet et relance la recherche (ISC-28) — screenshot `step5-manual-position.png`
5. Console JS : aucune erreur applicative sur toute la session (uniquement un 404 favicon cosmétique)

**Bug trouvé puis corrigé (round-trip complet) :** après un repositionnement (GPS significatif ou manuel), l'itinéraire précédemment calculé restait affiché (ligne + résumé) au lieu d'être invalidé — géométriquement incohérent avec la nouvelle position. Corrigé par l'ajout de `clearRoute()` déclenché sur mouvement significatif (`RELOAD_THRESHOLD_M`) ou repositionnement manuel. **Retest confirmé PASS** : ligne verte et résumé disparaissent immédiatement après repositionnement, capture `retest-after-fix.png`.

**Anti-critères vérifiés en conditions réelles :**
- ISC-A3 : carte rendue avant toute résolution de géolocalisation (comportement observé dès l'ouverture)
- ISC-A4 : l'API Overpass a renvoyé un `429 Too Many Requests` pendant les tests (rate-limit du serveur public) → l'app a affiché le message d'erreur explicite prévu, aucune exception JS non gérée. Anti-critère validé en conditions réelles, pas seulement en théorie.
- ISC-27 : le lavoir retourné par Overpass a été correctement géolocalisé (le code gère node/way/relation via `out center`)

**Limite connue documentée :** couverture OSM partielle selon la zone (1 seul lavoir trouvé dans la zone de test) — attendu et documenté en Context/Risks, pas un défaut du code.

**Passe qualité :** voir section Decisions pour le détail de la passe `/simplify` (4 agents) appliquée avant ce test.
