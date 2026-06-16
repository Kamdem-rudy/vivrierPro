// src/app/api/graphe/route.ts
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { dijkstra } from '@/lib/dijkstra'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const targetId = searchParams.get('target') // point de destination

    const [points, chemins] = await Promise.all([
      prisma.pointDistribution.findMany({ where: { actif: true } }),
      prisma.chemin.findMany({ where: { actif: true } }),
    ])

    const graphNodes = [
      { id: 'ENTREPOT', label: 'Entrepôt Central', isEntrepot: true },
      ...points.map(p => ({ id: p.id, label: p.nom })),
    ]
    const graphEdges = chemins.map(c => ({
      id: c.id,
      source: c.departPointId ?? 'ENTREPOT',
      target: c.arriveePointId,
      distance: c.distance,
    }))

    const graph = { nodes: graphNodes, edges: graphEdges }

    // Si une cible est demandée, calculer le chemin le plus court
    let cheminOptimal = null
    if (targetId) {
      const result = dijkstra(graph, 'ENTREPOT')
      const path = result.paths.get(targetId) ?? []
      const distance = result.distances.get(targetId) ?? Infinity
      cheminOptimal = { path, distance }
    }

    return NextResponse.json({ nodes: graphNodes, edges: graphEdges, cheminOptimal })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
