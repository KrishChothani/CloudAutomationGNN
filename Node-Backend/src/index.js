import dotenv from 'dotenv'
dotenv.config()

import connectDB from './db/index.js'
import app from './app.js'

import dns from "node:dns/promises";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const PORT = process.env.PORT || 5000

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 CloudAutomationGNN API running on port ${PORT}`)
      console.log(`   Health: http://localhost:${PORT}/health`)
      console.log(`   Env:    ${process.env.NODE_ENV || 'development'}\n`)
    })
  })
  .catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
