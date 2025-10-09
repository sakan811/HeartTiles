import { NextRequest, NextResponse } from "next/server"
import { User } from "../../../../../models"

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json()

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long" },
        { status: 400 }
      )
    }

    // Connect to MongoDB
    const mongoose = await import('mongoose')
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/no-kitty-cards'

    if (mongoose.default.connection.readyState === 0) {
      await mongoose.default.connect(MONGODB_URI)
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email })

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      )
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
    })

    await user.save()

    return NextResponse.json(
      { message: "User created successfully" },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Signup error:", error)

    // Handle duplicate key error (email already exists)
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "An error occurred during signup" },
      { status: 500 }
    )
  }
}