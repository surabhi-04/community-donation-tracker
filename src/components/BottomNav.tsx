import type { AppPage } from '../App';

interface BottomNavProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
}

const NAV_ITEMS: { id: AppPage; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid_view' },
  { id: 'people',    label: 'People',    icon: 'group' },
  { id: 'groups',    label: 'Groups',    icon: 'workspaces' },
  { id: 'locations', label: 'Locations', icon: 'location_on' },
  { id: 'team',      label: 'Team',      icon: 'shield_person' },
  { id: 'reports',   label: 'Reports',   icon: 'bar_chart' },
];

export default function BottomNav({ currentPage, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav pb-safe no-print">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '4rem',
        padding: '0 0.25rem',
        maxWidth: '32rem',
        margin: '0 auto',
      }}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={currentPage === item.id ? 'page' : undefined}
          >
            <span className="material-symbols-outlined nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
