const Section = require('../models/Section');

function filePayload(file, folder) {
  if (!file) return undefined;

  return {
    originalName: file.originalname,
    fileName: file.filename,
    mimeType: file.mimetype,
    size: file.size,
    url: `/uploads/${folder}/${file.filename}`,
  };
}

function filePayloads(files = [], folder) {
  return files.map((file) => filePayload(file, folder)).filter(Boolean);
}

function uploadedFiles(req, singular, plural) {
  return [...(req.files?.[singular] || []), ...(req.files?.[plural] || [])];
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
      pdfs: filePayloads(uploadedFiles(req, 'pdf', 'pdfs'), 'pdfs'),
      audios: filePayloads(uploadedFiles(req, 'audio', 'audios'), 'audio'),
      images: filePayloads(uploadedFiles(req, 'image', 'images'), 'images'),
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
      ...filePayloads(uploadedFiles(req, 'pdf', 'pdfs'), 'pdfs'),
    ];
    resource.audios = [
      ...(resource.audios || []),
      ...filePayloads(uploadedFiles(req, 'audio', 'audios'), 'audio'),
    ];
    resource.images = [
      ...(resource.images || []),
      ...filePayloads(uploadedFiles(req, 'image', 'images'), 'images'),
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

    section.resources.pull(req.params.resourceId);
    section.updatedByName = req.user.name;
    section.updatedByEmail = req.user.email;
    await section.save();

    res.json(section);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  addResource,
  createSection,
  deleteResource,
  deleteSection,
  getSections,
  updateResource,
};
