import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001').replace(/\/$/, '');
const AUTH_STORAGE_KEY = 'research-manager-auth';

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
  name: '',
  email: '',
  password: '',
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
  const [editingResourceId, setEditingResourceId] = useState('');
  const [recordingStatus, setRecordingStatus] = useState('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrls, setRecordedAudioUrls] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(auth.token));
  const [isSavingSection, setIsSavingSection] = useState(false);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [message, setMessage] = useState('');
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const streamRef = useRef(null);

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

  useEffect(
    () => () => {
      recordedAudioUrls.forEach((url) => URL.revokeObjectURL(url));
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [recordedAudioUrls]
  );

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
              <span>Name</span>
              <input
                required
                value={authForm.name}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Your name"
              />
            </label>
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
          <button className="count-pill" type="button" onClick={() => logout()}>
            Logout
          </button>
        </div>
        <p className="signed-in">{auth.user?.email}</p>

        <form className="panel form-panel" onSubmit={createSection}>
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
              <strong>{section.title}</strong>
              <span>{section.resources.length} resources</span>
              <span>Created by {section.creatorName || 'Unknown'}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        {message ? <div className="status-line">{message}</div> : null}

        {activeSection ? (
          <>
            <section className="dashboard-summary" aria-label="Dashboard summary">
              <div>
                <p className="eyebrow">Dashboard</p>
                <h2>Research Library</h2>
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
              <button type="button" onClick={openAddResourceModal}>
                Add Resource
              </button>
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

            <div className="resource-list">
              {activeSection.resources.length === 0 ? (
                <div className="empty-state">
                  <h3>No resources yet</h3>
                  <p>Add PDFs, images, recordings, or notes to this section.</p>
                </div>
              ) : null}

              {activeSection.resources.map((resource) => (
                <article className="resource-card" key={resource._id}>
                  <div className="resource-main">
                    <h3>{resource.title}</h3>
                    {resource.description ? <p>{resource.description}</p> : null}
                    <p className="meta-line">Added by {resource.creatorName || 'Unknown'}</p>
                  </div>

                  <div className="asset-row">
                    {getResourceImages(resource).map((image) => (
                      <a
                        className="image-link"
                        href={`${API_BASE}${image.url}`}
                        key={image.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={`${API_BASE}${image.url}`} alt={image.originalName} />
                      </a>
                    ))}
                    {getResourcePdfs(resource).map((pdf) => (
                      <a href={`${API_BASE}${pdf.url}`} key={pdf.url} target="_blank" rel="noreferrer">
                        PDF · {formatBytes(pdf.size)}
                      </a>
                    ))}
                    {getResourceAudios(resource).map((audio) => (
                      <audio controls key={audio.url} src={`${API_BASE}${audio.url}`}>
                        <a href={`${API_BASE}${audio.url}`}>Audio recording</a>
                      </audio>
                    ))}
                  </div>

                  <div className="card-actions">
                    <button type="button" onClick={() => openEditResourceModal(resource)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteResource(resource._id)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
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
