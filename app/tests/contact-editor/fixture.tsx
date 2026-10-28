import React from 'react';
import { createRoot } from 'react-dom/client';
import PlayerContactCard from '../../src/pages/admin/views/PlayerContactCard';
import type { PlayerRow } from '../../src/pages/admin/lib/accounts';
const player = { id: 'synthetic', email: 'synthetic@example.test', raw: { phone_number: '(202)-555-0199', player_phone_number: '(202)-555-0100', parent_phone_number: '(202)-555-0110' } } as PlayerRow;
function Fixture() {
  const [refresh, setRefresh] = React.useState(0);
  return <><p>Refresh count: {refresh}</p><PlayerContactCard key={refresh} player={player} onSaved={async () => setRefresh(x => x + 1)} /></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
