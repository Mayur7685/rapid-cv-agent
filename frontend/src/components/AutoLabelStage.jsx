import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Sparkles, Search, ChevronUp, ChevronDown, ArrowRight, ArrowLeft, Play, RotateCcw } from 'lucide-react';
import BoxCanvas from './BoxCanvas';

const API_BASE = 'http://127.0.0.1:8000/api';
const STATIC_BASE = 'http://127.0.0.1:8000/static';

const CLASS_COLORS = [
  '#eab308', '#3b82f6', '#10b981', '#f97316',
  '#ec4899', '#06b6d4', '#7c3aed', '#ef4444'
];

export default function AutoLabelStage({
  projectId, projectName, projectClasses, onNext, onBack
}) {
  const [project, setProject] = useState(null);
  const [images, setImages] = useState([]);
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(true);

  const [activeImageId, setActiveImageId] = useState(null);
  const [nlpPrompt, setNlpPrompt] = useState('');
  const [confidence, setConfidence] = useState(0.35);
  const [nmsIou, setNmsIou] = useState(0.45);
  const [running, setRunning] = useState(false);
  const [runJobId, setRunJobId] = useState(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStatus, setJobStatus] = useState(null);
  const [useMock, setUseMock] = useState(false);

  const canvasRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  // Poll job status
  useEffect(() => {
    if (!runJobId) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${runJobId}`);
        const job = await res.json();
        setJobStatus(job.status);
        setJobProgress(job.progress);
        if (job.status === 'completed') {
          clearInterval(iv);
          setRunning(false);
          fetchData();
        } else if (job.status === 'failed') {
          clearInterval(iv);
          setRunning(false);
        }
      } catch (e) { clearInterval(iv); setRunning(false); }
    }, 1500);
    return () => clearInterval(iv);
  }, [runJobId]);

  const fetchData = async () => {
    try {
      const [projRes, imgRes, lblRes] = await Promise.all([
        fetch(`${API_BASE}/projects/${projectId}`),
        fetch(`${API_BASE}/projects/${projectId}/images`),
        fetch(`${API_BASE}/projects/${projectId}/labels`),
      ]);
      const proj = await projRes.json();
      const imgs = await imgRes.json();
      const lbls = lblRes.ok ? await lblRes.json() : {};
      setProject(proj);
      setImages(imgs);
      setLabels(lbls);
      if (imgs.length > 0 && !activeImageId) setActiveImageId(imgs[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAll = async () => {
    if (running) return;
    setRunning(true);
    setJobStatus('queued');
    setJobProgress(0);
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/autolabel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          use_mock: useMock,
          model: 'moondream',
          box_threshold: confidence,
          nms_iou: nmsIou,
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRunJobId(data.job_id);
    } catch (e) {
      alert('Failed to start auto-labeling: ' + e.message);
      setRunning(false);
    }
  };

  const handleRunPrompt = async () => {
    const term = nlpPrompt.trim();
    if (!term || !activeImageId) return;
    // In a real implementation, this would call a per-image DINO run
    // For now, it adds the term as a class if not present
    if (project && !project.classes.includes(term.toLowerCase())) {
      setProject(prev => ({ ...prev, classes: [...prev.classes, term.toLowerCase()] }));
    }
    setNlpPrompt('');
  };

  const navigateImage = (dir) => {
    const idx = images.findIndex(i => i.id === activeImageId);
    const next = images[idx + dir];
    if (next) setActiveImageId(next.id);
  };

  const activeImg = images.find(i => i.id === activeImageId);
  const activeLabels = activeImageId ? (labels[activeImageId]?.labels || []) : [];
  const classes = project?.classes || projectClasses || [];

  const labeledCount = images.filter(img => (labels[img.id]?.labels || []).length > 0).length;
  const totalCount = images.length;

  if (loading) return (
    <div className="flex items-center justify-center h-[calc(100vh-48px)] bg-[#060b14]">
      <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-48px)] bg-[#060b14]">

      {/* ── Left: Thumbnail Rail ── */}
      <aside className="w-[72px] bg-[#0a0f1c] border-r border-white/[0.06] flex flex-col items-center py-3 gap-2 overflow-y-auto">
        <button
          onClick={() => navigateImage(-1)}
          disabled={images.findIndex(i => i.id === activeImageId) === 0}
          className="p-1.5 text-white/30 hover:text-white/70 disabled:opacity-20 transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        {images.map((img, idx) => {
          const hasLabels = (labels[img.id]?.labels || []).length > 0;
          const isActive = img.id === activeImageId;
          return (
            <button
              key={img.id}
              onClick={() => setActiveImageId(img.id)}
              className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                isActive
                  ? 'border-[#eab308] shadow-lg shadow-yellow-500/20'
                  : 'border-transparent opacity-60 hover:opacity-100 hover:border-white/20'
              }`}
            >
              <img
                src={`${STATIC_BASE}/${img.file_path}`}
                alt=""
                className="w-full h-full object-cover"
              />
              {hasLabels && (
                <div className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-[#4edea3] shadow" />
              )}
            </button>
          );
        })}

        <button
          onClick={() => navigateImage(1)}
          disabled={images.findIndex(i => i.id === activeImageId) === images.length - 1}
          className="p-1.5 text-white/30 hover:text-white/70 disabled:opacity-20 transition-colors mt-auto"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </aside>

      {/* ── Center: Canvas ── */}
      <main className="flex-1 flex flex-col bg-[#070c18]">
        {/* Image filename bar */}
        {activeImg && (
          <div className="h-10 border-b border-white/[0.06] flex items-center justify-between px-4">
            <span className="text-white/50 text-xs font-mono">
              {activeImg.file_path?.split('/').pop()}
            </span>
            <div className="flex items-center gap-3 text-xs text-white/30">
              <span>{images.findIndex(i => i.id === activeImageId) + 1} / {totalCount}</span>
              <button onClick={fetchData} className="hover:text-white/60 transition-colors">
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Canvas area */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          {activeImg ? (
            <BoxCanvas
              ref={canvasRef}
              imageUrl={`${STATIC_BASE}/${activeImg.file_path}`}
              initialBoxes={activeLabels}
              classes={classes}
              activeClassIndex={0}
              confidenceThreshold={confidence}
              onSelect={() => {}}
            />
          ) : (
            <div className="text-center text-white/20 text-sm">
              {images.length === 0
                ? 'No images uploaded yet'
                : 'Select an image from the left rail'}
            </div>
          )}
        </div>

        {/* Running overlay */}
        {running && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-30 backdrop-blur-sm">
            <div className="bg-[#0a0f1c] border border-white/[0.1] rounded-2xl p-8 flex flex-col items-center gap-4 max-w-xs w-full mx-4">
              <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/30 rounded-2xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-purple-400 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-white font-bold text-sm mb-1">
                  {jobStatus === 'queued' ? 'Queuing Grounding DINO...' :
                   jobStatus === 'running' ? 'Detecting objects...' :
                   'Processing...'}
                </p>
                <p className="text-white/40 text-xs">Running on {totalCount} images</p>
              </div>
              <div className="w-full bg-white/[0.08] rounded-full h-1.5">
                <div
                  className="h-1.5 bg-[#eab308] rounded-full transition-all duration-500"
                  style={{ width: `${jobProgress}%` }}
                />
              </div>
              <span className="text-white/50 text-xs font-mono">{jobProgress}%</span>
            </div>
          </div>
        )}
      </main>

      {/* ── Right: DINO Control Panel ── */}
      <aside className="w-72 guidance-panel flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-800">What objects are you looking for?</h3>
          <p className="text-xs text-gray-400 mt-0.5">{labeledCount}/{totalCount} images labeled</p>
        </div>

        <div className="p-4 space-y-5 flex-1">
          {/* Text search prompt */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={nlpPrompt}
                onChange={e => setNlpPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRunPrompt()}
                placeholder="Enter objects: person, helmet..."
                className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 placeholder-gray-300 text-gray-700 transition-all"
              />
              <button
                onClick={handleRunPrompt}
                className="px-3 py-2 bg-[#eab308] text-black font-extrabold rounded-xl text-xs hover:bg-[#ca8a04] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Search className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Active classes */}
          <div>
            {classes.map((cls, i) => (
              <div key={cls} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
                <span className="text-sm text-gray-700 font-medium flex-1">{cls}</span>
                <span className="text-[10px] text-gray-400 font-mono">
                  {Object.values(labels).reduce((acc, lbl) =>
                    acc + (lbl.labels || []).filter(l => l.class_name === cls).length, 0
                  )} det.
                </span>
              </div>
            ))}
          </div>

          {/* Model badge — Moondream only */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-gray-500">Auto-Label Engine</span>
            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0" />
              <span className="text-xs font-bold text-yellow-800">Moondream 2 VLM</span>
              <span className="ml-auto text-[10px] text-yellow-600 font-medium">local · MPS</span>
            </div>
          </div>

          {/* Detection Threshold slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-500">Detection Threshold</span>
              <span className="text-xs font-bold text-yellow-700">{Math.round(confidence * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.10} max={0.80} step={0.05}
              value={confidence}
              onChange={e => setConfidence(parseFloat(e.target.value))}
              className="w-full h-1.5 accent-yellow-500 bg-gray-200 rounded-lg cursor-pointer"
            />
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Filters tiny/hallucinated boxes. Lower = more boxes kept. Raise to reduce false positives.
            </p>
          </div>

          {/* NMS IoU slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-500">NMS IoU Threshold</span>
              <span className="text-xs font-bold text-yellow-700">{Math.round(nmsIou * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.10} max={0.80} step={0.05}
              value={nmsIou}
              onChange={e => setNmsIou(parseFloat(e.target.value))}
              className="w-full h-1.5 accent-yellow-500 bg-gray-200 rounded-lg cursor-pointer"
            />
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Controls duplicate-box removal. Lower = more aggressive suppression.
            </p>
          </div>

          {/* Progress summary */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex justify-between items-center text-xs mb-2">
              <span className="text-gray-500 font-medium">Labeling Progress</span>
              <span className="font-bold text-gray-700">{labeledCount}/{totalCount}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full">
              <div
                className="h-1.5 bg-emerald-500 rounded-full transition-all"
                style={{ width: totalCount > 0 ? `${(labeledCount / totalCount) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          <button
            onClick={handleRunAll}
            disabled={running || images.length === 0}
            className="w-full py-3 bg-[#eab308] hover:bg-[#ca8a04] disabled:bg-gray-200 disabled:text-gray-400 text-black font-extrabold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-yellow-500/10 cursor-pointer"
          >
            {running ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Running...</>
            ) : (
              <><Play className="w-4 h-4" /> Run On All Images</>
            )}
          </button>

          <div className="flex gap-2">
            <button onClick={onBack} className="flex-1 py-2 text-xs border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition-colors font-semibold flex items-center justify-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
            <button
              onClick={onNext}
              className="flex-1 py-2 text-xs bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors font-semibold flex items-center justify-center gap-1"
            >
              Review <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
