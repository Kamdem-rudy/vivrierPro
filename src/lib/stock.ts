// src/lib/stock.ts

import { prisma } from '@/lib/prisma'
import { TypeMouvement } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StockInfo {
  id: string
  produitId: string
  nomProduit: string
  unite: string
  quantiteDisponible: number
  quantiteReservee: number
  quantiteLibre: number          // Disponible - Réservée = ce qu'on peut encore commander
  seuilAlerte: number
  enAlerte: boolean
  version: number
}

export interface ReservationResult {
  success: true
  nouvelleVersion: number
  quantiteLibreRestante: number
}

export type ErreurStock =
  | { code: 'STOCK_INEXISTANT'; message: string }
  | { code: 'STOCK_INSUFFISANT'; message: string; dispo: number; demande: number; unite: string }
  | { code: 'CONFLIT_EPUISE'; message: string; tentatives: number }
  | { code: 'PRODUIT_INACTIF'; message: string }

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_TENTATIVES = 3         // Nombre max de retries en cas de conflit
const DELAI_BASE_MS   = 50       // Délai de base entre les retries (ms)

// ─── Fonctions publiques ──────────────────────────────────────────────────────

/**
 * Récupère l'état complet du stock pour tous les produits
 */
export async function lireStocks(): Promise<StockInfo[]> {
  const stocks = await prisma.stock.findMany({
    include: { produit: true },
    orderBy: { produit: { nom: 'asc' } },
  })
  return stocks.map(toStockInfo)
}

/**
 * Récupère l'état du stock d'un produit spécifique
 */
export async function lireStock(produitId: string): Promise<StockInfo | null> {
  const stock = await prisma.stock.findUnique({
    where: { produitId },
    include: { produit: true },
  })
  return stock ? toStockInfo(stock) : null
}

/**
 * RÉSERVATION DE STOCK avec verrouillage optimiste
 *
 * Garantit qu'une quantité demandée par plusieurs utilisateurs simultanément
 * ne sera accordée qu'une seule fois par unité de stock.
 *
 * @returns ReservationResult en cas de succès
 * @throws ErreurStock si échec
 */
export async function reserverStock(
  produitId: string,
  quantite: number,
  commandeId: string,
  descriptionMouvement: string
): Promise<ReservationResult> {
  let tentative = 0

  while (tentative < MAX_TENTATIVES) {
    tentative++

    // ── ÉTAPE 1 : Lecture de l'état actuel (hors transaction) ─────────────────
    const stock = await prisma.stock.findUnique({
      where: { produitId },
      include: { produit: true },
    })

    if (!stock) {
      throw { code: 'STOCK_INEXISTANT', message: `Aucun stock trouvé pour ce produit` } as ErreurStock
    }

    if (!stock.produit.actif) {
      throw { code: 'PRODUIT_INACTIF', message: `Le produit "${stock.produit.nom}" n'est plus disponible` } as ErreurStock
    }

    const quantiteLibre = stock.quantiteDisponible - stock.quantiteReservee

    if (quantiteLibre < quantite) {
      throw {
        code: 'STOCK_INSUFFISANT',
        message: `Stock insuffisant pour "${stock.produit.nom}". Disponible : ${quantiteLibre} ${stock.produit.unite}, demandé : ${quantite} ${stock.produit.unite}`,
        dispo: quantiteLibre,
        demande: quantite,
        unite: stock.produit.unite,
      } as ErreurStock
    }

    // ── ÉTAPE 2 : Transaction atomique avec vérification de version ───────────
   
    try {
      const stockVersionLue = stock.version
      const nouvelleVersion = stockVersionLue + 1

      const result = await prisma.$transaction(async (tx) => {
        // Tentative d'écriture conditionnelle sur la version
        const mise_a_jour = await tx.stock.updateMany({
          where: {
            produitId,
            version: stockVersionLue,                          // ← VERROU OPTIMISTE
            quantiteDisponible: {
              gte: stock.quantiteReservee + quantite,          // ← DOUBLE SÉCURITÉ
            },
          },
          data: {
            quantiteReservee: { increment: quantite },
            version: nouvelleVersion,
          },
        })

        // 0 lignes → conflict (quelqu'un d'autre a écrit entre la lecture et ici)
        if (mise_a_jour.count === 0) {
          throw new Error('__CONFLIT__')
        }

        // Enregistrer le mouvement dans l'historique
        await tx.mouvementStock.create({
          data: {
            stockId: stock.id,
            type: TypeMouvement.RESERVATION,
            quantite,
            description: descriptionMouvement,
            versionApres: nouvelleVersion,
            commandeId,
          },
        })

        return { nouvelleVersion, quantiteLibreRestante: quantiteLibre - quantite }
      })

      // ✅ Succès
      return { success: true, ...result }

    } catch (err: any) {
      if (err?.message === '__CONFLIT__') {
        // Conflit détecté → attente exponentielle avant retry
        if (tentative < MAX_TENTATIVES) {
          const delai = DELAI_BASE_MS * Math.pow(2, tentative - 1)
          console.warn(`[Stock] Conflit tentative ${tentative}/${MAX_TENTATIVES} — retry dans ${delai}ms`)
          await sleep(delai)
          continue
        }
        // Toutes les tentatives épuisées
        throw {
          code: 'CONFLIT_EPUISE',
          message: `Conflit de stock après ${MAX_TENTATIVES} tentatives. Ce produit est très demandé, réessayez dans quelques secondes.`,
          tentatives: MAX_TENTATIVES,
        } as ErreurStock
      }
      throw err
    }
  }

  // Ne devrait jamais arriver
  throw { code: 'CONFLIT_EPUISE', message: 'Erreur inattendue', tentatives: tentative } as ErreurStock
}

/**
 * LIBÉRATION de stock réservé (annulation de commande)
 */
export async function libererStock(
  produitId: string,
  quantite: number,
  commandeId: string
): Promise<void> {
  const stock = await prisma.stock.findUnique({ where: { produitId } })
  if (!stock) return

  const nouvelleVersion = stock.version + 1

  await prisma.$transaction(async (tx) => {
    await tx.stock.update({
      where: { id: stock.id },
      data: {
        quantiteReservee: { decrement: Math.min(quantite, stock.quantiteReservee) },
        version: nouvelleVersion,
      },
    })
    await tx.mouvementStock.create({
      data: {
        stockId: stock.id,
        type: TypeMouvement.LIBERATION,
        quantite,
        description: `Libération suite à annulation`,
        versionApres: nouvelleVersion,
        commandeId,
      },
    })
  })
}

/**
 * DÉDUCTION DÉFINITIVE lors de la livraison effective
 * Diminue à la fois quantiteDisponible ET quantiteReservee
 */
export async function deduireStockLivraison(
  produitId: string,
  quantite: number,
  commandeId: string
): Promise<void> {
  const stock = await prisma.stock.findUnique({ where: { produitId } })
  if (!stock) return

  const nouvelleVersion = stock.version + 1

  await prisma.$transaction(async (tx) => {
    await tx.stock.update({
      where: { id: stock.id },
      data: {
        quantiteDisponible: { decrement: quantite },
        quantiteReservee:   { decrement: Math.min(quantite, stock.quantiteReservee) },
        version: nouvelleVersion,
      },
    })
    await tx.mouvementStock.create({
      data: {
        stockId: stock.id,
        type: TypeMouvement.LIVRAISON,
        quantite,
        description: `Livraison effective`,
        versionApres: nouvelleVersion,
        commandeId,
      },
    })
  })
}

/**
 * APPROVISIONNEMENT (admin) — ajoute du stock physique
 */
export async function approvisionnerStock(
  produitId: string,
  quantite: number,
  description?: string
): Promise<StockInfo> {
  const stock = await prisma.stock.findUnique({
    where: { produitId },
    include: { produit: true },
  })
  if (!stock) throw new Error('Stock introuvable')

  const nouvelleVersion = stock.version + 1

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.stock.update({
      where: { id: stock.id },
      data: {
        quantiteDisponible: { increment: quantite },
        version: nouvelleVersion,
      },
      include: { produit: true },
    })
    await tx.mouvementStock.create({
      data: {
        stockId: stock.id,
        type: TypeMouvement.ENTREE,
        quantite,
        description: description || 'Approvisionnement',
        versionApres: nouvelleVersion,
      },
    })
    return s
  })

  return toStockInfo(updated)
}

// ─── Helpers privés ───────────────────────────────────────────────────────────

function toStockInfo(stock: any): StockInfo {
  const libre = stock.quantiteDisponible - stock.quantiteReservee
  return {
    id: stock.id,
    produitId: stock.produitId,
    nomProduit: stock.produit.nom,
    unite: stock.produit.unite,
    quantiteDisponible: stock.quantiteDisponible,
    quantiteReservee: stock.quantiteReservee,
    quantiteLibre: Math.max(0, libre),
    seuilAlerte: stock.seuilAlerte,
    enAlerte: libre <= stock.seuilAlerte,
    version: stock.version,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
