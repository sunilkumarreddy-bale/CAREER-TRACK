import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

export const Resume = mongoose.model('Resume', resumeSchema);
