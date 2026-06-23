import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './App.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function normalizeApiBase(value) {
  return (value || 'http://localhost:5001')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/+$/, '');
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);
const AUTH_STORAGE_KEY = 'research-manager-auth';
const CHATGPT_RESEARCH_PROMPT =
  'Act as an research paper reading student. Translate the following research paper section into clear, simple English while preserving the original meaning. if there is any technical terms, academic jargon, formulas, models, and difficult english words, please explain them with simple dictionary definitions.keep that same word limit. no need for long text';
const PDF_ZOOM_MIN = 0.7;
const PDF_ZOOM_MAX = 2.6;
const PDF_ZOOM_STEP = 0.15;

const emptySection = {
  title: '',
  description: '',
};

const emptyResource = {
  title: '',
  description: '',
  pdfs: [],
  audios: [],
  images: [],
};

const emptyAuthForm = {
  email: '',
  password: '',
};

const emptyChatForm = {
  text: '',
};

function formatBytes(size = 0) {
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatDateTime(value) {
  if (!value) return 'Unknown date';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getAudioExtension(mimeType = '') {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

function getSupportedAudioMimeType() {
  if (!window.MediaRecorder) return '';

  const options = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];

  return options.find((type) => window.MediaRecorder.isTypeSupported(type)) || '';
}

function getResourcePdfs(resource) {
  return [...(resource.pdfs || []), ...(resource.pdf ? [resource.pdf] : [])];
}

function getResourceAudios(resource) {
  return [...(resource.audios || []), ...(resource.audio ? [resource.audio] : [])];
}

function getResourceImages(resource) {
  return resource.images || [];
}

function getResourceMessages(resource) {
  return resource.messages || [];
}

function getFileName(file, fallback) {
  return file.originalName || file.name || file.fileName || fallback;
}

function getFileAddedBy(file, resource) {
  return file.addedByName || file.addedByEmail || resource.creatorName || resource.creatorEmail || 'Unknown';
}

function getFileAddedAt(file, resource) {
  return file.addedAt || resource.createdAt;
}

function getInitials(value = 'Unknown') {
  const words = value
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);

  return (words[0]?.[0] || 'U').toUpperCase();
}

function getMessageSender(message) {
  return message.senderName || message.senderEmail || 'Unknown';
}

function getMessageSenderEmail(message) {
  return message.senderEmail || '';
}

function getMessageCreatedAt(message) {
  return message.createdAt;
}

function getResourceFiles(resource) {
  return [
    ...getResourceImages(resource),
    ...getResourcePdfs(resource),
    ...getResourceAudios(resource),
  ];
}

function getResourceCounts(resource) {
  return {
    images: getResourceImages(resource).length,
    pdfs: getResourcePdfs(resource).length,
    audios: getResourceAudios(resource).length,
    messages: getResourceMessages(resource).length,
    total: getResourceFiles(resource).length,
  };
}

function getResourceChatItems(resource) {
  return [
    ...getResourceMessages(resource).map((message) => ({
      id: message._id || `${message.createdAt}-${message.text}`,
      type: 'message',
      createdAt: getMessageCreatedAt(message),
      sender: getMessageSender(message),
      senderEmail: getMessageSenderEmail(message),
      message,
    })),
    ...getResourceAudios(resource).map((audio) => ({
      id: audio.url,
      type: 'audio',
      createdAt: getFileAddedAt(audio, resource),
      sender: getFileAddedBy(audio, resource),
      senderEmail: audio.addedByEmail || '',
      audio,
    })),
  ].sort((first, second) => {
    const firstTime = new Date(first.createdAt || 0).getTime();
    const secondTime = new Date(second.createdAt || 0).getTime();
    return firstTime - secondTime;
  });
}

function buildChatGptUrl(selectedText) {
  const prompt = `${CHATGPT_RESEARCH_PROMPT}\n\n${selectedText}`;
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

function PdfPage({ page, pageNumber, scale }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [renderError, setRenderError] = useState('');

  useEffect(() => {
    let isCancelled = false;
    let renderTask = null;
    let textLayer = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      if (!canvas || !textLayerDiv) return;

      try {
        setRenderError('');
        const viewport = page.getViewport({ scale });
        const pixelRatio = window.devicePixelRatio || 1;
        const context = canvas.getContext('2d');

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        textLayerDiv.replaceChildren();

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;

        if (isCancelled) return;

        textLayer = new pdfjsLib.TextLayer({
          container: textLayerDiv,
          textContentSource: page.streamTextContent({
            includeMarkedContent: true,
            disableNormalization: true,
          }),
          viewport,
        });
        await textLayer.render();
      } catch (error) {
        if (!isCancelled && error.name !== 'RenderingCancelledException') {
          setRenderError(error.message || 'Unable to render this page.');
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [page, scale]);

  return (
    <article className="pdf-page" aria-label={`Page ${pageNumber}`}>
      <div className="pdf-page-number">Page {pageNumber}</div>
      {renderError ? <div className="status-line">{renderError}</div> : null}
      <div className="pdf-page-canvas-wrap">
        <canvas ref={canvasRef} />
        <div className="textLayer" ref={textLayerRef} />
      </div>
    </article>
  );
}

function matchesResourceSearch(resource, searchTerm) {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return true;

  const searchableText = [
    resource.title,
    resource.description,
    ...getResourceMessages(resource).map((message) => message.text),
    ...getResourceFiles(resource).map((file) => getFileName(file, '')),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes(query);
}

function readStoredAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)) || { token: '', user: null };
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return { token: '', user: null };
  }
}

function App() {
  const [auth, setAuth] = useState(readStoredAuth);
  const [authForm, setAuthForm] = useState(emptyAuthForm);
  const [sections, setSections] = useState([]);
  const [activeSectionId, setActiveSectionId] = useState('');
  const [sectionForm, setSectionForm] = useState(emptySection);
  const [resourceForm, setResourceForm] = useState(emptyResource);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [chatResourceId, setChatResourceId] = useState('');
  const [chatForm, setChatForm] = useState(emptyChatForm);
  const [editingResourceId, setEditingResourceId] = useState('');
  const [recordingStatus, setRecordingStatus] = useState('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrls, setRecordedAudioUrls] = useState([]);
  const [chatRecordingStatus, setChatRecordingStatus] = useState('idle');
  const [chatRecordingSeconds, setChatRecordingSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(Boolean(auth.token));
  const [isSavingSection, setIsSavingSection] = useState(false);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isUploadingChatAudio, setIsUploadingChatAudio] = useState(false);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pdfReader, setPdfReader] = useState({
    file: null,
    title: '',
    pages: [],
    totalPages: 0,
    status: 'idle',
    error: '',
    selectedText: '',
    zoom: 1.35,
    isFullscreen: false,
  });
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const streamRef = useRef(null);
  const chatMediaRecorderRef = useRef(null);
  const chatRecordingChunksRef = useRef([]);
  const chatStreamRef = useRef(null);
  const pdfDocumentRef = useRef(null);

  const activeSection = useMemo(
    () => sections.find((section) => section._id === activeSectionId) || sections[0],
    [activeSectionId, sections]
  );

  const dashboardStats = useMemo(() => {
    const resources = sections.flatMap((section) => section.resources || []);

    return {
      sections: sections.length,
      resources: resources.length,
      pdfs: resources.reduce((total, resource) => total + getResourcePdfs(resource).length, 0),
      recordings: resources.reduce(
        (total, resource) => total + getResourceAudios(resource).length,
        0
      ),
      images: resources.reduce((total, resource) => total + getResourceImages(resource).length, 0),
    };
  }, [sections]);

  const visibleResources = useMemo(
    () => (activeSection?.resources || []).filter((resource) => matchesResourceSearch(resource, searchTerm)),
    [activeSection, searchTerm]
  );

  const activeSectionFileCount = useMemo(
    () => (activeSection?.resources || []).reduce(
      (total, resource) => total + getResourceFiles(resource).length,
      0
    ),
    [activeSection]
  );

  const activeChatResource = useMemo(
    () => (activeSection?.resources || []).find((resource) => resource._id === chatResourceId),
    [activeSection, chatResourceId]
  );

  const isLoggedIn = Boolean(auth.token);

  function saveAuth(nextAuth) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
    setAuth(nextAuth);
  }

  function logout(messageText = 'Logged out.') {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuth({ token: '', user: null });
    setSections([]);
    setActiveSectionId('');
    setMessage(messageText);
  }

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});

    if (auth.token) {
      headers.set('Authorization', `Bearer ${auth.token}`);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      logout('Please log in again.');
    }

    return response;
  }

  async function loadSections() {
    if (!auth.token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch('/api/sections');
      if (!response.ok) throw new Error('Unable to load sections');
      const data = await response.json();
      setSections(data);
      setActiveSectionId((current) => current || data[0]?._id || '');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.token) return undefined;

    const timeoutId = window.setTimeout(() => {
      loadSections();
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token]);

  useEffect(() => {
    if (recordingStatus !== 'recording') return undefined;

    const intervalId = window.setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [recordingStatus]);

  useEffect(() => {
    if (chatRecordingStatus !== 'recording') return undefined;

    const intervalId = window.setInterval(() => {
      setChatRecordingSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [chatRecordingStatus]);

  useEffect(
    () => () => {
      recordedAudioUrls.forEach((url) => URL.revokeObjectURL(url));
      streamRef.current?.getTracks().forEach((track) => track.stop());
      chatStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [recordedAudioUrls]
  );

  useEffect(() => {
    if (!pdfReader.file) return undefined;

    function updateSelectedPdfText() {
      const selection = window.getSelection();
      const documentElement = pdfDocumentRef.current;

      if (!selection || selection.isCollapsed || !documentElement) {
        setPdfReader((current) => ({ ...current, selectedText: '' }));
        return;
      }

      const selectedInsidePdf =
        documentElement.contains(selection.anchorNode) &&
        documentElement.contains(selection.focusNode);

      setPdfReader((current) => ({
        ...current,
        selectedText: selectedInsidePdf ? selection.toString().trim() : '',
      }));
    }

    document.addEventListener('selectionchange', updateSelectedPdfText);

    return () => {
      document.removeEventListener('selectionchange', updateSelectedPdfText);
    };
  }, [pdfReader.file]);

  function resetResourceModal() {
    recordedAudioUrls.forEach((url) => URL.revokeObjectURL(url));
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recordingChunksRef.current = [];
    setResourceForm(emptyResource);
    setRecordedAudioUrls([]);
    setRecordingSeconds(0);
    setRecordingStatus('idle');
    setEditingResourceId('');
  }

  function openAddResourceModal() {
    resetResourceModal();
    setIsResourceModalOpen(true);
  }

  function openEditResourceModal(resource) {
    resetResourceModal();
    setResourceForm({
      title: resource.title,
      description: resource.description || '',
      pdfs: [],
      audios: [],
      images: [],
    });
    setEditingResourceId(resource._id);
    setIsResourceModalOpen(true);
  }

  function closeResourceModal() {
    resetResourceModal();
    setIsResourceModalOpen(false);
  }

  function openChat(resourceId) {
    setChatResourceId(resourceId);
    setChatForm(emptyChatForm);
  }

  function closeChat() {
    if (chatMediaRecorderRef.current?.state === 'recording') {
      chatMediaRecorderRef.current.stop();
    }

    chatStreamRef.current?.getTracks().forEach((track) => track.stop());
    chatStreamRef.current = null;
    chatRecordingChunksRef.current = [];
    setChatResourceId('');
    setChatForm(emptyChatForm);
    setChatRecordingStatus('idle');
    setChatRecordingSeconds(0);
  }

  function closePdfReader() {
    window.getSelection()?.removeAllRanges();

    setPdfReader({
      file: null,
      title: '',
      pages: [],
      totalPages: 0,
      status: 'idle',
      error: '',
      selectedText: '',
      zoom: 1.35,
      isFullscreen: false,
    });
  }

  function changePdfZoom(delta) {
    setPdfReader((current) => ({
      ...current,
      zoom: Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, current.zoom + delta)),
    }));
  }

  function handlePdfWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    const zoomDelta = Math.max(-0.25, Math.min(0.25, -event.deltaY * 0.002));
    changePdfZoom(zoomDelta);
  }

  function resetPdfZoom() {
    setPdfReader((current) => ({ ...current, zoom: 1.35 }));
  }

  function togglePdfFullscreen() {
    setPdfReader((current) => ({
      ...current,
      isFullscreen: !current.isFullscreen,
    }));
  }

  async function openPdfReader(pdf) {
    const title = getFileName(pdf, 'PDF file');
    setMessage('');
    setPdfReader({
      file: pdf,
      title,
      pages: [],
      totalPages: 0,
      status: 'loading',
      error: '',
      selectedText: '',
      zoom: pdfReader.zoom || 1.35,
      isFullscreen: false,
    });

    try {
      const document = await pdfjsLib.getDocument({ url: `${API_BASE}${pdf.url}` }).promise;
      const pages = [];

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        pages.push({ pageNumber, page });
      }

      setPdfReader({
        file: pdf,
        title,
        pages,
        totalPages: document.numPages,
        status: 'ready',
        error: '',
        selectedText: '',
        zoom: pdfReader.zoom || 1.35,
        isFullscreen: false,
      });
    } catch (error) {
      setPdfReader({
        file: pdf,
        title,
        pages: [],
        totalPages: 0,
        status: 'error',
        error: error.message || 'Unable to read this PDF.',
        selectedText: '',
        zoom: pdfReader.zoom || 1.35,
        isFullscreen: false,
      });
    }
  }

  function sendSelectedPdfTextToChatGpt() {
    const selectedText = pdfReader.selectedText || window.getSelection()?.toString().trim() || '';

    if (!selectedText) {
      setPdfReader((current) => ({
        ...current,
        error: 'Highlight text in the reader first.',
      }));
      return;
    }

    window.open(buildChatGptUrl(selectedText), '_blank', 'noopener,noreferrer');
  }

  async function uploadChatRecording(audioFile) {
    if (!activeSection || !activeChatResource) return;

    setIsUploadingChatAudio(true);
    setMessage('');

    const body = new FormData();
    body.append('audios', audioFile);

    try {
      const response = await apiFetch(
        `/api/sections/${activeSection._id}/resources/${activeChatResource._id}`,
        {
          method: 'PUT',
          body,
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to upload voice message');
      setSections((current) =>
        current.map((section) => (section._id === data._id ? data : section))
      );
      setChatRecordingStatus('ready');
    } catch (error) {
      setChatRecordingStatus('idle');
      setMessage(error.message);
    } finally {
      setIsUploadingChatAudio(false);
    }
  }

  async function startChatRecording() {
    setMessage('');

    if (!activeChatResource) return;

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chatRecordingChunksRef.current = [];
      chatStreamRef.current = stream;
      chatMediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chatRecordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const audioType = recorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(chatRecordingChunksRef.current, { type: audioType });
        const extension = getAudioExtension(audioType);
        const audioFile = new File([audioBlob], `chat-voice-${Date.now()}.${extension}`, {
          type: audioType,
        });

        stream.getTracks().forEach((track) => track.stop());
        chatStreamRef.current = null;
        uploadChatRecording(audioFile);
      };

      setChatRecordingSeconds(0);
      setChatRecordingStatus('recording');
      recorder.start();
    } catch (error) {
      setChatRecordingStatus('idle');
      setMessage(error.name === 'NotAllowedError' ? 'Microphone permission was denied.' : error.message);
    }
  }

  function stopChatRecording() {
    if (chatMediaRecorderRef.current?.state === 'recording') {
      chatMediaRecorderRef.current.stop();
    }
  }

  async function startRecording() {
    setMessage('');

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recordingChunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const audioType = recorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(recordingChunksRef.current, { type: audioType });
        const extension = getAudioExtension(audioType);
        const audioFile = new File([audioBlob], `voice-recording-${Date.now()}.${extension}`, {
          type: audioType,
        });

        const nextUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrls((currentUrls) => [...currentUrls, nextUrl]);
        setResourceForm((current) => ({ ...current, audios: [...current.audios, audioFile] }));
        setRecordingStatus('ready');
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      setRecordingSeconds(0);
      setRecordingStatus('recording');
      recorder.start();
    } catch (error) {
      setRecordingStatus('idle');
      setMessage(error.name === 'NotAllowedError' ? 'Microphone permission was denied.' : error.message);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  function clearRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recordingChunksRef.current = [];
    setResourceForm((current) => ({ ...current, audios: [] }));
    recordedAudioUrls.forEach((url) => URL.revokeObjectURL(url));
    setRecordedAudioUrls([]);
    setRecordingSeconds(0);
    setRecordingStatus('idle');
  }

  async function submitAuth(event) {
    event.preventDefault();
    setMessage('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Unable to sign in');

      saveAuth(data);
      setAuthForm(emptyAuthForm);
      setMessage('Logged in.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function createSection(event) {
    event.preventDefault();
    setIsSavingSection(true);
    setMessage('');

    try {
      const response = await apiFetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sectionForm),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to create section');

      setSections((current) => [data, ...current]);
      setActiveSectionId(data._id);
      setSectionForm(emptySection);
      setMessage('Section created.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSavingSection(false);
    }
  }

  async function saveResource(event) {
    event.preventDefault();
    if (!activeSection) return;

    setIsSavingResource(true);
    setMessage('');

    const body = new FormData();
    body.append('title', resourceForm.title);
    body.append('description', resourceForm.description);
    resourceForm.pdfs.forEach((file) => body.append('pdfs', file));
    resourceForm.audios.forEach((file) => body.append('audios', file));
    resourceForm.images.forEach((file) => body.append('images', file));

    const isEditing = Boolean(editingResourceId);
    const path = isEditing
      ? `/api/sections/${activeSection._id}/resources/${editingResourceId}`
      : `/api/sections/${activeSection._id}/resources`;

    try {
      const response = await apiFetch(path, {
        method: isEditing ? 'PUT' : 'POST',
        body,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to add resource');

      setSections((current) =>
        current.map((section) => (section._id === data._id ? data : section))
      );
      closeResourceModal();
      setMessage(isEditing ? 'Resource updated.' : 'Resource uploaded.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSavingResource(false);
    }
  }

  async function deleteResource(resourceId) {
    if (!activeSection) return;

    try {
      const response = await apiFetch(
        `/api/sections/${activeSection._id}/resources/${resourceId}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to delete resource');
      setSections((current) =>
        current.map((section) => (section._id === data._id ? data : section))
      );
      setMessage('Resource deleted.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteResourceFile(resourceId, fileUrl) {
    if (!activeSection) return;

    try {
      const response = await apiFetch(
        `/api/sections/${activeSection._id}/resources/${resourceId}/files`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileUrl }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to delete file');
      setSections((current) =>
        current.map((section) => (section._id === data._id ? data : section))
      );
      setMessage('File deleted.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function sendChatMessage(event) {
    event.preventDefault();
    if (!activeSection || !activeChatResource) return;

    const text = chatForm.text.trim();
    if (!text) return;

    setIsSendingMessage(true);
    setMessage('');

    try {
      const response = await apiFetch(
        `/api/sections/${activeSection._id}/resources/${activeChatResource._id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to send message');
      setSections((current) =>
        current.map((section) => (section._id === data._id ? data : section))
      );
      setChatForm(emptyChatForm);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function deleteSection(sectionId) {
    try {
      const response = await apiFetch(`/api/sections/${sectionId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Unable to delete section');
      }
      setSections((current) => current.filter((section) => section._id !== sectionId));
      setActiveSectionId('');
      setMessage('Section deleted.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="app-shell">
      {!isLoggedIn ? (
        <section className="auth-shell">
          <form className="panel auth-panel" onSubmit={submitAuth}>
            <div>
              <p className="eyebrow">Research Manager</p>
              <h1>Login</h1>
            </div>
            <label>
              <span>Gmail</span>
              <input
                autoComplete="email"
                required
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="Enter your email here"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                autoComplete="current-password"
                required
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Password"
              />
            </label>
            {message ? <div className="status-line">{message}</div> : null}
            <button type="submit">Login</button>
          </form>
        </section>
      ) : (
        <>
      <aside className="sidebar">
        <div className="brand-row">
          <div>
            <p className="eyebrow">Research Manager</p>
            <h1>Sections</h1>
          </div>
          <button className="ghost-button compact-button" type="button" onClick={() => logout()}>
            Logout
          </button>
        </div>
        <div className="account-strip">
          <span>Signed in</span>
          <strong>{auth.user?.email}</strong>
        </div>

        <form className="panel form-panel" onSubmit={createSection}>
          <div>
            <p className="eyebrow">New Section</p>
            <h3>Organize a topic</h3>
          </div>
          <label>
            <span>Title</span>
            <input
              required
              value={sectionForm.title}
              onChange={(event) =>
                setSectionForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Literature Review"
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              value={sectionForm.description}
              onChange={(event) =>
                setSectionForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Notes about this research area"
              rows="3"
            />
          </label>
          <button type="submit" disabled={isSavingSection}>
            {isSavingSection ? 'Creating...' : 'Create Section'}
          </button>
        </form>

        <div className="section-list-header">
          <p className="eyebrow">Workspace</p>
          <span>{sections.length} sections</span>
        </div>
        <div className="section-list" aria-live="polite">
          {isLoading ? <p className="muted">Loading sections...</p> : null}
          {!isLoading && sections.length === 0 ? (
            <p className="muted">Create a section to begin organizing files.</p>
          ) : null}
          {sections.map((section) => (
            <button
              className={`section-button ${
                activeSection?._id === section._id ? 'is-active' : ''
              }`}
              key={section._id}
              onClick={() => setActiveSectionId(section._id)}
              type="button"
            >
              <span className="section-button-main">
                <strong>{section.title}</strong>
                <span className="count-pill">{section.resources.length}</span>
              </span>
              <span>{section.resources.length === 1 ? '1 resource' : `${section.resources.length} resources`}</span>
              <span>{section.creatorName || 'Unknown'}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        {message ? <div className="status-line">{message}</div> : null}

        {activeSection ? (
          <>
            <section className="dashboard-summary" aria-label="Dashboard summary">
              <div className="dashboard-title">
                <p className="eyebrow">Dashboard</p>
                <h2>Research Library</h2>
                <p>Scan your saved sections, files, recordings, and images in one place.</p>
              </div>
              <div className="stat-grid">
                <div className="stat-card">
                  <span>Sections</span>
                  <strong>{dashboardStats.sections}</strong>
                </div>
                <div className="stat-card">
                  <span>Resources</span>
                  <strong>{dashboardStats.resources}</strong>
                </div>
                <div className="stat-card">
                  <span>PDFs</span>
                  <strong>{dashboardStats.pdfs}</strong>
                </div>
                <div className="stat-card">
                  <span>Recordings</span>
                  <strong>{dashboardStats.recordings}</strong>
                </div>
                <div className="stat-card">
                  <span>Images</span>
                  <strong>{dashboardStats.images}</strong>
                </div>
              </div>
            </section>

            <header className="workspace-header">
              <div>
                <p className="eyebrow">Active Section</p>
                <h2>{activeSection.title}</h2>
                {activeSection.description ? <p>{activeSection.description}</p> : null}
                <div className="section-metrics" aria-label="Section file summary">
                  <span>{activeSection.resources.length} resources</span>
                  <span>{visibleResources.length} visible</span>
                  <span>{activeSectionFileCount} files</span>
                </div>
                <p className="meta-line">
                  Created by {activeSection.creatorName || 'Unknown'}
                  {activeSection.updatedByName
                    ? ` · Last changed by ${activeSection.updatedByName}`
                    : ''}
                </p>
              </div>
              <button
                className="danger-button"
                type="button"
                onClick={() => deleteSection(activeSection._id)}
              >
                Delete
              </button>
            </header>

            <div className="toolbar-row">
              <label className="search-field">
                <span>Search files</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by file name or title"
                />
              </label>
              <div className="toolbar-actions">
                <span>{visibleResources.length} shown</span>
                <button className="primary-action" type="button" onClick={openAddResourceModal}>
                  Add Resource
                </button>
              </div>
            </div>

            {isResourceModalOpen ? (
              <div className="modal-backdrop" role="presentation">
                <form className="panel modal-panel" onSubmit={saveResource}>
                  <div className="modal-header">
                    <div>
                      <p className="eyebrow">Resource</p>
                      <h3>{editingResourceId ? 'Edit Resource' : 'Add Resource'}</h3>
                    </div>
                    <button className="ghost-button" type="button" onClick={closeResourceModal}>
                      Close
                    </button>
                  </div>

                  <div className="modal-grid">
                    <div className="form-panel">
                      <label>
                        <span>Resource Title</span>
                        <input
                          required
                          value={resourceForm.title}
                          onChange={(event) =>
                            setResourceForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          placeholder="Paper summary, interview, lecture"
                        />
                      </label>
                      <label>
                        <span>Description</span>
                        <textarea
                          value={resourceForm.description}
                          onChange={(event) =>
                            setResourceForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          placeholder="What should you remember about this item?"
                          rows="6"
                        />
                      </label>
                    </div>

                    <div className="file-panel">
                      <label className="file-drop">
                        <span>PDF Files</span>
                        <input
                          accept="application/pdf"
                          multiple
                          type="file"
                          onChange={(event) =>
                            setResourceForm((current) => ({
                              ...current,
                              pdfs: Array.from(event.target.files || []),
                            }))
                          }
                        />
                        <strong>
                          {resourceForm.pdfs.length
                            ? `${resourceForm.pdfs.length} PDF selected`
                            : 'Choose PDFs'}
                        </strong>
                        {resourceForm.pdfs.length ? (
                          <ul className="selected-file-list">
                            {resourceForm.pdfs.map((file) => (
                              <li key={`${file.name}-${file.size}`}>{getFileName(file, 'PDF file')}</li>
                            ))}
                          </ul>
                        ) : null}
                      </label>
                      <label className="file-drop">
                        <span>Images</span>
                        <input
                          accept="image/*"
                          multiple
                          type="file"
                          onChange={(event) =>
                            setResourceForm((current) => ({
                              ...current,
                              images: Array.from(event.target.files || []),
                            }))
                          }
                        />
                        <strong>
                          {resourceForm.images.length
                            ? `${resourceForm.images.length} images selected`
                            : 'Choose images'}
                        </strong>
                        {resourceForm.images.length ? (
                          <ul className="selected-file-list">
                            {resourceForm.images.map((file) => (
                              <li key={`${file.name}-${file.size}`}>{getFileName(file, 'Image file')}</li>
                            ))}
                          </ul>
                        ) : null}
                      </label>
                      <label className="file-drop">
                        <span>Audio Files</span>
                        <input
                          accept="audio/*"
                          multiple
                          type="file"
                          onChange={(event) =>
                            setResourceForm((current) => ({
                              ...current,
                              audios: [
                                ...current.audios.filter((file) =>
                                  file.name.startsWith('voice-recording-')
                                ),
                                ...Array.from(event.target.files || []),
                              ],
                            }))
                          }
                        />
                        <strong>
                          {resourceForm.audios.length
                            ? `${resourceForm.audios.length} recordings ready`
                            : 'Choose or record audio'}
                        </strong>
                        {resourceForm.audios.length ? (
                          <ul className="selected-file-list">
                            {resourceForm.audios.map((file) => (
                              <li key={`${file.name}-${file.size}`}>{getFileName(file, 'Audio recording')}</li>
                            ))}
                          </ul>
                        ) : null}
                      </label>
                      <div className="file-drop">
                        <span>Voice Recorder</span>
                        <div className="recorder">
                          <div className={`recording-light ${recordingStatus}`} aria-hidden="true" />
                          <strong>{formatTimer(recordingSeconds)}</strong>
                          <span>
                            {recordingStatus === 'recording'
                              ? 'Recording'
                              : resourceForm.audios.length
                                ? `${resourceForm.audios.length} recordings ready`
                                : 'Ready to record'}
                          </span>
                        </div>
                        <div className="recorder-actions">
                          {recordingStatus === 'recording' ? (
                            <button type="button" onClick={stopRecording}>
                              Stop
                            </button>
                          ) : (
                            <button type="button" onClick={startRecording}>
                              Record
                            </button>
                          )}
                          <button
                            className="ghost-button"
                            disabled={!resourceForm.audios.length || recordingStatus === 'recording'}
                            type="button"
                            onClick={clearRecording}
                          >
                            Clear Audio
                          </button>
                        </div>
                        {recordedAudioUrls.map((url) => (
                          <audio controls key={url} src={url} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button className="ghost-button" type="button" onClick={closeResourceModal}>
                      Cancel
                    </button>
                    <button type="submit" disabled={isSavingResource}>
                      {isSavingResource
                        ? 'Saving...'
                        : editingResourceId
                          ? 'Save Changes'
                          : 'Add Resource'}
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {activeChatResource ? (
              <div className="modal-backdrop" role="presentation">
                <section className="panel modal-panel voice-modal-panel" aria-label="Resource chat">
                  <div className="modal-header">
                    <div>
                      <p className="eyebrow">Chat</p>
                      <h3>{activeChatResource.title}</h3>
                    </div>
                    <button className="ghost-button" type="button" onClick={closeChat}>
                      Close
                    </button>
                  </div>

                  <section className="voice-thread voice-thread-popup" aria-label="Chat messages">
                    <div className="voice-thread-header">
                      <span>Group chat</span>
                      <strong>{getResourceChatItems(activeChatResource).length}</strong>
                    </div>
                    <div className="voice-message-list">
                      {getResourceChatItems(activeChatResource).length === 0 ? (
                        <div className="chat-empty-state">
                          <h3>No messages yet</h3>
                          <p>Start the conversation with a text message or add a voice note.</p>
                        </div>
                      ) : null}

                      {getResourceChatItems(activeChatResource).map((chatItem) => {
                        const sender = chatItem.sender;
                        const isOwnMessage =
                          chatItem.senderEmail === auth.user?.email ||
                          sender === auth.user?.email ||
                          sender === auth.user?.name;

                        return (
                          <article
                            className={`voice-message ${isOwnMessage ? 'is-own' : ''}`}
                            key={`${chatItem.type}-${chatItem.id}`}
                          >
                            <span className="voice-avatar" aria-hidden="true">
                              {getInitials(sender)}
                            </span>
                            <div className={`voice-bubble ${chatItem.type === 'message' ? 'text-bubble' : ''}`}>
                              <div className="voice-meta">
                                <strong>{sender}</strong>
                                <span>{formatDateTime(chatItem.createdAt)}</span>
                              </div>
                              {chatItem.type === 'message' ? (
                                <p className="chat-text">{chatItem.message.text}</p>
                              ) : (
                                <>
                                  <div className="voice-player-row">
                                    <span className="voice-icon" aria-hidden="true" />
                                    <audio controls src={`${API_BASE}${chatItem.audio.url}`}>
                                      <a href={`${API_BASE}${chatItem.audio.url}`}>Audio recording</a>
                                    </audio>
                                  </div>
                                  <div className="voice-actions">
                                    <span title={getFileName(chatItem.audio, 'Audio recording')}>
                                      {getFileName(chatItem.audio, 'Audio recording')}
                                    </span>
                                    <button
                                      className="asset-delete-button"
                                      type="button"
                                      onClick={() =>
                                        deleteResourceFile(activeChatResource._id, chatItem.audio.url)
                                      }
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <form className="chat-composer" onSubmit={sendChatMessage}>
                    <label>
                      <span>Message</span>
                      <input
                        maxLength="2000"
                        placeholder="Type a message"
                        value={chatForm.text}
                        onChange={(event) =>
                          setChatForm((current) => ({ ...current, text: event.target.value }))
                        }
                      />
                    </label>
                    <div className="chat-record-control">
                      <span>{formatTimer(chatRecordingSeconds)}</span>
                      {chatRecordingStatus === 'recording' ? (
                        <button type="button" onClick={stopChatRecording}>
                          Stop
                        </button>
                      ) : (
                        <button
                          className="ghost-button"
                          disabled={isUploadingChatAudio}
                          type="button"
                          onClick={startChatRecording}
                        >
                          {isUploadingChatAudio ? 'Uploading...' : 'Record'}
                        </button>
                      )}
                    </div>
                    <button type="submit" disabled={isSendingMessage || !chatForm.text.trim()}>
                      {isSendingMessage ? 'Sending...' : 'Send'}
                    </button>
                  </form>
                </section>
              </div>
            ) : null}

            {pdfReader.file ? (
              <div className="modal-backdrop" role="presentation">
                <section
                  className={`panel modal-panel pdf-reader-panel ${
                    pdfReader.isFullscreen ? 'is-fullscreen' : ''
                  }`}
                  aria-label="PDF opener"
                >
                  <div className="modal-header">
                    <div className="pdf-reader-title">
                      <p className="eyebrow">PDF Opener</p>
                      <h3>{pdfReader.title}</h3>
                      {pdfReader.totalPages ? (
                        <p className="meta-line">{pdfReader.totalPages} pages</p>
                      ) : null}
                    </div>
                    <div className="pdf-reader-actions">
                      <div className="pdf-zoom-controls" aria-label="PDF zoom controls">
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={pdfReader.zoom <= PDF_ZOOM_MIN}
                          onClick={() => changePdfZoom(-PDF_ZOOM_STEP)}
                        >
                          Zoom Out
                        </button>
                        <button className="ghost-button" type="button" onClick={resetPdfZoom}>
                          {Math.round(pdfReader.zoom * 100)}%
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={pdfReader.zoom >= PDF_ZOOM_MAX}
                          onClick={() => changePdfZoom(PDF_ZOOM_STEP)}
                        >
                          Zoom In
                        </button>
                      </div>
                      <button className="ghost-button" type="button" onClick={togglePdfFullscreen}>
                        {pdfReader.isFullscreen ? 'Exit Full Page' : 'Full Page'}
                      </button>
                      <button
                        type="button"
                        disabled={pdfReader.status !== 'ready' || !pdfReader.selectedText}
                        onClick={sendSelectedPdfTextToChatGpt}
                      >
                        Send Highlight to ChatGPT
                      </button>
                      <button className="ghost-button" type="button" onClick={closePdfReader}>
                        Close
                      </button>
                    </div>
                  </div>

                  {pdfReader.error ? <div className="status-line">{pdfReader.error}</div> : null}

                  {pdfReader.status === 'loading' ? (
                    <div className="empty-state">
                      <h3>Opening PDF...</h3>
                      <p>This may take a moment for longer papers.</p>
                    </div>
                  ) : null}

                  {pdfReader.status === 'ready' ? (
                    <div
                      className="pdf-document"
                      ref={pdfDocumentRef}
                      aria-label="Selectable PDF document"
                      onWheel={handlePdfWheel}
                    >
                      {pdfReader.pages.map((page) => (
                        <PdfPage
                          key={page.pageNumber}
                          page={page.page}
                          pageNumber={page.pageNumber}
                          scale={pdfReader.zoom}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}

            <div className="resource-list">
              {activeSection.resources.length === 0 ? (
                <div className="empty-state">
                  <h3>No resources yet</h3>
                  <p>Add PDFs, images, recordings, or notes to this section.</p>
                </div>
              ) : null}

              {activeSection.resources.length > 0 && visibleResources.length === 0 ? (
                <div className="empty-state">
                  <h3>No matching files</h3>
                  <p>Try another file name or resource title.</p>
                </div>
              ) : null}

              {visibleResources.map((resource) => {
                const images = getResourceImages(resource);
                const pdfs = getResourcePdfs(resource);
                const audios = getResourceAudios(resource);
                const counts = getResourceCounts(resource);

                return (
                  <article className="resource-card" key={resource._id}>
                  <div className="resource-card-header">
                    <div className="resource-main">
                      <p className="eyebrow">Resource</p>
                      <h3>{resource.title}</h3>
                      {resource.description ? <p>{resource.description}</p> : null}
                      <p className="meta-line">Added by {resource.creatorName || 'Unknown'}</p>
                    </div>

                    <div className="card-actions">
                      <button type="button" onClick={() => openEditResourceModal(resource)}>
                        Edit
                      </button>
                      <button className="danger-button" type="button" onClick={() => deleteResource(resource._id)}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="resource-file-summary" aria-label="Resource file summary">
                    <span>{counts.total} files</span>
                    <span>{counts.images} images</span>
                    <span>{counts.pdfs} PDFs</span>
                    <span>{counts.audios} audio</span>
                    <span>{counts.messages} messages</span>
                  </div>

                  {images.length || pdfs.length ? (
                  <div className="asset-row">
                    {images.map((image) => (
                      <div className="asset-item image-asset" key={image.url}>
                        <span className="asset-kind">IMG</span>
                        <a
                          className="image-link"
                          href={`${API_BASE}${image.url}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img src={`${API_BASE}${image.url}`} alt={getFileName(image, 'Image file')} />
                        </a>
                        <div className="asset-details">
                          <strong title={getFileName(image, 'Image file')}>
                            {getFileName(image, 'Image file')}
                          </strong>
                          <span>Added by {getFileAddedBy(image, resource)}</span>
                          <span>{formatDateTime(getFileAddedAt(image, resource))}</span>
                          <button
                            className="asset-delete-button"
                            type="button"
                            onClick={() => deleteResourceFile(resource._id, image.url)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    {pdfs.map((pdf) => (
                      <div className="asset-item" key={pdf.url}>
                        <span className="asset-kind">PDF</span>
                        <div className="asset-details">
                          <strong title={getFileName(pdf, 'PDF file')}>
                            {getFileName(pdf, 'PDF file')}
                          </strong>
                          <button
                            className="asset-open-button"
                            type="button"
                            onClick={() => openPdfReader(pdf)}
                          >
                            Open PDF · {formatBytes(pdf.size)}
                          </button>
                          <span>Added by {getFileAddedBy(pdf, resource)}</span>
                          <span>{formatDateTime(getFileAddedAt(pdf, resource))}</span>
                          <button
                            className="asset-delete-button"
                            type="button"
                            onClick={() => deleteResourceFile(resource._id, pdf.url)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  ) : null}

                  <div className="voice-launch">
                    <div>
                      <p className="eyebrow">Chat</p>
                      <strong>
                        {counts.messages} messages · {audios.length} voice notes
                      </strong>
                    </div>
                    <button type="button" onClick={() => openChat(resource._id)}>
                      Open Chat
                    </button>
                  </div>

                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty-state landing-state">
            <h2>Create your first section</h2>
            <p>Sections keep PDFs, titles, descriptions, and recordings grouped together.</p>
          </div>
        )}
      </section>
      </>
      )}
    </main>
  );
}

export default App;
