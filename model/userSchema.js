import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minLength: 3,
    maxLength: 30,
  },
  age: {
    type: Number,
    min: 10,
    max: 100,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxLength: 254,
  },
  password: {
    type: String,
    required: true,
    maxLength: 128,
  },
  sessionVersion: {
    type: Number,
    default: 0,
    min: 0,
  },
  passwordResetTokenHash: {
    type: String,
    default: null,
    select: false,
  },
  passwordResetExpiresAt: {
    type: Date,
    default: null,
  },
  passwordResetRequestedAt: {
    type: Date,
    default: null,
  },
  usage: {
    tokenUsed: {
      type: Number,
      default: 0,
    },
    tokenLimit: {
      type: Number,
      default: 10000,
    },
    resetAt: {
      type: Date,
      default: () => new Date(Date.now() + 5 * 60 * 60 * 1000),
    },
    totalTokenUsed: {
      type: Number,
      default: 0,
    },
  },
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

export default User;
