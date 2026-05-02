// src/lib/dijkstra.ts

export interface GraphNode {
  id: string
  label: string
  isEntrepot?: boolean
}

export interface GraphEdge {
  id: string
  source: string   
  target: string   
  distance: number // km
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface DijkstraResult {
  distances: Map<string, number>
  previous: Map<string, string | null>
  paths: Map<string, string[]>
}

/**
 * Algorithme de Dijkstra pour trouver les chemins les plus courts
 * depuis la source (l'entrepôt) vers tous les points de distribution
 */
export function dijkstra(graph: Graph, sourceId: string): DijkstraResult {
  const distances = new Map<string, number>()
  const previous = new Map<string, string | null>()
  const visited = new Set<string>()
  const nodeIds = graph.nodes.map(n => n.id)

  // Initialisation
  for (const id of nodeIds) {
    distances.set(id, Infinity)
    previous.set(id, null)
  }
  distances.set(sourceId, 0)

  // File de priorité (simplifiée avec array trié)
  const queue = [...nodeIds]

  while (queue.length > 0) {
    // Sélectionner le nœud non visité avec la distance minimale
    queue.sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity))
    const current = queue.shift()!

    if (visited.has(current)) continue
    visited.add(current)

    if (distances.get(current) === Infinity) break

    // Explorer les voisins
    const neighbors = graph.edges.filter(e => e.source === current)
    for (const edge of neighbors) {
      const neighbor = edge.target
      if (visited.has(neighbor)) continue

      const alt = (distances.get(current) ?? Infinity) + edge.distance
      if (alt < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, alt)
        previous.set(neighbor, current)
      }
    }
  }

  // Reconstituer les chemins
  const paths = new Map<string, string[]>()
  for (const id of nodeIds) {
    if (id === sourceId) {
      paths.set(id, [sourceId])
      continue
    }
    const path: string[] = []
    let current: string | null = id
    while (current !== null) {
      path.unshift(current)
      current = previous.get(current) ?? null
    }
    if (path[0] === sourceId) {
      paths.set(id, path)
    } else {
      paths.set(id, []) // non atteignable
    }
  }

  return { distances, previous, paths }
}

/**
 * Calcule l'itinéraire optimal pour livrer tous les points
 * en minimisant la distance totale (heuristique Greedy TSP)
 */
export function calculerItineraireOptimal(
  graph: Graph,
  sourceId: string,
  pointsIds: string[]
): { itineraire: string[]; distanceTotale: number } {
  if (pointsIds.length === 0) return { itineraire: [], distanceTotale: 0 }

  const result = dijkstra(graph, sourceId)
  const aVisiter = new Set(pointsIds)
  const itineraire: string[] = [sourceId]
  let distanceTotale = 0
  let positionActuelle = sourceId

  while (aVisiter.size > 0) {
    // Recalcul depuis la position actuelle
    const resultatLocal = dijkstra(graph, positionActuelle)

    // Trouver le point le plus proche non encore visité
    let minDistance = Infinity
    let prochainPoint: string | null = null

    for (const pointId of aVisiter) {
      const dist = resultatLocal.distances.get(pointId) ?? Infinity
      if (dist < minDistance) {
        minDistance = dist
        prochainPoint = pointId
      }
    }

    if (prochainPoint === null || minDistance === Infinity) break

    // Ajouter le chemin vers ce point
    const chemin = resultatLocal.paths.get(prochainPoint) ?? []
    // Ajouter les nœuds intermédiaires (sans dupliquer le départ)
    for (let i = 1; i < chemin.length; i++) {
      itineraire.push(chemin[i])
    }

    distanceTotale += minDistance
    aVisiter.delete(prochainPoint)
    positionActuelle = prochainPoint
  }

  return { itineraire, distanceTotale }
}

/**
 * Calcule le temps de trajet en minutes selon le type de véhicule
 */
export function calculerTempsTrajet(
  distanceKm: number,
  vitesseKmh: number,
  nbVehicules: number = 1
): number {
  if (vitesseKmh <= 0 || nbVehicules <= 0) return 0
  // Temps en minutes, réduit proportionnellement au nombre de véhicules
  // (les véhicules couvrent des portions différentes du trajet)
  const tempsBase = (distanceKm / vitesseKmh) * 60
  return Math.ceil(tempsBase / Math.sqrt(nbVehicules))
}

/**
 * Vérifie si l'heure actuelle est dans la fenêtre de commande (20h-23h)
 */
export function estDansFenetreCommande(): boolean {
  const now = new Date()
  const heures = now.getHours()
  return heures >= 20 && heures < 23
}

/**
 * Retourne le temps restant avant/après la fenêtre de commande
 */
export function infoFenetreCommande(): {
  ouverte: boolean
  message: string
  heuresRestantes: number
  minutesRestantes: number
} {
  const now = new Date()
  const heures = now.getHours()
  const minutes = now.getMinutes()

  if (heures >= 20 && heures < 23) {
    const minutesRestantes = (23 - heures - 1) * 60 + (60 - minutes)
    return {
      ouverte: true,
      message: `Fenêtre ouverte - Ferme dans ${Math.floor(minutesRestantes / 60)}h${minutesRestantes % 60}min`,
      heuresRestantes: Math.floor(minutesRestantes / 60),
      minutesRestantes: minutesRestantes % 60,
    }
  }

  let minutesAvant: number
  if (heures < 20) {
    minutesAvant = (20 - heures - 1) * 60 + (60 - minutes)
  } else {
    // Après 23h, calculer jusqu'à 20h du lendemain
    minutesAvant = (24 - heures + 20) * 60 - minutes
  }

  return {
    ouverte: false,
    message: `Fenêtre fermée - Ouvre dans ${Math.floor(minutesAvant / 60)}h${minutesAvant % 60}min`,
    heuresRestantes: Math.floor(minutesAvant / 60),
    minutesRestantes: minutesAvant % 60,
  }
}
