import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "./components/layout/AppLayout";
import { AlertDialog } from "./components/ui/AlertDialog";
import { IndicatorsView } from "./components/views/IndicatorsView";
import { MarketMapView } from "./components/views/MarketMapView";
import { DataLabView } from "./components/views/DataLabView";
import { OverviewView } from "./components/views/OverviewView";
import { CorrelationLabView } from "./components/views/CorrelationLabView";
import { DashboardView } from "./components/views/DashboardView";
import { MarketCycleView } from "./components/views/MarketCycleView";
import { SettingsView } from "./components/views/SettingsView";
import { AIReportView } from "./components/views/AIReportView";
import { SettingsModal } from "./components/modals/SettingsModal";

function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedIndicatorSlug, setSelectedIndicatorSlug] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Custom Alert Dialog State
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    variant: "info" | "danger" | "success" | "warning";
  }>({ isOpen: false, title: "", description: "", variant: "info" });

  const showAlert = (title: string, description: string, variant: "info" | "danger" | "success" | "warning" = "warning") => {
    setAlertDialog({ isOpen: true, title, description, variant });
  };

  const closeAlert = () => setAlertDialog(prev => ({ ...prev, isOpen: false }));

  // Load API Key on startup
  useEffect(() => {
    invoke("get_api_key")
      .then((key) => {
        if (typeof key === 'string' && key) {
          setApiKey(key);
        }
      })
      .catch((err) => console.error("Failed to load API key:", err));
  }, []);

  const handleNavigate = (tab: string, slug?: string) => {
    setActiveTab(tab);
    if (slug) {
      setSelectedIndicatorSlug(slug);
    }
  };

  return (
    <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {/* Header Section */}
      <header className="mb-8 flex items-center justify-between">
        <div className="animate-in slide-in-from-left duration-500">
          <h2 className="text-3xl font-bold text-foreground tracking-tight capitalize">
            {t(`nav.${activeTab}`, activeTab.replace(/_/g, ' ').replace(/-/g, ' '))}
          </h2>
          <p className="text-muted-foreground text-sm mt-1 font-light">{t('header.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2.5 rounded-xl bg-background/50 border border-border text-foreground hover:bg-muted transition-all"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={async () => {
              if (!apiKey) {
                showAlert("API Key Required", "Please set your FRED API Key in Settings first.", "warning");
                setActiveTab("settings");
                return;
              }
              const btn = document.getElementById("sync-btn");
              const btnText = document.getElementById("sync-text");
              if (btn) btn.classList.add("animate-spin");
              if (btnText) btnText.innerText = "Syncing...";

              try {
                // 1. Get List Dynamically
                const indicators: any[] = await invoke("get_indicators_list");
                const targets = indicators.filter(i => i.category !== "Internal"); // Skip internal ones

                console.log(`Starting sync for ${targets.length} indicators...`);

                // 2. Sync All Visible Indicators
                const results = await Promise.allSettled(targets.map(async (ind) => {
                  return invoke("calculate_indicator", { apiKey, slug: ind.slug, backfill: false });
                }));

                // Check results
                const failed = results.filter(r => r.status === 'rejected');
                if (failed.length > 0) {
                  console.warn(`${failed.length} indicators failed to sync.`);
                } else {
                  console.log("All indicators synced successfully.");
                }

                // Notify all views to refresh data
                await import("@tauri-apps/api/event").then(mod => mod.emit('indicators-updated'));
              } catch (e) {
                showAlert("Sync Failed", String(e), "danger");
              } finally {
                if (btn) btn.classList.remove("animate-spin");
                if (btnText) btnText.innerText = "Sync Data";
              }
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary/90 hover:bg-primary text-primary-foreground rounded-xl transition-all shadow-lg shadow-primary/20 text-sm font-medium backdrop-blur-sm border border-primary/20 group hover:scale-[1.02] active:scale-[0.98]"
          >
            <RefreshCw id="sync-btn" size={16} className="transition-transform duration-500" />
            <span id="sync-text">{t('header.sync_data')}</span>
          </button>
        </div>
      </header>

      {activeTab === "overview" ? (
        <OverviewView onNavigate={handleNavigate} />
      ) : activeTab === "dashboards" ? (
        <DashboardView />
      ) : activeTab === "indicators" ? (
        <IndicatorsView initialSelection={selectedIndicatorSlug} />
      ) : activeTab === "market_cycle" ? (
        <MarketCycleView />
      ) : activeTab === "market_map" ? (
        <MarketMapView />
      ) : activeTab === "data-ingestion" ? (
        <DataLabView />
      ) : activeTab === "correlation" ? (
        <CorrelationLabView />
      ) : activeTab === "ai_report" ? (
        <AIReportView />
      ) : (
        <SettingsView />
      )}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* Custom Alert Dialog */}
      <AlertDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
        confirmText="OK"
        cancelText="Cancel"
        onConfirm={closeAlert}
        onCancel={closeAlert}
      />
    </AppLayout>
  );
}

export default App;
