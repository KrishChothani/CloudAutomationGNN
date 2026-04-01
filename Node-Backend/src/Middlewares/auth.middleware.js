import jwt from 'jsonwebtoken'
import { ApiError } from '../Utils/ApiError.js'
import { asyncHandler } from '../Utils/AsyncHandler.js'
import User from '../Models/user.model.js'

export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header('Authorization')?.replace('Bearer ', '')

  if (!token) {
    throw new ApiError(401, 'Unauthorized: No token provided')
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    const user = await User.findById(decoded._id).select('-password -refreshToken')

    if (!user) {
      throw new ApiError(401, 'Unauthorized: User not found')
    }

    req.user = user
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Token expired')
    }
    throw new ApiError(401, 'Unauthorized: Invalid token')
  }
})
