import mongoose from 'mongoose';
import { STATUSES } from '../utils/constants.js';

const statusChangeSchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const applicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    company: { type: String, required: true, trim: true, maxlength: 120 },
    position: { type: String, required: true, trim: true, maxlength: 120 },
    jobLink: { type: String, trim: true, maxlength: 2048, default: '' },
    salary: { type: String, trim: true, maxlength: 60, default: '' },
    location: { type: String, trim: true, maxlength: 120, default: '' },
    appliedDate: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: STATUSES, default: 'Applied' },
    statusHistory: { type: [statusChangeSchema], default: [] },
    notes: { type: String, maxlength: 5000, default: '' },
    resume: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', default: null },
    lastActivityAt: { type: Date, default: Date.now },
    lastFollowUpAt: { type: Date, default: null },
  },
  { timestamps: true },
);

applicationSchema.index({ user: 1, status: 1, lastActivityAt: 1 });
applicationSchema.index({ user: 1, appliedDate: -1 });

applicationSchema.pre('save', function trackStatus(next) {
  if (this.isNew || this.isModified('status')) {
    const last = this.statusHistory.at(-1);
    if (last?.status !== this.status) this.statusHistory.push({ status: this.status, changedAt: new Date() });
    if (!this.isNew) this.lastActivityAt = new Date();
  }
  next();
});

export const Application = mongoose.model('Application', applicationSchema);
