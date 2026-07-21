# Lavoirs V2 — Prototype

Prototype de "V2" inspiré de [lavoirs.org](https://www.lavoirs.org/) : géolocalisation temps réel, lavoirs à proximité sur une carte, itinéraire en voiture vers le lavoir choisi.

## Données

Pas d'accès à la base propriétaire de lavoirs.org. Les lavoirs affichés proviennent d'[OpenStreetMap](https://www.openstreetmap.org/copyright) (tag `amenity=lavoir`), via l'API Overpass. La couverture dépend donc de ce qui est déjà cartographié sur OSM dans la zone testée — elle peut être partielle.

## Lancer le prototype

Un serveur HTTP local est nécessaire (ouvrir `index.html` directement en `file://` bloque les appels réseau dans certains navigateurs) :

```bash
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000` dans le navigateur.

## Tester sans GPS réel

- **Chrome DevTools → Sensors → Location** : simuler une position (idéaliste : une commune rurale française, pour avoir des lavoirs OSM à proximité).
- **Mode position manuelle** : bouton "Définir une position manuellement" dans la barre latérale, puis cliquer sur la carte.

## Stack

- HTML/CSS/JS statique, aucun build step
- [Leaflet.js](https://leafletjs.com/) + tuiles OpenStreetMap
- [Overpass API](https://overpass-api.de/) pour les données lavoirs
- [OSRM](https://project-osrm.org/) (serveur de démo public, profil voiture) pour l'itinéraire
