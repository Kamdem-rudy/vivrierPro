// src/app/api/stock/mouvements/route.ts
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const produitId = searchParams.get('produitId')
    const mouvements = await prisma.mouvementStock.findMany({
      where: produitId ? { stock: { produitId } } : {},
      include: { stock: { include: { produit: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json(mouvements)
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
