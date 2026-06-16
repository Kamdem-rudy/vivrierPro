export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const produits = await prisma.produit.findMany({
      include: { stock: true },
      orderBy: { nom: 'asc' },
    })
    return NextResponse.json(produits)
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
