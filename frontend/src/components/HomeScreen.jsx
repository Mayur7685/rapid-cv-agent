import React, { useEffect, useState } from 'react';
import { Plus, FolderOpen, ArrowRight, Cpu, Loader2, Zap, Eye, BarChart3, Upload } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  created:        { label: 'Setup',        variant: 'secondary', next: 'upload' },
  labeling:       { label: 'Labeling',     variant: 'default',   next: 'autolabel' },
  needs_review:   { label: 'Review',       variant: 'outline',   next: 'review' },
  reviewed:       { label: 'Ready',        variant: 'success',   next: 'augment' },
  ready_to_train: { label: 'Ready',        variant: 'success',   next: 'augment' },
  augmenting:     { label: 'Augmenting',   variant: 'default',   next: 'train' },
  training:       { label: 'Training',     variant: 'default',   next: 'train' },
  trained:        { label: 'Trained',      variant: 'success',   next: 'test' },
  ready:          { label: 'Deployed',     variant: 'success',   next: 'test' },
  needs_data:     { label: 'Needs Data',   variant: 'destructive', next: 'upload' },
  failed:         { label: 'Failed',       variant: 'destructive', next: 'train' },
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
          background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(234,179,8,0.04) 0%, transparent 70%)'
        }} />

        <div className="relative z-10 flex flex-col items-center text-center" style={{ maxWidth: 560, width: '100%' }}>
          <div className="flex items-center gap-2 mb-6 px-3 py-1.5 bg-yellow-50 border border-yellow-250 rounded-full text-xs font-semibold text-yellow-700">
            <Zap className="w-3.5 h-3.5" />
            VLM-Augmented Agentic Vision Platform
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-gray-900 leading-tight tracking-tight mb-4">
            Build a{' '}
            <span className="text-[#eab308]">Computer Vision Model</span>
            {' '}in Minutes
          </h1>

          <p className="text-base text-gray-500 mb-10 leading-relaxed" style={{ maxWidth: '380px' }}>
            Start small and we'll help improve it as your dataset grows.
            Zero ML expertise required.
          </p>

          {/* Primary CTA */}
          <Button
            onClick={onNewProject}
            size="lg"
            className="group flex items-center gap-3 bg-[#eab308] hover:bg-[#ca8a04] text-black font-extrabold rounded-2xl shadow-lg shadow-yellow-500/10 hover:shadow-yellow-500/20 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            Start New Project
            <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </Button>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            {[
              { icon: Cpu, text: 'Auto-Annotation with DINO' },
              { icon: Eye, text: 'One-click Review' },
              { icon: BarChart3, text: 'Live mAP Metrics' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-600 shadow-sm">
                <Icon className="w-3.5 h-3.5 text-yellow-600" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Minimal Marketing Feature Section ── */}
      <section className="px-6 pb-12 max-w-5xl mx-auto w-full border-b border-neutral-200 mb-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-700 flex-shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-800 mb-1">Local VLM Auto-Labeling</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Detect and boundary-box objects automatically using offline Moondream zero-shot models.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-700 flex-shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-800 mb-1">Active Learning Loop</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Feed edge camera failures back into human review to continuously fine-tune model weights.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-700 flex-shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-800 mb-1">1-Click Edge Deploy</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Instantly retrieve PyTorch weights or query local REST APIs for construction/palleting tasks.
              </p>
            </div>
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
            <Loader2 className="w-6 h-6 animate-spin text-yellow-500" />
          </div>
        ) : projects.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <FolderOpen className="w-4.5 h-4.5 text-yellow-600" />
                Your Projects
              </h2>
              <Button
                onClick={onNewProject}
                variant="ghost"
                size="sm"
                className="flex items-center gap-1 text-yellow-700 hover:text-yellow-800 text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => {
                const meta = STATUS_META[p.status] || { label: p.status, variant: 'outline', next: 'review' };
                return (
                  <Card
                    key={p.id}
                    onClick={() => onOpenProject(p.id, p.name, p.classes, meta.next)}
                    className="group text-left p-5 cursor-pointer hover:shadow-md hover:border-yellow-400 transition-all duration-200 hover:-translate-y-0.5 bg-white"
                  >
                    {/* Colorful top bar */}
                    <div className="w-full h-1.5 rounded-full bg-gradient-to-r from-yellow-400 to-yellow-650 mb-4 opacity-70" />

                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 max-w-[160px]">
                        {p.name}
                      </h3>
                      <Badge variant={meta.variant} className="shrink-0 font-bold tracking-tight text-[10px] py-0.5">
                        {meta.label}
                      </Badge>
                    </div>

                    {/* Classes */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {(p.classes || []).slice(0, 3).map(cls => (
                        <Badge key={cls} variant="outline" className="px-2 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-100 rounded-full text-[10px] font-semibold">
                          {cls}
                        </Badge>
                      ))}
                      {(p.classes || []).length > 3 && (
                        <Badge variant="outline" className="px-2 py-0.5 bg-gray-50 text-gray-500 rounded-full text-[10px]">
                          +{p.classes.length - 3} more
                        </Badge>
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
                        <span className="flex items-center gap-1 text-yellow-600 group-hover:text-yellow-700 transition-colors font-semibold">
                          Continue <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      )}
                    </div>
                  </Card>
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
