// src/app/api/points/[id]/route.ts
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await req.json()
    const point = await prisma.pointDistribution.update({
      where: { id: params.id },
      data,
    })
    return NextResponse.json(point)
  } catch {
    return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Désactiver plutôt que supprimer pour garder l'historique
    const point = await prisma.pointDistribution.update({
      where: { id: params.id },
      data: { actif: false },
    })
    // Désactiver aussi les chemins associés
    await prisma.chemin.updateMany({
      where: {
        OR: [
          { departPointId: params.id },
          { arriveePointId: params.id },
        ],
      },
      data: { actif: false },
    })
    return NextResponse.json(point)
  } catch {
    return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  }
}
