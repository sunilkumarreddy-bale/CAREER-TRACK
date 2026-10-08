import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    password: { type: String, required: true, select: false },
    // Incremented to invalidate every issued JWT (password change, "log out everywhere").
    tokenVersion: { type: Number, default: 0, select: false },
    settings: {
      followUpDays: { type: Number, default: 7, min: 1, max: 60 },
      emailReminders: { type: Boolean, default: false },
    },
    lastDigestAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword() {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    settings: this.settings,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
