// src/app/api/points/
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const points = await prisma.pointDistribution.findMany({
      orderBy: { nom: 'asc' },
      include: {
        _count: { select: { commandes: true } },
      },
    })
    return NextResponse.json(points)
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nom, adresse, latitude, longitude } = await req.json()
    if (!nom || !adresse) {
      return NextResponse.json({ error: 'Nom et adresse requis' }, { status: 400 })
    }
    const point = await prisma.pointDistribution.create({
      data: { nom, adresse, latitude: latitude ?? null, longitude: longitude ?? null },
    })
    return NextResponse.json(point, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erreur création' }, { status: 500 })
  }
}

// src/app/api/points/[id]/route.ts est géré séparément
