import React, { useState, useEffect } from 'react';
import {
  Loader2, ArrowRight, ArrowLeft, Play, AlertTriangle,
  Cpu, Zap, TrendingUp, Check, ChevronRight
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_BASE = 'http://127.0.0.1:8000/api';

const MODEL_OPTIONS = [
  {
    key: 'yolov8n',
    name: 'Nano',
    full: 'YOLOv8n',
    desc: 'Fastest inference, ideal for edge devices',
    speed: 5,
    accuracy: 2,
    size: '6.2M params',
    badge: 'Recommended'
  },
  {
    key: 'yolov8s',
    name: 'Small',
    full: 'YOLOv8s',
    desc: 'Balanced speed & accuracy',
    speed: 4,
    accuracy: 3,
    size: '11.2M params',
    badge: null
  },
  {
    key: 'yolov8m',
    name: 'Medium',
    full: 'YOLOv8m',
    desc: 'Best accuracy, slower inference',
    speed: 2,
    accuracy: 5,
    size: '25.9M params',
    badge: null
  },
];

function SpeedBar({ level, max = 5, color }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 w-4 rounded-sm"
          style={{ background: i < level ? color : 'rgba(255,255,255,0.08)' }}
        />
      ))}
    </div>
  );
}

export default function TrainingMonitor({
  projectId, projectName, onNext, onBack, onNavigate, onAddMoreImages
}) {
  const [runs, setRuns] = useState([]);
  const [latestRun, setLatestRun] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  const [modelSize, setModelSize] = useState('yolov8n');
  const [epochs, setEpochs] = useState(10);
  const [batchSize, setBatchSize] = useState(16);
  const [useMock, setUseMock] = useState(false);
  const [mapThreshold, setMapThreshold] = useState(0.50);
  const [jobId, setJobId] = useState(null);
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState('');
  const [evalReport, setEvalReport] = useState(null);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  useEffect(() => {
    if (!isTraining) return;
    const iv = setInterval(fetchData, 2000);
    return () => clearInterval(iv);
  }, [isTraining]);

  useEffect(() => {
    if (latestRun) {
      if (latestRun.status === 'completed' || latestRun.status === 'failed') {
        setIsTraining(false);
        fetchEvalReport();
      } else if (latestRun.status === 'training') {
        setIsTraining(true);
      }
    }
  }, [latestRun]);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/runs`);
      const data = await res.json();
      setRuns(data);
      if (data.length > 0) {
        const latest = data[0];
        setLatestRun(latest);
        // Build chart data from all epochs
        const points = data.slice().reverse().map(r => ({
          epoch: r.epoch,
          loss: parseFloat(r.loss?.toFixed(4) || 0),
          mAP50: parseFloat(((r.map50 || 0) * 100).toFixed(2))
        }));
        setChartData(points);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchEvalReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/model-status`);
      if (res.ok) {
        const data = await res.json();
        setEvalReport(data.eval_report);
      }
    } catch (e) {}
  };

  const handleStartTraining = async () => {
    setIsTraining(true);
    setError('');
    setEvalReport(null);
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_size: modelSize,
          epochs,
          threshold: mapThreshold,
          use_mock: useMock
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setJobId(data.job_id);
    } catch (e) {
      setError(e.message);
      setIsTraining(false);
    }
  };

  const isCompleted = latestRun?.status === 'completed';
  const isFailed = latestRun?.status === 'failed';

  // Weak classes from eval report
  const weakClasses = evalReport?.weak_classes || [];
  const perClassMetrics = evalReport?.per_class_metrics || {};

  return (
    <div className="flex h-[calc(100vh-48px)] bg-[#0a0f1c] overflow-hidden">

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Model selection + config ── */}
        {!isTraining && !isCompleted && (
          <div className="p-6 border-b border-white/[0.06] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-1">Configure Training</h2>
            <p className="text-white/40 text-sm mb-5">Select a model architecture and training parameters.</p>

            {/* Model cards */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {MODEL_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setModelSize(opt.key)}
                  className={`model-card text-left ${modelSize === opt.key ? 'selected' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-white font-bold text-sm">{opt.full}</p>
                      <p className="text-white/40 text-[11px]">{opt.size}</p>
                    </div>
                     {opt.badge && (
                      <span className="badge bg-yellow-50 border border-yellow-200 text-yellow-800 text-[9px]">{opt.badge}</span>
                    )}
                  </div>
                  <p className="text-white/40 text-[11px] mb-3">{opt.desc}</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-white/40">
                      <span>Speed</span>
                      <SpeedBar level={opt.speed} color="#eab308" />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-white/40">
                      <span>Accuracy</span>
                      <SpeedBar level={opt.accuracy} color="#4edea3" />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Training params */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60 block">
                  Epochs: <span className="text-yellow-500">{epochs}</span>
                </label>
                <input
                  type="range" min={5} max={100} step={5}
                  value={epochs}
                  onChange={e => setEpochs(parseInt(e.target.value))}
                  className="w-full h-1.5 accent-yellow-500 bg-white/[0.08] rounded-lg cursor-pointer"
                />
                <p className="text-[10px] text-white/25">Recommended: 10–50 for small datasets</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60 block">
                  mAP50 Threshold: <span className="text-yellow-500">{Math.round(mapThreshold * 100)}%</span>
                </label>
                <input
                  type="range" min={0.3} max={0.9} step={0.05}
                  value={mapThreshold}
                  onChange={e => setMapThreshold(parseFloat(e.target.value))}
                  className="w-full h-1.5 accent-yellow-500 bg-white/[0.08] rounded-lg cursor-pointer"
                />
                <p className="text-[10px] text-white/25">Minimum acceptable accuracy per class</p>
              </div>
            </div>


          </div>
        )}

        {/* ── Live training progress ── */}
        <div className="flex-1 flex flex-col overflow-y-auto p-6">

          {/* Training status header */}
          {isTraining && (
            <div className="flex items-center gap-3 mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl">
              <Loader2 className="w-5 h-5 animate-spin text-yellow-500" />
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Training in progress...</p>
                <p className="text-yellow-500 text-xs">Epoch {latestRun?.epoch || 0} / {epochs} · Loss: {latestRun?.loss?.toFixed(4) || '—'} · mAP50: {latestRun?.map50 != null ? `${(latestRun.map50 * 100).toFixed(1)}%` : '—'}</p>
              </div>
            </div>
          )}

          {/* Completed state */}
          {isCompleted && (
            <div className="flex items-center gap-3 mb-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
              <Check className="w-5 h-5 text-emerald-400" />
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Training Complete!</p>
                <p className="text-emerald-400 text-xs">
                  Final mAP50: {latestRun?.map50 != null ? `${(latestRun.map50 * 100).toFixed(1)}%` : '—'}
                  {' · '} Loss: {latestRun?.loss?.toFixed(4) || '—'}
                </p>
              </div>
              <button
                onClick={onNext}
                className="btn-primary flex items-center gap-1.5 text-xs"
              >
                Test Model <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Failed state */}
          {isFailed && (
            <div className="flex items-center gap-3 mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Training Failed</p>
                <p className="text-red-400 text-xs">Check that augmentation was run first.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
          )}

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="mb-6 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white/70 mb-4">Training Curves</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="epoch" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} label={{ value: 'Epoch', position: 'insideBottom', offset: -2, fill: 'rgba(255,255,255,0.2)', fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: '#0a0f1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12, color: '#e8e8f0' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} />
                  <Line yAxisId="left" type="monotone" dataKey="loss" stroke="#ef4444" strokeWidth={2} dot={false} name="Loss" />
                  <Line yAxisId="right" type="monotone" dataKey="mAP50" stroke="#4edea3" strokeWidth={2} dot={false} name="mAP50 (%)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-class metrics table */}
          {isCompleted && Object.keys(perClassMetrics).length > 0 && (
            <div className="mb-6 bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <h3 className="text-sm font-bold text-white/70">Per-Class Metrics</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className="text-left px-5 py-2.5 text-[10px] font-bold text-white/30 uppercase tracking-wider">Class</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold text-white/30 uppercase tracking-wider">mAP50</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold text-white/30 uppercase tracking-wider">Precision</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold text-white/30 uppercase tracking-wider">Recall</th>
                    <th className="text-right px-5 py-2.5 text-[10px] font-bold text-white/30 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(perClassMetrics).map(([cls, metrics]) => (
                    <tr key={cls} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-2.5 font-semibold text-white/80">{cls}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        <span className={metrics.map50 >= mapThreshold ? 'text-emerald-400' : 'text-red-400'}>
                          {(metrics.map50 * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-white/50">{(metrics.precision * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-right font-mono text-white/50">{(metrics.recall * 100).toFixed(1)}%</td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={`badge ${metrics.status === 'pass' ? 'badge-green' : 'badge-red'}`}>
                          {metrics.status === 'pass' ? '✓ Pass' : '✗ Fail'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Weak class CTA */}
              {weakClasses.length > 0 && (
                <div className="p-4 border-t border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-amber-300 font-bold text-sm">
                        {weakClasses.length} class{weakClasses.length > 1 ? 'es' : ''} need more data
                      </p>
                      <p className="text-amber-400/60 text-xs mt-0.5">
                        Add 10–20 more images of: <strong>{weakClasses.join(', ')}</strong>
                      </p>
                    </div>
                    <button
                      onClick={() => onAddMoreImages?.(weakClasses[0])}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold hover:bg-amber-500/30 transition-colors"
                    >
                      Add Images <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Start button (if not training and not done) */}
          {!isTraining && !isCompleted && !isFailed && (
            <div className="flex gap-3">
              <button onClick={onBack} className="btn-secondary flex items-center gap-2 text-sm">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleStartTraining}
                className="btn-primary flex items-center gap-2 text-sm flex-1 justify-center shadow-lg shadow-yellow-500/10"
              >
                <Play className="w-4 h-4" /> Start Training
              </button>
            </div>
          )}

          {/* Retry button on fail */}
          {isFailed && (
            <div className="flex gap-3">
              <button onClick={onBack} className="btn-secondary flex items-center gap-2 text-sm">
                <ArrowLeft className="w-4 h-4" /> Back to Augment
              </button>
              <button
                onClick={handleStartTraining}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Play className="w-4 h-4" /> Retry Training
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right guidance panel ── */}
      <aside className="w-64 guidance-panel p-5 flex flex-col gap-5 overflow-y-auto bg-white border-l border-gray-100">
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-2">Training Status</h3>
          {!isTraining && !isCompleted && !latestRun && (
            <p className="text-xs text-gray-400 leading-relaxed">Configure your model and click Start Training.</p>
          )}
          {isTraining && latestRun && (
            <div className="space-y-2">
              <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-xl">
                <p className="text-xs font-bold text-yellow-800">Epoch {latestRun.epoch}</p>
                <p className="text-[10px] text-yellow-750 mt-0.5">Loss: {latestRun.loss?.toFixed(4)} · mAP: {((latestRun.map50 || 0) * 100).toFixed(1)}%</p>
                <div className="w-full h-1 bg-yellow-100 rounded-full mt-2">
                  <div className="h-1 bg-yellow-500 rounded-full" style={{ width: `${Math.min(100, (latestRun.epoch / epochs) * 100)}%` }} />
                </div>
              </div>
            </div>
          )}
          {isCompleted && latestRun && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <p className="text-xs font-bold text-emerald-700">✓ Training Complete</p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
                <div><p className="text-emerald-600 font-bold">{((latestRun.map50 || 0) * 100).toFixed(1)}%</p><p className="text-gray-400">mAP50</p></div>
                <div><p className="text-emerald-600 font-bold">{latestRun.loss?.toFixed(3)}</p><p className="text-gray-400">Final Loss</p></div>
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Model Choices</p>
          {MODEL_OPTIONS.map(m => (
            <button
              key={m.key}
              onClick={() => !isTraining && setModelSize(m.key)}
              className={`w-full text-left p-2.5 rounded-xl mb-1.5 border transition-all text-xs cursor-pointer ${
                modelSize === m.key
                  ? 'bg-yellow-50 border-yellow-250 text-yellow-800 font-bold'
                  : 'border-gray-100 text-gray-500 hover:border-gray-200'
              }`}
            >
              <div className="flex justify-between items-center">
                <span>{m.full}</span>
                {m.badge && <span className="text-[9px] bg-yellow-100 text-yellow-850 px-1.5 rounded-full font-bold">{m.badge}</span>}
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>

        <div className="mt-auto p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            💡 YOLOv8n trains in minutes. Good starting point before scaling up to a larger model.
          </p>
        </div>
      </aside>
    </div>
  );
}
