import mongoose from 'mongoose';
import { INTERVIEW_MODES, INTERVIEW_OUTCOMES, INTERVIEW_ROUNDS } from '../utils/constants.js';

const interviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    round: { type: String, enum: INTERVIEW_ROUNDS, required: true },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, min: 5, max: 600, default: 60 },
    mode: { type: String, enum: INTERVIEW_MODES, default: 'Online' },
    location: { type: String, trim: true, maxlength: 2048, default: '' },
    notes: { type: String, maxlength: 5000, default: '' },
    outcome: { type: String, enum: INTERVIEW_OUTCOMES, default: 'Pending' },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

interviewSchema.index({ user: 1, scheduledAt: 1 });
interviewSchema.index({ scheduledAt: 1, reminderSentAt: 1 });

export const Interview = mongoose.model('Interview', interviewSchema);
