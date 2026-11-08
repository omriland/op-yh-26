import { ADMIN_MOBILE_HUB_VIEWS, ADMIN_SEGMENTS } from '../../lib/adminSegments'
import type { AppRole } from '../../lib/auth'
import type { NavAttention } from '../../lib/navAttention'
import { reportsNavPlacement } from '../../lib/reports/access'
import { SHIFT_LEAD_NAV_SECTION } from '../../lib/sidebarCreate'
import { NAV_ICONS, SUPER_ADMIN_NAV_ICON, type NavEntry } from './AppShell'

export type NavEntriesInput = {
  manages: boolean
  hasMineList: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  showSuperAdminNav: boolean
  isDesktop: boolean
  navAttention: NavAttention
  roles: AppRole[]
}

/** Role-filtered nav entries. The desktop shell regroups these (lib/desktopNav.ts). */
export function buildNavEntries({
  manages,
  hasMineList,
  isAdmin,
  isSuperAdmin,
  showSuperAdminNav,
  isDesktop,
  navAttention,
  roles,
}: NavEntriesInput): NavEntry[] {
  const list: NavEntry[] = []

  // Personal — top of nav for anyone who goes on calls.
  if (hasMineList) {
    list.push({
      view: 'mine',
      label: 'האירועים שלי',
      icon: NAV_ICONS.mine,
      attention: navAttention.mineEvents,
    })
    list.push({
      view: 'my_shifts',
      label: 'המשמרות שלי',
      icon: NAV_ICONS.my_shifts,
      attention: navAttention.myShifts,
    })
  }

  list.push({
    view: 'contacts',
    label: 'אנשי קשר',
    icon: NAV_ICONS.contacts,
  })
  list.push({
    view: 'map',
    label: 'מפה',
    icon: NAV_ICONS.map,
  })

  // Shift-lead tools (admins also get these via manages).
  if (manages) {
    if (isDesktop) {
      list.push({
        view: 'cockpit',
        label: 'הקוקפיט',
        icon: NAV_ICONS.cockpit,
        section: SHIFT_LEAD_NAV_SECTION,
      })
    }
    list.push({
      view: 'events',
      label: 'אירועים',
      icon: NAV_ICONS.events,
      section: SHIFT_LEAD_NAV_SECTION,
    })
    list.push({
      view: 'shifts',
      label: 'משמרות',
      icon: NAV_ICONS.shifts,
      section: SHIFT_LEAD_NAV_SECTION,
    })
    if (reportsNavPlacement(roles) === 'shift_lead') {
      list.push({
        view: 'reports',
        label: isDesktop ? 'דוחות וסטטיסטיקות' : 'דוחות',
        icon: NAV_ICONS.reports,
        section: isDesktop ? SHIFT_LEAD_NAV_SECTION : undefined,
      })
    }
  }

  if (showSuperAdminNav) {
    list.push({
      menuId: 'super_admin',
      label: 'סופר־אדמין',
      icon: SUPER_ADMIN_NAV_ICON,
      section: isDesktop ? 'ניהול' : undefined,
      attention: navAttention.openFeedback,
      alsoCurrentFor: [
        'feedback',
        'event_locations',
        'event_audit',
        'ios_devices',
        'highway_junctions',
      ],
      children: [
        {
          view: 'feedback',
          label: 'משוב',
          icon: NAV_ICONS.feedback,
          attention: navAttention.openFeedback,
        },
        {
          view: 'event_locations',
          label: 'מיקומים',
          icon: NAV_ICONS.event_locations,
        },
        {
          view: 'highway_junctions',
          label: 'צמתים',
          icon: NAV_ICONS.highway_junctions,
        },
        {
          view: 'event_audit',
          label: 'יומן שינויים',
          icon: NAV_ICONS.event_audit,
        },
        // מכשירי iOS: no nav entry by request; /ios-devices still opens the page.
      ],
    })
  }

  // Every role searches; RLS scopes what each one finds. Desktop moves it to the top bar.
  list.push({
    view: 'search',
    label: 'חיפוש',
    icon: NAV_ICONS.search,
    section: isDesktop && isAdmin ? 'ניהול' : undefined,
  })

  if (isAdmin) {
    if (isDesktop) {
      for (const segment of ADMIN_SEGMENTS) {
        const settings = segment.id === 'lists'
        list.push({
          view: segment.id,
          label: segment.label,
          icon: NAV_ICONS[segment.id],
          section: settings ? undefined : 'ניהול',
          pin: settings ? 'end' : undefined,
        })
      }
    } else {
      // Mobile: one ניהול tab; other admin views via the segment control.
      list.push({
        view: 'users',
        label: 'ניהול',
        icon: NAV_ICONS.users,
        alsoCurrentFor: ADMIN_MOBILE_HUB_VIEWS,
      })
    }
  }

  // Profile + Settings: desktop sidebar footer — mobile uses the app-bar / admin hub.
  // Super Admin opens profile from the avatar menu only (no sidebar pin).
  if (isDesktop && !isSuperAdmin) {
    list.push({
      view: 'profile',
      label: 'פרופיל',
      icon: NAV_ICONS.profile,
      pin: 'end',
    })
  }

  return list
}
