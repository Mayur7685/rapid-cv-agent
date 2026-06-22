import React, { useEffect, useState } from 'react';
import { Plus, FolderOpen, ArrowRight, Cpu, Loader2, Zap, Eye, BarChart3, Upload } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000/api';

// Sample strip images — construction site / detection scenarios
const SAMPLE_COLORS = [
  'from-violet-900 to-violet-700',
  'from-blue-900 to-blue-700',
  'from-emerald-900 to-emerald-700',
  'from-orange-900 to-orange-700',
  'from-pink-900 to-pink-700',
  'from-cyan-900 to-cyan-700',
  'from-red-900 to-red-700',
  'from-yellow-900 to-yellow-700',
  'from-teal-900 to-teal-700',
  'from-indigo-900 to-indigo-700',
  'from-purple-900 to-purple-700',
  'from-lime-900 to-lime-700',
];

const SAMPLE_LABELS = [
  'Helmet', 'Vehicle', 'Forklift', 'Person', 'Vest',
  'PPE Kit', 'Hazard', 'Machine', 'Fire', 'Barrier', 'Sign', 'Tool'
];

const STATUS_META = {
  created:        { label: 'Setup',        color: 'badge-gray',   next: 'upload' },
  labeling:       { label: 'Labeling',     color: 'badge-purple', next: 'autolabel' },
  needs_review:   { label: 'Review',       color: 'badge-amber',  next: 'review' },
  reviewed:       { label: 'Ready',        color: 'badge-green',  next: 'augment' },
  ready_to_train: { label: 'Ready',        color: 'badge-green',  next: 'augment' },
  augmenting:     { label: 'Augmenting',   color: 'badge-purple', next: 'train' },
  training:       { label: 'Training',     color: 'badge-purple', next: 'train' },
  trained:        { label: 'Trained',      color: 'badge-green',  next: 'test' },
  ready:          { label: 'Deployed ✓',   color: 'badge-green',  next: 'test' },
  needs_data:     { label: 'Needs Data',   color: 'badge-amber',  next: 'upload' },
  failed:         { label: 'Failed',       color: 'badge-red',    next: 'train' },
};

export default function HomeScreen({ onNewProject, onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/projects/`);
      if (!res.ok) throw new Error('Backend offline');
      const data = await res.json();

      // Enrich each project with image count + latest mAP
      const enriched = await Promise.all(data.map(async (p) => {
        try {
          const [imgRes, runsRes] = await Promise.all([
            fetch(`${API_BASE}/projects/${p.id}/images`),
            fetch(`${API_BASE}/projects/${p.id}/runs`)
          ]);
          const imgs = imgRes.ok ? await imgRes.json() : [];
          const runs = runsRes.ok ? await runsRes.json() : [];
          const latestRun = runs[0];
          return {
            ...p,
            imageCount: imgs.length,
            mAP: latestRun?.map50 != null ? `${(latestRun.map50 * 100).toFixed(1)}%` : null,
          };
        } catch {
          return { ...p, imageCount: 0, mAP: null };
        }
      }));

      setProjects(enriched);
      setError(null);
    } catch (e) {
      setError('Cannot reach backend. Make sure FastAPI is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="theme-light min-h-screen flex flex-col">

      {/* ── Hero Section ── */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8 relative overflow-hidden">
        {/* Soft radial gradient bg */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(124,58,237,0.08) 0%, transparent 70%)'
        }} />

        <div className="relative z-10 flex flex-col items-center text-center" style={{ maxWidth: 560, width: '100%' }}>
          <div className="flex items-center gap-2 mb-6 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full text-xs font-semibold text-purple-600">
            <Zap className="w-3.5 h-3.5" />
            Powered by Grounding DINO + YOLOv8
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-gray-900 leading-tight tracking-tight mb-4">
            Build a{' '}
            <span className="text-[#7c3aed]">Computer Vision Model</span>
            {' '}in Minutes
          </h1>

          <p className="text-base text-gray-500 mb-10 leading-relaxed" style={{ maxWidth: '380px' }}>
            Start small and we'll help improve it as your dataset grows.
            Zero ML expertise required.
          </p>

          {/* Primary CTA */}
          <button
            onClick={onNewProject}
            className="group flex items-center gap-3 px-8 py-4 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-base rounded-2xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            Start New Project
            <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            {[
              { icon: Cpu, text: 'Auto-Annotation with DINO' },
              { icon: Eye, text: 'One-click Review' },
              { icon: BarChart3, text: 'Live mAP Metrics' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-600 shadow-sm">
                <Icon className="w-3.5 h-3.5 text-purple-500" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Projects Section ── */}
      <section className="px-6 pb-10 max-w-5xl mx-auto w-full">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-2">
            <span className="text-red-400">⚠</span> {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          </div>
        ) : projects.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <FolderOpen className="w-4.5 h-4.5 text-purple-500" />
                Your Projects
              </h2>
              <button
                onClick={onNewProject}
                className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:text-purple-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => {
                const meta = STATUS_META[p.status] || { label: p.status, color: 'badge-gray', next: 'review' };
                return (
                  <button
                    key={p.id}
                    onClick={() => onOpenProject(p.id, p.name, p.classes, meta.next)}
                    className="group text-left p-5 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-purple-300 transition-all duration-200 hover:-translate-y-0.5"
                  >
                    {/* Colorful top bar */}
                    <div className="w-full h-1.5 rounded-full bg-gradient-to-r from-violet-400 to-purple-600 mb-4 opacity-70" />

                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 max-w-[160px]">
                        {p.name}
                      </h3>
                      <span className={`badge ${meta.color} ml-2 shrink-0`}>{meta.label}</span>
                    </div>

                    {/* Classes */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {(p.classes || []).slice(0, 3).map(cls => (
                        <span key={cls} className="px-2 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-full text-[11px] font-semibold">
                          {cls}
                        </span>
                      ))}
                      {(p.classes || []).length > 3 && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[11px]">
                          +{p.classes.length - 3} more
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
                      <span className="flex items-center gap-1">
                        <Upload className="w-3 h-3" />
                        {p.imageCount} images
                      </span>
                      {p.mAP ? (
                        <span className="text-emerald-600 font-bold">mAP {p.mAP}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-purple-500 group-hover:text-purple-700 transition-colors font-semibold">
                          Continue <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </section>

      {/* ── Sample Image Strip — seamless infinite loop ── */}
      {(() => {
        // Build one half: 3 full sets of labels with a consistent color per position
        const half = Array.from({ length: 3 }).flatMap((_, setIdx) =>
          SAMPLE_LABELS.map((label, i) => ({
            label,
            color: SAMPLE_COLORS[(setIdx * SAMPLE_LABELS.length + i) % SAMPLE_COLORS.length],
            id: `${setIdx}-${i}`,
          }))
        );
        const tiles = (prefix) =>
          half.map((t) => (
            <div
              key={`${prefix}-${t.id}`}
              className={`w-20 h-14 rounded-xl bg-gradient-to-br ${t.color} flex items-end p-1.5 flex-shrink-0 shadow-sm`}
            >
              <span className="text-[9px] font-bold text-white/90 leading-none px-1 py-0.5 bg-black/30 rounded">
                {t.label}
              </span>
            </div>
          ));
        return (
          <div
            className="w-full overflow-hidden border-t border-gray-100 bg-gray-50 py-3"
            style={{
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)',
              maskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)',
            }}
          >
            <div
              className="flex gap-2"
              style={{
                width: 'max-content',
                animation: 'scrollLeft 40s linear infinite',
                willChange: 'transform',
              }}
            >
              {/* First half */}
              {tiles('a')}
              {/* Exact clone — so when first half scrolls off, this takes over seamlessly */}
              {tiles('b')}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
