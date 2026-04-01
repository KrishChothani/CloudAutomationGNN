import { asyncHandler } from '../Utils/AsyncHandler.js'
import { ApiError } from '../Utils/ApiError.js'
import { ApiResponse } from '../Utils/ApiResponse.js'
import User from '../Models/user.model.js'
import jwt from 'jsonwebtoken'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
}

const generateTokens = async (userId) => {
  const user = await User.findById(userId)
  const accessToken = user.generateAccessToken()
  const refreshToken = user.generateRefreshToken()
  user.refreshToken = refreshToken
  await user.save({ validateBeforeSave: false })
  return { accessToken, refreshToken }
}

// ─── POST /users/register ─────────────────────────────────────────────────────
export const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body

  if (!fullName || !email || !password) {
    throw new ApiError(400, 'fullName, email and password are required')
  }

  const existingUser = await User.findOne({ email })
  if (existingUser) throw new ApiError(409, 'Email already registered')

  const user = await User.create({ fullName, email, password })
  const { accessToken, refreshToken } = await generateTokens(user._id)

  const safeUser = { _id: user._id, fullName: user.fullName, email: user.email, role: user.role }

  return res
    .status(201)
    .cookie('accessToken', accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 })
    .cookie('refreshToken', refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json(new ApiResponse(201, { user: safeUser, accessToken }, 'User registered successfully'))
})

// ─── POST /users/login ────────────────────────────────────────────────────────
export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) throw new ApiError(400, 'Email and password required')

  const user = await User.findOne({ email })
  if (!user) throw new ApiError(401, 'Invalid credentials')

  const isPasswordValid = await user.isPasswordCorrect(password)
  if (!isPasswordValid) throw new ApiError(401, 'Invalid credentials')

  user.lastLoginAt = new Date()
  await user.save({ validateBeforeSave: false })

  const { accessToken, refreshToken } = await generateTokens(user._id)
  const safeUser = { _id: user._id, fullName: user.fullName, email: user.email, role: user.role }

  return res
    .status(200)
    .cookie('accessToken', accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 })
    .cookie('refreshToken', refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json(new ApiResponse(200, { user: safeUser, accessToken }, 'Login successful'))
})

// ─── POST /users/logout ───────────────────────────────────────────────────────
export const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } })
  return res
    .status(200)
    .clearCookie('accessToken', COOKIE_OPTIONS)
    .clearCookie('refreshToken', COOKIE_OPTIONS)
    .json(new ApiResponse(200, {}, 'Logout successful'))
})

// ─── POST /users/refresh-token ────────────────────────────────────────────────
export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken
  if (!incomingToken) throw new ApiError(401, 'Refresh token missing')

  const decoded = jwt.verify(incomingToken, process.env.REFRESH_TOKEN_SECRET)
  const user = await User.findById(decoded._id)

  if (!user || user.refreshToken !== incomingToken) {
    throw new ApiError(401, 'Invalid or expired refresh token')
  }

  const { accessToken, refreshToken } = await generateTokens(user._id)

  return res
    .status(200)
    .cookie('accessToken', accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 })
    .cookie('refreshToken', refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json(new ApiResponse(200, { accessToken }, 'Token refreshed'))
})

// ─── GET /users/me ────────────────────────────────────────────────────────────
export const getCurrentUser = asyncHandler(async (req, res) => {
  return res.status(200).json(new ApiResponse(200, { user: req.user }, 'Current user fetched'))
})
