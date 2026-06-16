// src/app/api/chemins/route.ts
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const chemins = await prisma.chemin.findMany({
      where: { actif: true },
      include: {
        departPoint: true,
        arriveePoint: true,
      },
      orderBy: { distance: 'asc' },
    })
    return NextResponse.json(chemins)
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { departPointId, arriveePointId, distance } = await req.json()
    if (!arriveePointId || !distance) {
      return NextResponse.json({ error: 'Données incomplètes' }, { status: 400 })
    }
    if (departPointId === arriveePointId) {
      return NextResponse.json({ error: 'Départ et arrivée identiques' }, { status: 400 })
    }
    const chemin = await prisma.chemin.create({
      data: {
        departPointId: departPointId || null,
        arriveePointId,
        distance: parseFloat(distance),
      },
      include: { departPoint: true, arriveePoint: true },
    })
    return NextResponse.json(chemin, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erreur création' }, { status: 500 })
  }
}
