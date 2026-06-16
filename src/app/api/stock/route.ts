// src/app/api/stock/route.ts
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { lireStocks, approvisionnerStock } from '@/lib/stock'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const stocks = await lireStocks()
    return NextResponse.json(stocks)
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { produitId, quantite, description } = await req.json()
    if (!produitId || !quantite || quantite <= 0) {
      return NextResponse.json({ error: 'Produit et quantité requise (> 0)' }, { status: 400 })
    }
    const stock = await approvisionnerStock(produitId, parseFloat(quantite), description)
    return NextResponse.json(stock, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
