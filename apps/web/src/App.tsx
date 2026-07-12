import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Landing } from "@/pages/Landing";
import { Live } from "@/pages/Live";
import { Analytics } from "@/pages/Analytics";
import { ScoutProfile } from "@/pages/ScoutProfile";
import { FilmRoom } from "@/pages/FilmRoom";
import { Recruit } from "@/pages/Recruit";
import { HooperIQ } from "@/pages/HooperIQ";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="live" element={<Live />} />
          <Route path="film" element={<FilmRoom />} />
          <Route path="recruit" element={<Recruit />} />
          {/* Independent Basketball IQ training (draw → test → next) */}
          <Route path="iq" element={<HooperIQ />} />
          {/* Post-game report — reached from Live, not a top-level feature */}
          <Route path="analytics" element={<Analytics />} />
          {/* Shared scout card deep links */}
          <Route path="profile" element={<ScoutProfile />} />
          {/* Legacy routes → three-feature IA */}
          <Route path="calibrate" element={<Navigate to="/live" replace />} />
          <Route path="process" element={<Navigate to="/recruit" replace />} />
          <Route path="hooperiq" element={<Navigate to="/iq" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
