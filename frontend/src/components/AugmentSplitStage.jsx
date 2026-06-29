import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft, Loader2, Check, FlipHorizontal2, Sun, Contrast, RotateCcw, Grid3X3, Crop } from 'lucide-react';
import GuidancePanel from './GuidancePanel';

const API_BASE = 'http://127.0.0.1:8000/api';

const AUG_OPTIONS = [
  {
    key: 'flip',
    label: 'Horizontal Flip',
    icon: FlipHorizontal2,
    desc: 'Mirror images left-right, doubles training data',
    defaultOn: true,
    hasSlider: false,
  },
  {
    key: 'brightness',
    label: 'Brightness Jitter',
    icon: Sun,
    desc: 'Random brightness variation ±20%',
    defaultOn: true,
    hasSlider: true,
    sliderKey: 'brightness_factor',
    sliderMin: 0.05,
    sliderMax: 0.50,
    sliderStep: 0.05,
    sliderDefault: 0.20,
    sliderLabel: (v) => `±${Math.round(v * 100)}%`,
  },
  {
    key: 'contrast',
    label: 'Contrast Jitter',
    icon: Contrast,
    desc: 'Vary image contrast for robustness',
    defaultOn: false,
    hasSlider: true,
    sliderKey: 'contrast_factor',
    sliderMin: 0.05,
    sliderMax: 0.40,
    sliderStep: 0.05,
    sliderDefault: 0.15,
    sliderLabel: (v) => `±${Math.round(v * 100)}%`,
  },
  {
    key: 'rotation',
    label: 'Random Rotation',
    icon: RotateCcw,
    desc: 'Slight random rotation to handle tilt',
    defaultOn: false,
    hasSlider: true,
    sliderKey: 'rotation_degrees',
    sliderMin: 5,
    sliderMax: 45,
    sliderStep: 5,
    sliderDefault: 15,
    sliderLabel: (v) => `±${v}°`,
  },
  {
    key: 'mosaic',
    label: 'Mosaic Mix',
    icon: Grid3X3,
    desc: 'Combine 4 images into 1 training tile',
    defaultOn: false,
    hasSlider: false,
  },
  {
    key: 'crop',
    label: 'Random Crop',
    icon: Crop,
    desc: 'Randomly crop portions of images',
    defaultOn: false,
    hasSlider: false,
  },
];

function buildDefaultAugs() {
  const augs = {};
  const sliders = {};
  AUG_OPTIONS.forEach(o => {
    augs[o.key] = o.defaultOn;
    if (o.hasSlider && o.sliderKey) sliders[o.sliderKey] = o.sliderDefault;
  });
  return { augs, sliders };
}

export default function AugmentSplitStage({ projectId, projectName, onNext, onBack }) {
  const [imageCount, setImageCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const { augs: defAugs, sliders: defSliders } = buildDefaultAugs();
  const [enabled, setEnabled] = useState(defAugs);
  const [sliderVals, setSliderVals] = useState(defSliders);

  // Split config (must sum to 100)
  const [split, setSplit] = useState({ train: 70, val: 20, test: 10 });

  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStatus, setJobStatus] = useState(null);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCounts();
  }, [projectId]);

  useEffect(() => {
    if (!jobId) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}`);
        const job = await res.json();
        setJobStatus(job.status);
        setJobProgress(job.progress);
        if (job.status === 'completed') {
          clearInterval(iv);
          setRunning(false);
          setDone(true);
          fetchSplitInfo();
        } else if (job.status === 'failed') {
          clearInterval(iv);
          setRunning(false);
          setError(job.error_message || 'Job failed');
        }
      } catch (e) { clearInterval(iv); setRunning(false); }
    }, 1500);
    return () => clearInterval(iv);
  }, [jobId]);

  const fetchCounts = async () => {
    try {
      const imgRes = await fetch(`${API_BASE}/projects/${projectId}/images`);
      const imgs = await imgRes.json();
      setImageCount(imgs.length);
      setReviewedCount(imgs.filter(i => i.status === 'reviewed').length);
    } finally { setLoading(false); }
  };

  const fetchSplitInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/split-info`);
      if (res.ok) setResult(await res.json());
    } catch (e) {}
  };

  const handleSplitChange = (key, val) => {
    const num = Math.max(5, Math.min(90, parseInt(val) || 0));
    const other = Object.keys(split).filter(k => k !== key);
    const remaining = 100 - num;
    const eachOther = Math.floor(remaining / 2);
    setSplit({ [key]: num, [other[0]]: eachOther, [other[1]]: remaining - eachOther });
  };

  const handleApply = async () => {
    setRunning(true);
    setError('');
    setJobStatus('queued');
    setJobProgress(0);

    const augPayload = {};
    AUG_OPTIONS.forEach(o => {
      augPayload[o.key] = enabled[o.key];
      if (o.hasSlider && o.sliderKey) augPayload[o.sliderKey] = sliderVals[o.sliderKey];
    });

    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/augment-split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          augmentations: augPayload,
          split: split
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setJobId(data.job_id);
    } catch (e) {
      setError(e.message);
      setRunning(false);
    }
  };

  const activeAugCount = Object.values(enabled).filter(Boolean).length;
  const augMultiplier = 1 + (enabled.flip ? 1 : 0) + (enabled.brightness ? 1 : 0);

  return (
    <div className="flex h-[calc(100vh-48px)] bg-[#0a0f1c]">

      {/* ── Main panel ── */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Augment & Split Dataset</h2>
            <p className="text-white/40 text-sm">
              Increase model accuracy by augmenting your {reviewedCount} reviewed images, then split into train/val/test sets.
            </p>
          </div>

          {/* Augmentation grid */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider">Augmentations</h3>
              <span className="text-xs text-white/30">{activeAugCount} enabled · ~{reviewedCount * augMultiplier} training images</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AUG_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isOn = enabled[opt.key];
                return (
                  <div
                    key={opt.key}
                    onClick={() => setEnabled(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                    className={`aug-card cursor-pointer select-none ${isOn ? 'enabled' : ''}`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isOn ? 'bg-[#eab308]/20 border border-[#eab308]/40' : 'bg-white/[0.05] border border-white/[0.08]'
                    }`}>
                      <Icon className={`w-4.5 h-4.5 ${isOn ? 'text-[#eab308]' : 'text-white/30'}`} style={{ width: 18, height: 18 }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-bold ${isOn ? 'text-white' : 'text-white/50'}`}>{opt.label}</p>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                          isOn ? 'bg-[#eab308] border-[#eab308]' : 'border-white/20'
                        }`}>
                          {isOn && <Check className="w-2.5 h-2.5 text-black font-black" strokeWidth={3} />}
                        </div>
                      </div>
                      <p className={`text-xs mt-0.5 ${isOn ? 'text-white/50' : 'text-white/25'}`}>{opt.desc}</p>
                      {opt.hasSlider && isOn && opt.sliderKey && (
                        <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <input
                            type="range"
                            min={opt.sliderMin}
                            max={opt.sliderMax}
                            step={opt.sliderStep}
                            value={sliderVals[opt.sliderKey]}
                            onChange={e => setSliderVals(prev => ({ ...prev, [opt.sliderKey]: parseFloat(e.target.value) }))}
                            className="flex-1 h-1 accent-yellow-500 bg-white/10 rounded-lg cursor-pointer"
                          />
                          <span className="text-xs text-yellow-500 font-mono w-10 text-right">
                            {opt.sliderLabel(sliderVals[opt.sliderKey])}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Train/Val/Test split */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider">Data Split</h3>
              <span className="text-xs text-white/30">Must total 100%</span>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 space-y-4">
              {/* Visual bar */}
              <div className="flex h-3 rounded-full overflow-hidden">
                <div className="bg-[#eab308] transition-all duration-300" style={{ width: `${split.train}%` }} />
                <div className="bg-[#3b82f6] transition-all duration-300" style={{ width: `${split.val}%` }} />
                <div className="bg-[#4edea3] transition-all duration-300" style={{ width: `${split.test}%` }} />
              </div>

              {[
                { key: 'train', label: 'Train', color: 'text-[#eab308]', bg: 'bg-[#eab308]' },
                { key: 'val',   label: 'Validation', color: 'text-blue-400', bg: 'bg-blue-500' },
                { key: 'test',  label: 'Test', color: 'text-emerald-400', bg: 'bg-emerald-500' },
              ].map(({ key, label, color, bg }) => (
                <div key={key} className="flex items-center gap-4">
                  <div className={`w-2.5 h-2.5 rounded-full ${bg} flex-shrink-0`} />
                  <span className="text-sm text-white/60 w-24">{label}</span>
                  <input
                    type="range"
                    min={5} max={90} step={5}
                    value={split[key]}
                    onChange={e => handleSplitChange(key, e.target.value)}
                    className={`flex-1 h-1 rounded-lg cursor-pointer accent-yellow-500`}
                  />
                  <span className={`text-sm font-bold ${color} w-12 text-right font-mono`}>
                    {split[key]}%
                  </span>
                  <span className="text-white/25 text-xs font-mono w-16 text-right">
                    ~{Math.round((split[key] / 100) * reviewedCount * augMultiplier)} imgs
                  </span>
                </div>
              ))}

              <div className="flex justify-end">
                <span className={`text-xs font-bold ${split.train + split.val + split.test === 100 ? 'text-emerald-400' : 'text-red-400'}`}>
                  Total: {split.train + split.val + split.test}%
                  {split.train + split.val + split.test !== 100 && ' ⚠ Must be 100'}
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar (if running) */}
          {running && (
            <div className="mb-6 p-4 bg-white/[0.04] border border-white/[0.08] rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white">
                  {jobStatus === 'queued' ? 'Queuing...' : jobStatus === 'running' ? 'Processing augmentations...' : 'Finishing...'}
                </span>
                <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
              </div>
              <div className="w-full h-2 bg-white/[0.08] rounded-full">
                <div className="h-2 bg-[#eab308] rounded-full transition-all duration-500" style={{ width: `${jobProgress}%` }} />
              </div>
              <span className="text-white/30 text-xs mt-1 block text-right font-mono">{jobProgress}%</span>
            </div>
          )}

          {/* Success result */}
          {done && result && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
              <p className="text-emerald-400 font-bold text-sm mb-2">✓ Dataset prepared successfully!</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><p className="text-white font-bold">{result.train_count}</p><p className="text-white/40 text-xs">Train</p></div>
                <div><p className="text-white font-bold">{result.val_count}</p><p className="text-white/40 text-xs">Val</p></div>
                <div><p className="text-white font-bold">{result.test_count}</p><p className="text-white/40 text-xs">Test</p></div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button onClick={onBack} className="btn-secondary flex items-center gap-2 text-sm">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {done ? (
              <button onClick={onNext} className="btn-primary flex items-center gap-2 text-sm flex-1 justify-center shadow-lg shadow-purple-500/25">
                Start Training <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleApply}
                disabled={running || split.train + split.val + split.test !== 100 || reviewedCount === 0}
                className="btn-primary flex items-center gap-2 text-sm flex-1 justify-center disabled:opacity-50 shadow-lg shadow-purple-500/25"
              >
                {running
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                  : <><Check className="w-4 h-4" /> Apply & Continue</>}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* ── Right guidance panel ── */}
      <aside className="w-64 guidance-panel p-5 flex flex-col gap-5 overflow-y-auto">
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-2">Why augmentation?</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Augmentation artificially grows your dataset, reducing overfitting and improving real-world accuracy — especially with small datasets.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-100 rounded-xl">
            <Check className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-gray-700">Horizontal Flip</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Doubles data instantly. Safe for most tasks.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <Check className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-gray-700">Brightness Jitter</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Helps with varying lighting conditions.</p>
            </div>
          </div>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-[11px] font-semibold text-amber-700 leading-relaxed">
            💡 Tip: For outdoor safety detection, enable all augmentations. For defect inspection, keep flip & brightness only.
          </p>
        </div>

        <div className="mt-auto p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <p className="text-xs font-bold text-gray-700 mb-1">Dataset Summary</p>
          <div className="space-y-1 text-[11px] text-gray-500">
            <div className="flex justify-between"><span>Reviewed images</span><span className="font-bold text-gray-700">{reviewedCount}</span></div>
            <div className="flex justify-between"><span>After augmentation</span><span className="font-bold text-purple-600">~{reviewedCount * augMultiplier}</span></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
