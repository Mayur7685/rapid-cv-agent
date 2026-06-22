import React, { useState, useCallback } from 'react';
import { Check, Cpu } from 'lucide-react';

// ── Stage Components ──────────────────────────────────────────────────────────
import HomeScreen from './components/HomeScreen';
import ChatOnboarding from './components/ChatOnboarding';
import UploadStage from './components/UploadStage';
import AutoLabelStage from './components/AutoLabelStage';
import LabelReview from './components/LabelReview';
import AugmentSplitStage from './components/AugmentSplitStage';
import TrainingMonitor from './components/TrainingMonitor';
import TestDeployStage from './components/TestDeployStage';
import ExportPanel from './components/ExportPanel';

// ── Pipeline definition ───────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { key: 'upload',    label: 'Upload'    },
  { key: 'autolabel', label: 'Auto-Label'},
  { key: 'review',    label: 'Review'    },
  { key: 'augment',   label: 'Augment'   },
  { key: 'train',     label: 'Train'     },
  { key: 'test',      label: 'Test'      },
  { key: 'deploy',    label: 'Deploy'    },
];

const STAGE_ORDER = PIPELINE_STAGES.map(s => s.key);

function getStageIndex(stage) {
  return STAGE_ORDER.indexOf(stage);
}

export default function App() {
  // Core state
  const [stage, setStage] = useState('home'); // home | chat | upload | autolabel | review | augment | train | test | deploy
  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [projectClasses, setProjectClasses] = useState([]);

  const handleNavigate = useCallback((targetStage, pid = null, name = '', classes = []) => {
    setStage(targetStage);
    if (pid !== null) setProjectId(pid);
    if (name) setProjectName(name);
    if (classes && classes.length > 0) setProjectClasses(classes);
  }, []);

  // Home / Chat stages — no pipeline bar, different aesthetic
  const isPrePipeline = stage === 'home' || stage === 'chat';
  const currentStageIdx = getStageIndex(stage);
  const showPipelineBar = !isPrePipeline && projectId;

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Top Bar ── */}
      <header className={`sticky top-0 z-50 ${isPrePipeline
        ? 'bg-white/80 border-b border-purple-100 backdrop-blur-md'
        : 'bg-[#0a0f1c]/90 border-b border-white/[0.07] backdrop-blur-md'
      }`}>
        <div className="w-full px-6 h-12 flex items-center justify-between">
          {/* Logo */}
          <button
            onClick={() => handleNavigate('home')}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-7 h-7 bg-[#7c3aed] rounded-lg flex items-center justify-center shadow-md group-hover:shadow-purple-500/30 transition-all">
              <Cpu className="w-4 h-4 text-white" />
            </div>
            <span className={`font-bold text-sm tracking-tight ${isPrePipeline ? 'text-gray-900' : 'text-white'}`}>
              Rapid<span className="text-[#7c3aed]">CV</span>
            </span>
          </button>

          {/* Pipeline Progress Bar */}
          {showPipelineBar && (
            <div className="flex items-center gap-0">
              {PIPELINE_STAGES.map((s, idx) => {
                const isDone = currentStageIdx > idx;
                const isActive = currentStageIdx === idx;
                const isPast = isDone;

                return (
                  <React.Fragment key={s.key}>
                    {idx > 0 && (
                      <div className={`pipeline-connector ${isPast ? 'done' : isActive ? 'active' : ''}`} />
                    )}
                    <div
                      className={`pipeline-step ${isActive ? 'active' : isPast ? 'done' : ''}`}
                      title={s.label}
                    >
                      <div className="pipeline-step-dot">
                        {isDone && <Check className="w-2.5 h-2.5 text-[#0a0f1c]" strokeWidth={3} />}
                        {isActive && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="hidden md:inline">{s.label}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* Right: project name pill */}
          {projectId && projectName && (
            <div className={`hidden md:flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full ${
              isPrePipeline
                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                : 'bg-white/[0.06] text-white/70 border border-white/[0.08]'
            }`}>
              <div className="w-1.5 h-1.5 rounded-full bg-[#4edea3]" />
              {projectName}
            </div>
          )}

          {/* Fallback: if no project yet, show a minimal "New Project" CTA */}
          {!projectId && !isPrePipeline && (
            <button
              onClick={() => handleNavigate('home')}
              className="text-xs text-white/50 hover:text-white transition-colors"
            >
              ← Home
            </button>
          )}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-grow flex flex-col">

        {stage === 'home' && (
          <HomeScreen
            onNewProject={() => handleNavigate('chat')}
            onOpenProject={(pid, name, classes, targetStage) => handleNavigate(targetStage || 'review', pid, name, classes)}
          />
        )}

        {stage === 'chat' && (
          <ChatOnboarding
            onComplete={(pid, name, classes) => handleNavigate('upload', pid, name, classes)}
            onCancel={() => handleNavigate('home')}
          />
        )}

        {stage === 'upload' && (
          <UploadStage
            projectId={projectId}
            projectName={projectName}
            projectClasses={projectClasses}
            onClassesChange={setProjectClasses}
            onNext={(pid, name) => handleNavigate('autolabel', pid, name)}
            onBack={() => handleNavigate('chat')}
          />
        )}

        {stage === 'autolabel' && (
          <AutoLabelStage
            projectId={projectId}
            projectName={projectName}
            projectClasses={projectClasses}
            onNext={() => handleNavigate('review', projectId, projectName)}
            onBack={() => handleNavigate('upload')}
          />
        )}

        {stage === 'review' && (
          <LabelReview
            projectId={projectId}
            projectName={projectName}
            onNext={() => handleNavigate('augment', projectId, projectName)}
            onBack={() => handleNavigate('autolabel')}
            onNavigate={(s, pid, name) => handleNavigate(s, pid, name)}
          />
        )}

        {stage === 'augment' && (
          <AugmentSplitStage
            projectId={projectId}
            projectName={projectName}
            onNext={() => handleNavigate('train', projectId, projectName)}
            onBack={() => handleNavigate('review')}
          />
        )}

        {stage === 'train' && (
          <TrainingMonitor
            projectId={projectId}
            projectName={projectName}
            onNext={() => handleNavigate('test', projectId, projectName)}
            onBack={() => handleNavigate('augment')}
            onNavigate={(s, pid, name) => handleNavigate(s, pid, name)}
            onAddMoreImages={(cls) => handleNavigate('upload', projectId, projectName)}
          />
        )}

        {stage === 'test' && (
          <TestDeployStage
            projectId={projectId}
            projectName={projectName}
            projectClasses={projectClasses}
            onBack={() => handleNavigate('train')}
            onImprove={() => handleNavigate('upload', projectId, projectName)}
          />
        )}

        {stage === 'deploy' && (
          <ExportPanel
            projectId={projectId}
            onNavigate={handleNavigate}
          />
        )}
      </main>
    </div>
  );
}
