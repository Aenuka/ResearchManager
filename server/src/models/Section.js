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
  },
  { _id: false }
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
