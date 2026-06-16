// src/app/api/vehicules/route.ts
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { TypeVehicule } from '@prisma/client'

const VITESSES: Record<TypeVehicule, number> = {
  MOTO: 40,
  CAMIONNETTE: 30,
  CAMION: 25,
}
const CAPACITES: Record<TypeVehicule, number> = {
  MOTO: 1,
  CAMIONNETTE: 3,
  CAMION: 6,
}

export async function GET() {
  try {
    const vehicules = await prisma.vehicule.findMany({
      orderBy: [{ type: 'asc' }, { immatriculation: 'asc' }],
      include: {
        _count: { select: { livraisons: true } },
      },
    })
    return NextResponse.json(vehicules)
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { type, immatriculation } = await req.json()
    if (!type || !immatriculation) {
      return NextResponse.json({ error: 'Type et immatriculation requis' }, { status: 400 })
    }
    const vehicule = await prisma.vehicule.create({
      data: {
        type: type as TypeVehicule,
        immatriculation: immatriculation.toUpperCase(),
        vitesse: VITESSES[type as TypeVehicule],
        capacite: CAPACITES[type as TypeVehicule],
      },
    })
    return NextResponse.json(vehicule, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Immatriculation déjà utilisée' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erreur création' }, { status: 500 })
  }
}
