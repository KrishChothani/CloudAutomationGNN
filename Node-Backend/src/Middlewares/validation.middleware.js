import { validationResult } from 'express-validator'
import { ApiError } from '../Utils/ApiError.js'

// Run validation and throw errors if any
export const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg)
    throw new ApiError(400, messages[0], errors.array())
  }
  next()
}