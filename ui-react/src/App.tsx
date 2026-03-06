import { BrowserRouter, Routes, Route } from "react-router-dom";
import { OAuthCallback } from "./components/auth/OAuthCallback";
import IntegrationsPage from "./pages/Integrations";
import SettingsPage from "./pages/Settings";
import DashboardPage from "./pages/Dashboard";
import { TopNav } from "./components/TopNav";

function App() {
    return (
        <BrowserRouter>
            <div className="flex h-screen flex-col bg-background text-foreground">
                <TopNav />
                <div className="flex-1 overflow-hidden relative">
                    <Routes>
                        <Route
                            path="/oauth/callback"
                            element={<OAuthCallback />}
                        />
                        <Route
                            path="/integrations"
                            element={<IntegrationsPage />}
                        />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/" element={<DashboardPage />} />
                    </Routes>
                </div>
            </div>
        </BrowserRouter>
    );
}

export default App;
