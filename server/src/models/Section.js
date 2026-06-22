const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    addedByName: { type: String, trim: true, default: '' },
    addedByEmail: { type: String, trim: true, lowercase: true, default: '' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    senderName: { type: String, trim: true, default: '' },
    senderEmail: { type: String, trim: true, lowercase: true, default: '' },
    createdAt: { type: Date, default: Date.now },
  }
);

const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    pdf: fileSchema,
    audio: fileSchema,
    pdfs: [fileSchema],
    audios: [fileSchema],
    images: [fileSchema],
    messages: [messageSchema],
    creatorName: { type: String, trim: true, default: '' },
    creatorEmail: { type: String, trim: true, lowercase: true, default: '' },
    updatedByName: { type: String, trim: true, default: '' },
    updatedByEmail: { type: String, trim: true, lowercase: true, default: '' },
  },
  { timestamps: true }
);

const sectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    creatorName: { type: String, trim: true, default: '' },
    creatorEmail: { type: String, trim: true, lowercase: true, default: '' },
    updatedByName: { type: String, trim: true, default: '' },
    updatedByEmail: { type: String, trim: true, lowercase: true, default: '' },
    resources: [resourceSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Section', sectionSchema);
