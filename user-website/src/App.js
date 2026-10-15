import React, { useState } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Home from "./Home";
import FormSettings from "./FormSettings";
import Login from "./Login";
import NavBar from "./NavBar";
import BatteryList from "./BatteryList";
import BatteryView from "./BatteryView";
import ConfigLibrary from "./library/ConfigLibrary";
import ConfigEditor from "./library/ConfigEditor";
import ConfigView from "./library/ConfigView";
import InstructionSetView from "./library/InstructionSetView";
import InstructionSetEditor from "./library/InstructionSetEditor";
import { AuthProvider, useAuth } from "./AuthContext";
import { emptyDraft } from "./draft";
import "./App.css";

/** Redirects to /login unless a valid admin session is confirmed. */
function RequireAuth({ children }) {
  const { status } = useAuth();
  if (status === "checking") {
    return <p style={{ padding: "20px" }}>Checking login status...</p>;
  }
  if (status === "loggedOut") {
    return <Navigate to="/login" replace />;
  }
  return (
    <>
      <NavBar />
      {children}
    </>
  );
}

function AppRoutes() {
  const { status } = useAuth();
  // The battery being built. Lives here so it survives moving between pages.
  const [draft, setDraft] = useState(emptyDraft);

  // Adds a task to the battery, or replaces it if it is already there (same id).
  const saveFormSettings = (item) => {
    setDraft((d) => {
      const exists = d.items.some((i) => i.id === item.id);
      return {
        ...d,
        items: exists ? d.items.map((i) => (i.id === item.id ? item : i)) : [...d.items, item],
      };
    });
  };

  return (
    <Routes>
      <Route path="/login" element={status === "loggedIn" ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Home draft={draft} setDraft={setDraft} />
          </RequireAuth>
        }
      />
      {/* :taskTypeId is the numeric task_types.task_type_id from the database;
          :id is a per-selection uuid, so the same task type can be added to a
          battery more than once (e.g. two Digit Span variants). */}
      <Route
        path="/settings/:taskTypeId/:id"
        element={
          <RequireAuth>
            <FormSettings draft={draft} saveFormSettings={saveFormSettings} />
          </RequireAuth>
        }
      />
      <Route
        path="/batteries"
        element={
          <RequireAuth>
            <BatteryList draft={draft} setDraft={setDraft} />
          </RequireAuth>
        }
      />
      {/* :batteryId is batteries.battery_id (not battery_index) */}
      <Route
        path="/batteries/:batteryId"
        element={
          <RequireAuth>
            <BatteryView draft={draft} setDraft={setDraft} />
          </RequireAuth>
        }
      />
      {/* Instruction sets have their own view/editor pages (several languages per set); these
          static routes win over the /library/:kind/... ones below. */}
      <Route
        path="/library/instruction/new"
        element={
          <RequireAuth>
            <InstructionSetEditor mode="new" key="new" />
          </RequireAuth>
        }
      />
      <Route
        path="/library/instruction/:id"
        element={
          <RequireAuth>
            <InstructionSetView />
          </RequireAuth>
        }
      />
      <Route
        path="/library/instruction/:id/copy"
        element={
          <RequireAuth>
            <InstructionSetEditor mode="copy" key="copy" />
          </RequireAuth>
        }
      />
      <Route
        path="/library/instruction/:id/add-language"
        element={
          <RequireAuth>
            <InstructionSetEditor mode="addLanguage" key="addLanguage" />
          </RequireAuth>
        }
      />
      {/* :kind is "parameter" or "instruction" (the list page is shared) */}
      <Route
        path="/library/:kind"
        element={
          <RequireAuth>
            <ConfigLibrary />
          </RequireAuth>
        }
      />
      <Route
        path="/library/:kind/new"
        element={
          <RequireAuth>
            <ConfigEditor />
          </RequireAuth>
        }
      />
      <Route
        path="/library/:kind/:id"
        element={
          <RequireAuth>
            <ConfigView />
          </RequireAuth>
        }
      />
      <Route
        path="/library/:kind/:id/copy"
        element={
          <RequireAuth>
            <ConfigEditor />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
