// src/app/api/chemins/[id]/route.ts
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await req.json()
    const chemin = await prisma.chemin.update({
      where: { id: params.id },
      data: { distance: parseFloat(data.distance), actif: data.actif },
    })
    return NextResponse.json(chemin)
  } catch {
    return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.chemin.update({
      where: { id: params.id },
      data: { actif: false },
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  }
}
