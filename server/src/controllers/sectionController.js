const fs = require('fs/promises');
const path = require('path');
const Section = require('../models/Section');

const uploadRoot = path.join(__dirname, '../../uploads');

function filePayload(file, folder, addedBy) {
  if (!file) return undefined;

  return {
    originalName: file.originalname,
    fileName: file.filename,
    mimeType: file.mimetype,
    size: file.size,
    url: `/uploads/${folder}/${file.filename}`,
    addedByName: addedBy?.name || '',
    addedByEmail: addedBy?.email || '',
    addedAt: new Date(),
  };
}

function filePayloads(files = [], folder, addedBy) {
  return files.map((file) => filePayload(file, folder, addedBy)).filter(Boolean);
}

function uploadedFiles(req, singular, plural) {
  return [...(req.files?.[singular] || []), ...(req.files?.[plural] || [])];
}

function removeFileFromList(files = [], fileUrl) {
  return files.filter((file) => file.url !== fileUrl);
}

function resourceFiles(resource) {
  return [
    resource.pdf,
    resource.audio,
    ...(resource.pdfs || []),
    ...(resource.audios || []),
    ...(resource.images || []),
  ].filter(Boolean);
}

async function removeUploadedFile(fileUrl) {
  if (!fileUrl?.startsWith('/uploads/')) return;

  const relativePath = fileUrl.replace(/^\/uploads\/+/, '');
  const absolutePath = path.resolve(uploadRoot, relativePath);
  const relativeUploadPath = path.relative(uploadRoot, absolutePath);

  if (relativeUploadPath.startsWith('..') || path.isAbsolute(relativeUploadPath)) return;

  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function getSections(req, res, next) {
  try {
    const sections = await Section.find().sort({ updatedAt: -1 });
    res.json(sections);
  } catch (error) {
    next(error);
  }
}

async function createSection(req, res, next) {
  try {
    const section = await Section.create({
      title: req.body.title,
      description: req.body.description,
      creatorName: req.user.name,
      creatorEmail: req.user.email,
      updatedByName: req.user.name,
      updatedByEmail: req.user.email,
    });

    res.status(201).json(section);
  } catch (error) {
    next(error);
  }
}

async function addResource(req, res, next) {
  try {
    const section = await Section.findById(req.params.sectionId);

    if (!section) {
      res.status(404).json({ message: 'Section not found' });
      return;
    }

    const resource = {
      title: req.body.title,
      description: req.body.description,
      pdfs: filePayloads(uploadedFiles(req, 'pdf', 'pdfs'), 'pdfs', req.user),
      audios: filePayloads(uploadedFiles(req, 'audio', 'audios'), 'audio', req.user),
      images: filePayloads(uploadedFiles(req, 'image', 'images'), 'images', req.user),
      creatorName: req.user.name,
      creatorEmail: req.user.email,
      updatedByName: req.user.name,
      updatedByEmail: req.user.email,
    };

    if (!resource.pdfs.length && !resource.audios.length && !resource.images.length) {
      res.status(400).json({ message: 'Upload at least one PDF, image, or recording.' });
      return;
    }

    section.resources.push(resource);
    section.updatedByName = req.user.name;
    section.updatedByEmail = req.user.email;
    await section.save();

    res.status(201).json(section);
  } catch (error) {
    next(error);
  }
}

async function updateResource(req, res, next) {
  try {
    const section = await Section.findById(req.params.sectionId);

    if (!section) {
      res.status(404).json({ message: 'Section not found' });
      return;
    }

    const resource = section.resources.id(req.params.resourceId);
    if (!resource) {
      res.status(404).json({ message: 'Resource not found' });
      return;
    }

    resource.title = req.body.title || resource.title;
    resource.description = req.body.description ?? resource.description;
    resource.pdfs = [
      ...(resource.pdfs || []),
      ...filePayloads(uploadedFiles(req, 'pdf', 'pdfs'), 'pdfs', req.user),
    ];
    resource.audios = [
      ...(resource.audios || []),
      ...filePayloads(uploadedFiles(req, 'audio', 'audios'), 'audio', req.user),
    ];
    resource.images = [
      ...(resource.images || []),
      ...filePayloads(uploadedFiles(req, 'image', 'images'), 'images', req.user),
    ];
    resource.updatedByName = req.user.name;
    resource.updatedByEmail = req.user.email;
    section.updatedByName = req.user.name;
    section.updatedByEmail = req.user.email;

    await section.save();

    res.json(section);
  } catch (error) {
    next(error);
  }
}

async function deleteSection(req, res, next) {
  try {
    const section = await Section.findByIdAndDelete(req.params.sectionId);

    if (!section) {
      res.status(404).json({ message: 'Section not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function deleteResource(req, res, next) {
  try {
    const section = await Section.findById(req.params.sectionId);

    if (!section) {
      res.status(404).json({ message: 'Section not found' });
      return;
    }

    const resource = section.resources.id(req.params.resourceId);
    if (!resource) {
      res.status(404).json({ message: 'Resource not found' });
      return;
    }
    const filesToRemove = resourceFiles(resource);

    section.resources.pull(req.params.resourceId);
    section.updatedByName = req.user.name;
    section.updatedByEmail = req.user.email;
    await section.save();
    await Promise.all(filesToRemove.map((file) => removeUploadedFile(file.url)));

    res.json(section);
  } catch (error) {
    next(error);
  }
}

async function deleteResourceFile(req, res, next) {
  try {
    const section = await Section.findById(req.params.sectionId);

    if (!section) {
      res.status(404).json({ message: 'Section not found' });
      return;
    }

    const resource = section.resources.id(req.params.resourceId);
    if (!resource) {
      res.status(404).json({ message: 'Resource not found' });
      return;
    }

    const fileUrl = req.body.fileUrl;
    if (!fileUrl) {
      res.status(400).json({ message: 'File URL is required.' });
      return;
    }

    const matchingFile = resourceFiles(resource).find((file) => file.url === fileUrl);

    if (!matchingFile) {
      res.status(404).json({ message: 'File not found.' });
      return;
    }

    if (resource.pdf?.url === fileUrl) resource.set('pdf', undefined);
    if (resource.audio?.url === fileUrl) resource.set('audio', undefined);
    resource.pdfs = removeFileFromList(resource.pdfs, fileUrl);
    resource.audios = removeFileFromList(resource.audios, fileUrl);
    resource.images = removeFileFromList(resource.images, fileUrl);
    resource.updatedByName = req.user.name;
    resource.updatedByEmail = req.user.email;
    section.updatedByName = req.user.name;
    section.updatedByEmail = req.user.email;

    await removeUploadedFile(fileUrl);
    await section.save();

    res.json(section);
  } catch (error) {
    next(error);
  }
}

async function addResourceMessage(req, res, next) {
  try {
    const section = await Section.findById(req.params.sectionId);

    if (!section) {
      res.status(404).json({ message: 'Section not found' });
      return;
    }

    const resource = section.resources.id(req.params.resourceId);
    if (!resource) {
      res.status(404).json({ message: 'Resource not found' });
      return;
    }

    const text = (req.body.text || '').trim();
    if (!text) {
      res.status(400).json({ message: 'Message cannot be empty.' });
      return;
    }

    if (text.length > 2000) {
      res.status(400).json({ message: 'Message must be 2000 characters or less.' });
      return;
    }

    resource.messages.push({
      text,
      senderName: req.user.name,
      senderEmail: req.user.email,
      createdAt: new Date(),
    });
    resource.updatedByName = req.user.name;
    resource.updatedByEmail = req.user.email;
    section.updatedByName = req.user.name;
    section.updatedByEmail = req.user.email;

    await section.save();

    res.status(201).json(section);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  addResourceMessage,
  addResource,
  createSection,
  deleteResourceFile,
  deleteResource,
  deleteSection,
  getSections,
  updateResource,
};
