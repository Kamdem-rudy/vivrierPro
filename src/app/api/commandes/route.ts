// src/app/api/commandes/route.ts
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { reserverStock, ErreurStock } from '@/lib/stock'
import { generateRef, estDansFenetreCommande } from '@/lib/utils-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const statut = searchParams.get('statut')
    const commandes = await prisma.commande.findMany({
      where: statut ? { statut: statut as any } : {},
      include: { point: true, produit: true },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(commandes)
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { pointId, produitId, quantite, notes, forceHoraire } = await req.json()

    // ── Fenêtre horaire 20h-23h ─────────────────────────────────────
    if (!forceHoraire && !estDansFenetreCommande()) {
      return NextResponse.json(
        { error: "Les commandes ne sont acceptées qu'entre 20h et 23h.", code: 'HORS_FENETRE' },
        { status: 403 }
      )
    }

    if (!pointId || !produitId || !quantite) {
      return NextResponse.json({ error: 'Point, produit et quantité requis' }, { status: 400 })
    }

    const qte = parseFloat(quantite)
    if (isNaN(qte) || qte <= 0) {
      return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 })
    }

    const point = await prisma.pointDistribution.findUnique({ where: { id: pointId, actif: true } })
    if (!point) return NextResponse.json({ error: 'Point de distribution introuvable' }, { status: 404 })

    // ── Créer la commande d'abord pour avoir l'ID ───────────────────
    const ref = generateRef('CMD')
    const commande = await prisma.commande.create({
      data: { reference: ref, pointId, produitId, quantite: qte, notes: notes || null },
      include: { point: true, produit: { include: { stock: true } } },
    })

    // ── Réservation de stock avec verrouillage optimiste ────────────
    try {
      await reserverStock(
        produitId,
        qte,
        commande.id,
        `Réservation pour commande ${ref} — ${point.nom}`
      )
    } catch (errStock: any) {
      // Annuler la commande créée si réservation échoue
      await prisma.commande.update({ where: { id: commande.id }, data: { statut: 'ANNULEE' } })

      const code = (errStock as ErreurStock).code
      const status = code === 'STOCK_INSUFFISANT' ? 409 : code === 'CONFLIT_EPUISE' ? 429 : 400
      return NextResponse.json({ error: errStock.message, code, details: errStock }, { status })
    }

    return NextResponse.json(commande, { status: 201 })

  } catch {
    return NextResponse.json({ error: 'Erreur création commande' }, { status: 500 })
  }
}
