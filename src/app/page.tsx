// src/app/page.tsx
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import { StatutCommande, StatutLivraison } from '@prisma/client'
import GraphWrapper from '@/components/graph/GraphWrapper'
import StatsCard from '@/components/ui/StatsCard'
import FenetreCommandeWidget from '@/components/ui/FenetreCommandeWidget'
import { formatDistance, formatDuree } from '@/lib/utils'
import {
  Package,
  Truck,
  MapPin,
  TrendingUp,
  AlertTriangle
} from 'lucide-react'

async function getDashboardData() {
  const [
    totalPoints,
    totalCommandes,
    commandesEnAttente,
    livraisonsEnCours,
    livraisonsTerminees,
    points,
    chemins,
    vehicules,
    stocks,
  ] = await Promise.all([
    prisma.pointDistribution.count({ where: { actif: true } }),
    prisma.commande.count(),
    prisma.commande.count({ where: { statut: StatutCommande.EN_ATTENTE } }),
    prisma.livraison.count({ where: { statut: StatutLivraison.EN_COURS } }),
    prisma.livraison.count({ where: { statut: StatutLivraison.TERMINEE } }),
    prisma.pointDistribution.findMany({ where: { actif: true } }),
    prisma.chemin.findMany({ where: { actif: true }, include: { arriveePoint: true } }),
    prisma.vehicule.findMany(),
    prisma.stock.findMany({ include: { produit: true } }),
  ])

  const distanceTotaleLivree = await prisma.livraison.aggregate({
    where: { statut: StatutLivraison.TERMINEE },
    _sum: { distanceTotale: true },
  })

  return {
    totalPoints,
    totalCommandes,
    commandesEnAttente,
    livraisonsEnCours,
    livraisonsTerminees,
    points,
    chemins,
    vehicules,
    distanceTotaleLivree: distanceTotaleLivree._sum.distanceTotale ?? 0,
    stocks,
    stocksEnAlerte: stocks.filter(s => (s.quantiteDisponible - s.quantiteReservee) <= s.seuilAlerte),
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  const graphNodes = [
    { id: 'ENTREPOT', label: 'Entrepôt', isEntrepot: true },
    ...data.points.map(p => ({ id: p.id, label: p.nom, isEntrepot: false })),
  ]

  const graphEdges = data.chemins.map(c => ({
    id: c.id,
    source: c.departPointId ?? 'ENTREPOT',
    target: c.arriveePointId,
    distance: c.distance,
  }))

  const stats = [
    {
      label: 'Points actifs',
      value: data.totalPoints,
      icon: 'MapPin',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      change: '+2 ce mois',
    },
    {
      label: 'Commandes en attente',
      value: data.commandesEnAttente,
      icon: 'Package',
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      change: 'À traiter',
    },
    {
      label: 'Livraisons en cours',
      value: data.livraisonsEnCours,
      icon: 'Truck',
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      change: 'Temps réel',
    },
    {
      label: 'Distance totale livrée',
      value: formatDistance(data.distanceTotaleLivree),
      icon: 'TrendingUp',
      color: 'text-green-600',
      bg: 'bg-green-50',
      change: `${data.livraisonsTerminees} tournées`,
    },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tableau de bord</h1>
          <p className="text-slate-500 text-sm mt-1">
            Vue d&apos;ensemble de la plateforme logistique vivrier
          </p>
        </div>
        <FenetreCommandeWidget />
      </div>

      {/* Alerte stock bas */}
      {data.stocksEnAlerte.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">
              {data.stocksEnAlerte.length} produit{data.stocksEnAlerte.length > 1 ? 's' : ''} en alerte de stock bas
            </p>
            <p className="text-sm text-amber-700">
              {data.stocksEnAlerte.map(s => s.produit.nom).join(' · ')} — Approvisionner dans Administration &gt; Stocks
            </p>
          </div>
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <StatsCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Graphe + infos */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Graphe principal */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Réseau de distribution</h2>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-green-600 inline-block" />
                  Entrepôt
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                  Point actif
                </span>
              </div>
            </div>
            <GraphWrapper nodes={graphNodes} edges={graphEdges} height={420} />
          </div>
        </div>

        {/* Panneau latéral */}
        <div className="flex flex-col gap-4">
          {/* Stock résumé */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-500" />
              Stocks disponibles
            </h3>
            <div className="space-y-2">
              {data.stocks.slice(0, 5).map(s => {
                const libre = s.quantiteDisponible - s.quantiteReservee
                const pct = s.quantiteDisponible > 0 ? Math.round((libre / s.quantiteDisponible) * 100) : 0
                const alerte = libre <= s.seuilAlerte
                return (
                  <div key={s.id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-700 font-medium">{s.produit.nom}</span>
                      <span className={alerte ? 'text-amber-600 font-semibold' : 'text-slate-500'}>
                        {libre} {s.produit.unite}
                        {alerte && ' ⚠️'}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${alerte ? 'bg-amber-400' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Véhicules */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4 text-slate-500" />
              Flotte de véhicules
            </h3>
            <div className="space-y-2">
              {data.vehicules.map(v => (
                <div key={v.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{v.immatriculation}</p>
                    <p className="text-xs text-slate-500">{v.type} · {v.vitesse} km/h</p>
                  </div>
                  <span className={`badge ${v.disponible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {v.disponible ? 'Dispo' : 'Occupé'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Points de distribution */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex-1">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-500" />
              Points de distribution
            </h3>
            <div className="space-y-2">
              {data.points.map(p => (
                <div key={p.id} className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.nom}</p>
                    <p className="text-xs text-slate-500">{p.adresse}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
