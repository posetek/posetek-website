import { useState } from "react";
import { createRoot } from "react-dom/client";
import PlayerContactCard, { type PhoneChanges } from "../../src/pages/admin/views/PlayerContactCard";
import type { PlayerRow } from "../../src/pages/admin/lib/accounts";
import "../../src/pages/admin/player-detail.scss";
import { phones, bases, requests } from "./firebase";

function loadPlayer(): PlayerRow {
  return { id: "synthetic", email: "synthetic@example.test", raw: {
    phone_number: phones.primary, player_phone_number: phones.player, parent_phone_number: phones.parent,
    player_phone_basis: bases.player, parent_phone_basis: bases.parent,
  } } as PlayerRow;
}

function Fixture() {
  const [player, setPlayer] = useState(loadPlayer);
  const [refreshes, setRefreshes] = useState(0);
  const [visible, setVisible] = useState(true);
  const [savedPhones, setSavedPhones] = useState<PhoneChanges>({});
  return <main className="pt-admin">
    {visible && <PlayerContactCard key={refreshes} player={player} savedPhones={savedPhones}
      onPhonesSaved={changes => setSavedPhones(previous => ({ ...previous, ...changes }))}
      onSaved={async () => {
        setPlayer(loadPlayer()); setSavedPhones({}); setRefreshes(count => count + 1);
      }} />}
    <button type="button" onClick={() => setVisible(value => !value)}>Toggle profile</button>
    <button type="button" onClick={() => { phones.parent = "(202)-555-0144"; }}>Simulate another edit</button>
    <button type="button" onClick={() => {
      document.getElementById("fixture-state")!.textContent = JSON.stringify({ phones, requests });
    }}>Inspect fixture state</button>
    <pre id="fixture-state" hidden />
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
