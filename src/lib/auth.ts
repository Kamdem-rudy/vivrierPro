// src/lib/auth.ts
export const dynamic = 'force-dynamic'
import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Identifiants',
      credentials: {
        email:      { label: 'Email',        type: 'email' },
        motDePasse: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.motDePasse) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })

        if (!user || !user.actif) return null

        const valide = await bcrypt.compare(credentials.motDePasse, user.motDePasse)
        if (!valide) return null

        return {
          id:    user.id,
          name:  user.nom,
          email: user.email,
          role:  user.role,
        }
      },
    }),
  ],

  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = (user as any).role
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id   = token.sub
        ;(session.user as any).role = token.role
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
}
