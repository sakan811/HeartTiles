import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { User } from "../models.js"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          // Connect to MongoDB
          await connectDB()

          const user = await User.findOne({ email: credentials.email })

          if (!user) {
            return null
          }

          const isPasswordValid = await user.comparePassword(credentials.password as string)

          if (!isPasswordValid) {
            return null
          }

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
          }
        } catch (error) {
          console.error("Auth error:", error)
          return null
        }
      }
    })
  ],
  trustHost: true,
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
      }
      return session
    }
  }
})

// Database connection function
async function connectDB() {
  try {
    const mongoose = await import('mongoose')
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/no-kitty-cards'

    if (mongoose.default.connection.readyState === 0) {
      await mongoose.default.connect(MONGODB_URI)
    }
  } catch (error) {
    console.error("Database connection error:", error)
    throw error
  }
}