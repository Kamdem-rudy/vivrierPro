// src/app/api/livraisons/route.ts
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { dijkstra, calculerItineraireOptimal, calculerTempsTrajet } from '@/lib/dijkstra'
import { generateRef } from '@/lib/utils-server'
import { StatutCommande } from '@prisma/client'

export async function GET() {
  try {
    const livraisons = await prisma.livraison.findMany({
      include: {
        vehicule: true,
        arrets: { include: { point: true, commande: true }, orderBy: { ordre: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(livraisons)
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { vehiculeId, commandeIds, dateDepart } = await req.json()

    if (!vehiculeId || !commandeIds?.length) {
      return NextResponse.json({ error: 'Véhicule et commandes requis' }, { status: 400 })
    }

    // Récupérer le véhicule
    const vehicule = await prisma.vehicule.findUnique({ where: { id: vehiculeId } })
    if (!vehicule) {
      return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 })
    }

    // Récupérer les commandes et leurs points
    const commandes = await prisma.commande.findMany({
      where: { id: { in: commandeIds }, statut: StatutCommande.VALIDEE },
      include: { point: true, produit: true },
    })

    if (commandes.length === 0) {
      return NextResponse.json({ error: 'Aucune commande validée trouvée' }, { status: 400 })
    }

    // Récupérer le graphe
    const points = await prisma.pointDistribution.findMany({ where: { actif: true } })
    const chemins = await prisma.chemin.findMany({ where: { actif: true } })

    const graphNodes = [
      { id: 'ENTREPOT', label: 'Entrepôt', isEntrepot: true },
      ...points.map(p => ({ id: p.id, label: p.nom })),
    ]
    const graphEdges = chemins.map(c => ({
      id: c.id,
      source: c.departPointId ?? 'ENTREPOT',
      target: c.arriveePointId,
      distance: c.distance,
    }))

    const graph = { nodes: graphNodes, edges: graphEdges }
    const pointsIds = [...new Set(commandes.map(c => c.pointId))]

    // Calcul itinéraire optimal avec Dijkstra
    const { itineraire, distanceTotale } = calculerItineraireOptimal(graph, 'ENTREPOT', pointsIds)

    // Calcul du temps de trajet
    const tempsPrevuMin = calculerTempsTrajet(distanceTotale, vehicule.vitesse, 1)

    const depart = dateDepart ? new Date(dateDepart) : new Date()

    // Créer la livraison en transaction
    const livraison = await prisma.$transaction(async (tx) => {
      const liv = await tx.livraison.create({
        data: {
          reference: generateRef('LIV'),
          vehiculeId,
          distanceTotale,
          tempsPrevuMin,
          dateDepart: depart,
          itineraire: JSON.stringify(itineraire),
        },
      })

      // Créer les arrêts dans l'ordre de l'itinéraire
      const pointsVisites = itineraire.filter(id => id !== 'ENTREPOT')
      for (let i = 0; i < pointsVisites.length; i++) {
        const pointId = pointsVisites[i]
        const commandesDuPoint = commandes.filter(c => c.pointId === pointId)

        for (const commande of commandesDuPoint) {
          await tx.arretLivraison.create({
            data: {
              livraisonId: liv.id,
              pointId,
              commandeId: commande.id,
              ordre: i + 1,
            },
          })
          // Mettre à jour statut commande
          await tx.commande.update({
            where: { id: commande.id },
            data: { statut: StatutCommande.EN_COURS_LIVRAISON },
          })
        }
      }

      // Marquer véhicule indisponible
      await tx.vehicule.update({
        where: { id: vehiculeId },
        data: { disponible: false },
      })

      return liv
    })

    const livraisonComplete = await prisma.livraison.findUnique({
      where: { id: livraison.id },
      include: {
        vehicule: true,
        arrets: { include: { point: true, commande: true }, orderBy: { ordre: 'asc' } },
      },
    })

    return NextResponse.json(livraisonComplete, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erreur création livraison' }, { status: 500 })
  }
}
