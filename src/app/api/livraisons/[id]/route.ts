// src/app/api/livraisons/[id]/
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { StatutCommande, StatutLivraison } from '@prisma/client'
import { libererStock, deduireStockLivraison } from '@/lib/stock'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { statut } = await req.json()
    const livraison = await prisma.livraison.findUnique({
      where: { id: params.id },
      include: { arrets: { include: { commande: true } } },
    })
    if (!livraison) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

    await prisma.$transaction(async (tx) => {
      await tx.livraison.update({
        where: { id: params.id },
        data: { statut, dateArrivee: statut === StatutLivraison.TERMINEE ? new Date() : undefined },
      })

      if (statut === StatutLivraison.TERMINEE) {
        const commandeIds = livraison.arrets.map(a => a.commandeId)
        await tx.commande.updateMany({ where: { id: { in: commandeIds } }, data: { statut: StatutCommande.LIVREE } })
        await tx.vehicule.update({ where: { id: livraison.vehiculeId }, data: { disponible: true } })

        // Déduire le stock définitivement pour chaque commande livrée
        for (const arret of livraison.arrets) {
          await deduireStockLivraison(arret.commande.produitId, arret.commande.quantite, arret.commandeId)
        }
      }

      if (statut === StatutLivraison.ANNULEE) {
        const commandeIds = livraison.arrets.map(a => a.commandeId)
        await tx.commande.updateMany({ where: { id: { in: commandeIds } }, data: { statut: StatutCommande.VALIDEE } })
        await tx.vehicule.update({ where: { id: livraison.vehiculeId }, data: { disponible: true } })
        // Note: le stock reste réservé car les commandes redeviennent VALIDEE
      }
    })

    return NextResponse.json({ success: true, statut })
  } catch {
    return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 })
  }
}
