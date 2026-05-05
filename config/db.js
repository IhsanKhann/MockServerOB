"use strict";
/**
 * config/db.js — MongoDB Atlas connection (Mongoose)
 */

const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("[DB] MONGO_URI is not set in environment");

  try {
    await mongoose.connect(uri, {
      // These options are defaults in Mongoose 7+ but kept explicit for clarity
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS:          45000,
    });
    console.log(`[DB] Connected to MongoDB Atlas — db: ${mongoose.connection.name}`);

    mongoose.connection.on("disconnected", () =>
      console.warn("[DB] MongoDB disconnected — attempting to reconnect...")
    );
    mongoose.connection.on("reconnected", () =>
      console.log("[DB] MongoDB reconnected")
    );
    mongoose.connection.on("error", (err) =>
      console.error("[DB] MongoDB connection error:", err.message)
    );
  } catch (err) {
    console.error("[DB] Initial connection failed:", err.message);
    process.exit(1);
  }
};

module.exports = { connectDB };