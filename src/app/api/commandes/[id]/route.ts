// src/app/api/commandes/[id]/route.ts
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { libererStock } from '@/lib/stock'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { statut } = await req.json()
    const commande = await prisma.commande.findUnique({ where: { id: params.id } })
    if (!commande) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })

    const updated = await prisma.commande.update({
      where: { id: params.id },
      data: { statut },
      include: { point: true, produit: true },
    })

    // Si annulation → libérer le stock réservé
    if (statut === 'ANNULEE' && ['EN_ATTENTE', 'VALIDEE'].includes(commande.statut)) {
      await libererStock(commande.produitId, commande.quantite, commande.id)
    }

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const commande = await prisma.commande.findUnique({ where: { id: params.id } })
    if (!commande) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

    await prisma.commande.update({ where: { id: params.id }, data: { statut: 'ANNULEE' } })

    if (['EN_ATTENTE', 'VALIDEE'].includes(commande.statut)) {
      await libererStock(commande.produitId, commande.quantite, commande.id)
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erreur annulation' }, { status: 500 })
  }
}
