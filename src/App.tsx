import { useEffect, useMemo, useRef, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { useIsDesktop } from './lib/useMediaQuery'
import { AppShell, NAV_ICONS, SUPER_ADMIN_NAV_ICON, type AppView, type NavEntry } from './components/shell/AppShell'
import { fetchNavAttention, type NavAttention } from './lib/navAttention'
import { applyNavClick } from './lib/navReset'
import { shouldShowSecurityBadge } from './lib/securityBadge'
import { AdminSegmentBar } from './components/admin/AdminSegmentBar'
import { EmptyState } from './components/ui/EmptyState'
import { EventListSkeleton } from './components/ui/Skeleton'
import { ToastProvider } from './components/ui/Toast'
import { Button } from './components/ui/Button'
import { OtpGate } from './components/otp/OtpGate'
import { ShieldAlert } from 'lucide-react'
import {
  ADMIN_MOBILE_HUB_VIEWS,
  ADMIN_SEGMENTS,
  isAdminSegment,
} from './lib/adminSegments'
import { reportsNavPlacement } from './lib/reports/access'
import { defaultHomeView } from './lib/defaultHomeView'
import { SHIFT_LEAD_NAV_SECTION, isSidebarCreateEventCurrent } from './lib/sidebarCreate'
import { discardAbandonedEmptyEventIfAny } from './lib/eventForm'
import { AdminListsPage } from './pages/AdminListsPage'
import { SETTINGS_BOT_KEY, type SettingsPaneKey } from './lib/settingsPanes'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { UsersMapPage } from './pages/UsersMapPage'
import { FuelQuarterPage } from './pages/FuelQuarterPage'
import { ReportsPage } from './pages/ReportsPage'
import { CockpitPage } from './pages/CockpitPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { EventFormPage } from './pages/EventFormPage'
import { EventsPage } from './pages/EventsPage'
import { LoginPage } from './pages/LoginPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { AndroidDownloadPage } from './pages/AndroidDownloadPage'
import { IosDownloadPage } from './pages/IosDownloadPage'
import { DeleteDataPage } from './pages/DeleteDataPage'
import { ProfilePage } from './pages/ProfilePage'
import { LiveTrackPage } from './pages/LiveTrackPage'
import { parseTrackTokenFromSearch } from './lib/liveTrack'
import { ResponderFillPage } from './pages/ResponderFillPage'
import { ShiftDetailPage } from './pages/ShiftDetailPage'
import { ShiftFormPage } from './pages/ShiftFormPage'
import { ShiftsPage } from './pages/ShiftsPage'
import { ContactsPage } from './pages/ContactsPage'
import { FeedbackInboxPage } from './pages/FeedbackInboxPage'
import { EventLocationsPage } from './pages/EventLocationsPage'
import { EventAuditPage } from './pages/EventAuditPage'
import { canManageFeedbackInbox } from './lib/userFeedback'
import { canAccessSuperAdminNav } from './lib/superAdminAccess'
import { IMPERSONATION_CHANGE_EVENT, isImpersonating } from './lib/impersonationStash'
import { ROLE_PREVIEW_CHANGE_EVENT, isRolePreviewing } from './lib/rolePreviewStash'
import { usePresenceHeartbeat } from './lib/usePresenceHeartbeat'
import { fetchOtpStatus } from './lib/phoneOtp'
import {
  clearPostLoginFill,
  consumeFillEventTarget,
  parseFillTokenFromSearch,
  stashPostLoginFill,
} from './lib/fillTokenIntent'
import { loadFillByToken } from './lib/responderFillToken'
import { captureAppPageview } from './lib/posthog'
import { appAnalyticsPath } from './lib/posthogAppPath'
import { isAndroidDownloadPath } from './lib/androidDownload'
import { isIosDownloadPath } from './lib/iosDownload'
import { isDeleteDataPath } from './lib/deleteDataPage'
import { verifyPrivacyPageAccess } from './lib/privacyPageAccess'
import { isPrivacyPath, parsePrivacyTokenFromSearch } from './lib/privacyPageToken'
import {
  applyAppUrl,
  isAllowedAppView,
  parseAppPath,
  readBootRoute,
  shouldSyncAppUrl,
  type EventSurface,
  type ShiftSurface,
} from './lib/appRoute'
import { isOAuthAuthorizePath, parseOAuthAuthorizeRequest } from './lib/partnerOAuth'
import { OAuthAuthorizePage } from './pages/OAuthAuthorizePage'

function readWindowBoot() {
  if (typeof window === 'undefined') {
    return {
      view: null as AppView | null,
      eventSurface: { kind: 'list' } as EventSurface,
      shiftSurface: { kind: 'list' } as ShiftSurface,
      cockpitEventId: undefined as string | undefined,
      legalPage: null as 'privacy' | 'android' | 'ios' | 'delete_data' | null,
    }
  }
  return readBootRoute(window.location.pathname)
}

function Gate() {
  const { session, loading, roles, passwordSetupReason, user, profile } = useAuth()
  const isDesktop = useIsDesktop()
  const boot = useRef(readWindowBoot()).current
  const trackToken = useRef(
    typeof window === 'undefined' ? null : parseTrackTokenFromSearch(window.location.search),
  ).current
  const homeAdoptedRef = useRef(false)
  const [view, setView] = useState<AppView | null>(boot.view)
  const [legalPage, setLegalPage] = useState<'privacy' | 'android' | 'ios' | 'delete_data' | null>(boot.legalPage)
  const [eventSurface, setEventSurface] = useState<EventSurface>(boot.eventSurface)
  const [shiftSurface, setShiftSurface] = useState<ShiftSurface>(boot.shiftSurface)
  const [sectionReset, setSectionReset] = useState(0)
  const [eventCreateNonce, setEventCreateNonce] = useState(0)
  const [cockpitEventId, setCockpitEventId] = useState<string | undefined>(boot.cockpitEventId)
  const [navAttention, setNavAttention] = useState<NavAttention>({
    mineEvents: false,
    myShifts: false,
    openFeedback: false,
  })
  const [loginOtp, setLoginOtp] = useState<
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'required'; maskedPhone: string | null }
    | { state: 'ok' }
  >({ state: 'idle' })
  const [superAdminChrome, setSuperAdminChrome] = useState(() => ({
    impersonating: isImpersonating(),
    previewing: isRolePreviewing(),
  }))
  const [tokenFill, setTokenFill] = useState<
    | { status: 'idle' }
    | { status: 'checking' }
    | { status: 'ready'; fillToken: string; eventId: string; responderId?: string }
    | { status: 'blocked'; message: string }
  >({ status: 'idle' })
  const [fillBootDone, setFillBootDone] = useState(false)
  const [privacyGate, setPrivacyGate] = useState<
    | { status: 'idle' }
    | { status: 'checking' }
    | { status: 'embedded' }
  >({ status: 'idle' })
  const [listsPane, setListsPane] = useState<SettingsPaneKey | undefined>()

  // Resolve ?fill_token=… before requiring login (scoped fill link).
  useEffect(() => {
    const token = parseFillTokenFromSearch(window.location.search)
    if (!token) {
      setFillBootDone(true)
      return
    }

    let active = true
    setTokenFill({ status: 'checking' })
    loadFillByToken(token)
      .then((result) => {
        if (!active) return
        if (result.ok) {
          setTokenFill({
            status: 'ready',
            fillToken: token,
            eventId: result.context.eventId,
            responderId: (result.context as { responderId?: string }).responderId,
          })
        } else {
          if (result.eventId) stashPostLoginFill(result.eventId)
          setTokenFill({
            status: 'blocked',
            message: result.error,
          })
        }
        setFillBootDone(true)
      })
      .catch(() => {
        if (!active) return
        setTokenFill({
          status: 'blocked',
          message: 'קישור הדיווח אינו תקין או שפג תוקפו.',
        })
        setFillBootDone(true)
      })

    return () => {
      active = false
    }
  }, [])

  // App-minted HMAC on /privacy?t=… — show the policy without a second login.
  useEffect(() => {
    if (!isPrivacyPath(window.location.pathname)) {
      setPrivacyGate({ status: 'idle' })
      return
    }
    const token = parsePrivacyTokenFromSearch(window.location.search)
    if (!token) {
      setPrivacyGate({ status: 'idle' })
      return
    }

    let active = true
    setPrivacyGate({ status: 'checking' })
    verifyPrivacyPageAccess(token)
      .then((ok) => {
        if (!active) return
        if (ok) {
          setLegalPage('privacy')
          setPrivacyGate({ status: 'embedded' })
        } else {
          setPrivacyGate({ status: 'idle' })
        }
      })
      .catch(() => {
        if (!active) return
        setPrivacyGate({ status: 'idle' })
      })

    return () => {
      active = false
    }
  }, [])

  // After login (+ OTP), open fill from ?fill_event= or stashed post-login intent.
  const fillReturnApplied = useRef(false)
  useEffect(() => {
    if (!session || passwordSetupReason || !fillBootDone) return
    if (profile?.otp_login_enabled && loginOtp.state !== 'ok') return
    if (!profile?.otp_login_enabled && loginOtp.state !== 'ok' && loginOtp.state !== 'idle') return
    if (fillReturnApplied.current) return

    // Logged-in user opening a valid fill_token for themselves.
    if (tokenFill.status === 'ready' && user) {
      if (tokenFill.responderId && tokenFill.responderId !== user.id) {
        fillReturnApplied.current = true
        setTokenFill({
          status: 'blocked',
          message: 'אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.',
        })
        return
      }
      fillReturnApplied.current = true
      clearPostLoginFill()
      setView('mine')
      setEventSurface({ kind: 'fill', eventId: tokenFill.eventId, returnTo: 'list' })
      setTokenFill({ status: 'idle' })
      return
    }

    const target = consumeFillEventTarget(window.location.search)
    if (!target) return
    fillReturnApplied.current = true
    setView('mine')
    setEventSurface({ kind: 'fill', eventId: target, returnTo: 'list' })
  }, [
    session,
    passwordSetupReason,
    loginOtp.state,
    profile?.otp_login_enabled,
    user,
    tokenFill,
    fillBootDone,
  ])

  const isAdmin = roles.includes('admin')
  const isSuperAdmin = canManageFeedbackInbox(roles)
  const showSuperAdminNav = canAccessSuperAdminNav({
    roles,
    impersonating: superAdminChrome.impersonating,
    previewing: superAdminChrome.previewing,
  })
  const manages = isAdmin || roles.includes('shift_lead')
  const responds = roles.includes('responder')
  // Leads also go on events — same personal list/fill surface, not only the responder role.
  const hasMineList = responds || roles.includes('shift_lead')
  const fallbackView: AppView = defaultHomeView({ manages, hasMineList, isAdmin })

  useEffect(() => {
    const sync = () =>
      setSuperAdminChrome({
        impersonating: isImpersonating(),
        previewing: isRolePreviewing(),
      })
    window.addEventListener(IMPERSONATION_CHANGE_EVENT, sync)
    window.addEventListener(ROLE_PREVIEW_CHANGE_EVENT, sync)
    return () => {
      window.removeEventListener(IMPERSONATION_CHANGE_EVENT, sync)
      window.removeEventListener(ROLE_PREVIEW_CHANGE_EVENT, sync)
    }
  }, [])

  useEffect(() => {
    if (
      !shouldSyncAppUrl({
        trackToken: Boolean(trackToken),
        oauthPath: isOAuthAuthorizePath(window.location.pathname),
        passwordSetup: Boolean(passwordSetupReason),
        fillTokenOwnsUrl:
          !session && (tokenFill.status === 'checking' || tokenFill.status === 'ready'),
        privacyChecking: privacyGate.status === 'checking',
      })
    ) {
      return
    }

    if (
      legalPage === 'android' ||
      legalPage === 'ios' ||
      legalPage === 'privacy' ||
      legalPage === 'delete_data'
    ) {
      applyAppUrl(window.history, window.location, {
        view: view ?? fallbackView,
        eventSurface,
        shiftSurface,
        cockpitEventId,
        legalPage,
      })
      return
    }

    if (!session || loginOtp.state !== 'ok') return

    const nextView =
      view && isAllowedAppView(view, { manages, hasMineList, isAdmin, isSuperAdmin })
        ? view
        : fallbackView
    const adoptHome = !homeAdoptedRef.current
    applyAppUrl(
      window.history,
      window.location,
      {
        view: nextView,
        eventSurface,
        shiftSurface,
        cockpitEventId: nextView === 'cockpit' ? cockpitEventId : undefined,
        legalPage: null,
      },
      { adoptHome },
    )
    homeAdoptedRef.current = true
  }, [
    trackToken,
    passwordSetupReason,
    session,
    tokenFill.status,
    privacyGate.status,
    legalPage,
    view,
    eventSurface,
    shiftSurface,
    cockpitEventId,
    loginOtp.state,
    manages,
    hasMineList,
    isAdmin,
    isSuperAdmin,
    fallbackView,
  ])

  useEffect(() => {
    function onPop() {
      const parsed = parseAppPath(window.location.pathname)
      if (parsed.kind === 'android') {
        setLegalPage('android')
        return
      }
      if (parsed.kind === 'ios') {
        setLegalPage('ios')
        return
      }
      if (parsed.kind === 'delete_data') {
        setLegalPage('delete_data')
        return
      }
      if (parsed.kind === 'privacy') {
        setLegalPage('privacy')
        return
      }
      if (parsed.kind === 'oauth') return
      setLegalPage(null)
      if (parsed.kind === 'app') {
        setView(parsed.state.view)
        setEventSurface(parsed.state.eventSurface)
        setShiftSurface(parsed.state.shiftSurface)
        setCockpitEventId(parsed.state.cockpitEventId)
        return
      }
      setCockpitEventId(undefined)
      setEventSurface({ kind: 'list' })
      setShiftSurface({ kind: 'list' })
      setView(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function openAndroidDownload() {
    setLegalPage('android')
  }

  function openIosDownload() {
    setLegalPage('ios')
  }

  function closeLegalPage() {
    if (
      isAndroidDownloadPath(window.location.pathname) ||
      isIosDownloadPath(window.location.pathname) ||
      isDeleteDataPath(window.location.pathname) ||
      isPrivacyPath(window.location.pathname)
    ) {
      window.history.back()
      return
    }
    setLegalPage(null)
  }

  // Refresh attention when returning to list surfaces after fill/save.
  const attentionRefreshKey = `${eventSurface.kind}:${shiftSurface.kind}:${view}`

  useEffect(() => {
    if (!user || (!hasMineList && !isSuperAdmin)) {
      setNavAttention({ mineEvents: false, myShifts: false, openFeedback: false })
      return
    }

    let active = true
    fetchNavAttention(user.id, { feedbackInbox: isSuperAdmin })
      .then((next) => {
        if (active) setNavAttention(next)
      })
      .catch(() => {
        // Fail closed — no dots if the check cannot run.
        if (active) setNavAttention({ mineEvents: false, myShifts: false, openFeedback: false })
      })

    return () => {
      active = false
    }
  }, [hasMineList, isSuperAdmin, user, attentionRefreshKey])

  const analyticsPath = useMemo(
    () =>
      appAnalyticsPath({
        loading:
          loading ||
          !fillBootDone ||
          tokenFill.status === 'checking' ||
          privacyGate.status === 'checking',
        signedIn: Boolean(session),
        passwordSetup: Boolean(passwordSetupReason),
        tokenFill: tokenFill.status === 'idle' ? 'idle' : tokenFill.status,
        tokenEventId: tokenFill.status === 'ready' ? tokenFill.eventId : undefined,
        tracking: Boolean(trackToken),
        otp: loginOtp.state,
        legalPage,
        oauthAuthorize:
          typeof window !== 'undefined' && isOAuthAuthorizePath(window.location.pathname),
        view: view ?? fallbackView,
        eventKind: eventSurface.kind,
        eventId:
          (view ?? fallbackView) === 'cockpit'
            ? cockpitEventId
            : eventSurface.kind === 'list'
              ? undefined
              : eventSurface.eventId,
        shiftKind: shiftSurface.kind,
        shiftId: shiftSurface.kind === 'list' ? undefined : shiftSurface.shiftId,
      }),
    [
      loading,
      fillBootDone,
      tokenFill,
      privacyGate.status,
      trackToken,
      session,
      passwordSetupReason,
      loginOtp.state,
      legalPage,
      view,
      fallbackView,
      eventSurface,
      shiftSurface,
      cockpitEventId,
    ],
  )

  useEffect(() => {
    if (analyticsPath) captureAppPageview(analyticsPath)
  }, [analyticsPath])

  useEffect(() => {
    if (!session || passwordSetupReason) {
      setLoginOtp({ state: 'idle' })
      return
    }

    if (isImpersonating() || !profile?.otp_login_enabled) {
      setLoginOtp({ state: 'ok' })
      return
    }

    let active = true
    setLoginOtp({ state: 'checking' })
    fetchOtpStatus()
      .then((status) => {
        if (!active) return
        if ('error' in status) {
          // Flag is on — fail closed into the OTP gate (user can resend / retry).
          setLoginOtp({ state: 'required', maskedPhone: null })
          return
        }
        if (status.loginRequired) {
          setLoginOtp({ state: 'required', maskedPhone: status.maskedPhone })
        } else {
          setLoginOtp({ state: 'ok' })
        }
      })
      .catch(() => {
        if (active) setLoginOtp({ state: 'required', maskedPhone: null })
      })

    return () => {
      active = false
    }
  }, [session, passwordSetupReason, user?.id, profile?.otp_login_enabled])

  usePresenceHeartbeat(Boolean(session && !passwordSetupReason && loginOtp.state === 'ok'))

  const entries = useMemo(() => {
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
        alsoCurrentFor: ['feedback', 'event_locations', 'event_audit'],
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
            view: 'event_audit',
            label: 'יומן שינויים',
            icon: NAV_ICONS.event_audit,
          },
        ],
      })
    }

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
    if (isDesktop) {
      list.push({
        view: 'profile',
        label: 'פרופיל',
        icon: NAV_ICONS.profile,
        pin: 'end',
      })
    }

    return list
  }, [manages, hasMineList, isAdmin, showSuperAdminNav, isDesktop, navAttention, roles])

  function isAllowedView(next: AppView): boolean {
    return isAllowedAppView(next, { manages, hasMineList, isAdmin, isSuperAdmin })
  }

  if (trackToken) {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <LiveTrackPage trackToken={trackToken} />
        </main>
      </div>
    )
  }

  if (privacyGate.status === 'checking') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <EventListSkeleton count={3} />
        </main>
      </div>
    )
  }

  if (legalPage === 'privacy' && privacyGate.status === 'embedded') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <PrivacyPolicyPage />
        </main>
      </div>
    )
  }

  if (legalPage === 'delete_data') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <DeleteDataPage onBack={closeLegalPage} />
        </main>
      </div>
    )
  }

  if (loading || !fillBootDone || tokenFill.status === 'checking') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <EventListSkeleton count={3} />
        </main>
      </div>
    )
  }

  if (legalPage === 'android') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <AndroidDownloadPage onBack={closeLegalPage} />
        </main>
      </div>
    )
  }

  if (legalPage === 'ios') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <IosDownloadPage onBack={closeLegalPage} />
        </main>
      </div>
    )
  }

  // Invite/recovery gate is driven by intent, not by an existing session.
  // verifyOtp may still be binding the session; never fall through to sign-in.
  if (passwordSetupReason) {
    return (
      <LoginPage
        key={`setup-${passwordSetupReason}`}
        forceSetPassword
        onOpenAndroid={openAndroidDownload}
        onOpenIos={openIosDownload}
        onOpenPrivacy={() => setLegalPage('privacy')}
      />
    )
  }

  // Scoped fill link — no Auth session required while the token is valid.
  if (!session && tokenFill.status === 'ready') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <ResponderFillPage
            eventId={tokenFill.eventId}
            fillToken={tokenFill.fillToken}
            onBack={() => {
              setTokenFill({ status: 'idle' })
              try {
                const url = new URL(window.location.href)
                url.searchParams.delete('fill_token')
                window.history.replaceState({}, '', url.pathname + url.search + url.hash)
              } catch {
                /* ignore */
              }
            }}
            onCompleted={() => {
              setTokenFill({ status: 'idle' })
              try {
                const url = new URL(window.location.href)
                url.searchParams.delete('fill_token')
                window.history.replaceState({}, '', url.pathname + url.search + url.hash)
              } catch {
                /* ignore */
              }
            }}
          />
        </main>
      </div>
    )
  }

  if (!session) {
    if (legalPage === 'privacy') {
      return (
        <div className="shell" data-theme="field">
          <main className="shell__main">
            <PrivacyPolicyPage onBack={() => setLegalPage(null)} />
          </main>
        </div>
      )
    }
    if (legalPage === 'delete_data') {
      return (
        <div className="shell" data-theme="field">
          <main className="shell__main">
            <DeleteDataPage onBack={() => setLegalPage(null)} />
          </main>
        </div>
      )
    }
    return (
      <>
        {tokenFill.status === 'blocked' ? (
          <div className="shell" data-theme="field">
            <main className="shell__main">
              <EmptyState
                icon={<ShieldAlert size={40} strokeWidth={1.75} aria-hidden="true" />}
                title="קישור הדיווח"
                caption={tokenFill.message}
                action={
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setTokenFill({ status: 'idle' })}
                  >
                    להמשך להתחברות
                  </Button>
                }
              />
            </main>
          </div>
        ) : (
          <LoginPage
            key="signin"
            onOpenAndroid={openAndroidDownload}
            onOpenIos={openIosDownload}
            onOpenPrivacy={() => setLegalPage('privacy')}
          />
        )}
      </>
    )
  }

  if (loginOtp.state === 'checking' || loginOtp.state === 'idle') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <EventListSkeleton count={3} />
        </main>
      </div>
    )
  }

  if (loginOtp.state === 'required') {
    return (
      <OtpGate
        purpose="login_device"
        maskedPhone={loginOtp.maskedPhone}
        onVerified={() => setLoginOtp({ state: 'ok' })}
      />
    )
  }

  if (isOAuthAuthorizePath(window.location.pathname)) {
    const parsed = parseOAuthAuthorizeRequest({
      pathname: window.location.pathname,
      search: window.location.search,
    })
    if (!parsed.ok) {
      return <OAuthAuthorizePage request={null} error={parsed.error} />
    }
    return <OAuthAuthorizePage request={parsed.request} />
  }

  // Role allowlist — not nav entries — so profile / fuel / lists / reports stay
  // reachable when omitted from the mobile tab bar.
  const activeView: AppView = view && isAllowedView(view) ? view : fallbackView

  const isAdminHub = isAdmin && isAdminSegment(activeView)
  const onEvents = activeView === 'events' || activeView === 'mine'
  const onShifts = activeView === 'shifts' || activeView === 'my_shifts'
  const onReports = activeView === 'reports'
  const eventOverlay = eventSurface.kind !== 'list'
  const onEventHost = onEvents || onReports || (onShifts && eventOverlay)
  const scope: 'unit' | 'mine' = manages && activeView !== 'mine' ? 'unit' : 'mine'
  const shiftScope: 'unit' | 'mine' = manages && activeView !== 'my_shifts' ? 'unit' : 'mine'

  const onCockpit = activeView === 'cockpit'
  const immersiveSurface =
    onCockpit ||
    (onEventHost && (eventSurface.kind === 'form' || eventSurface.kind === 'fill')) ||
    (onShifts && eventOverlay) ||
    (onShifts && (shiftSurface.kind === 'form' || shiftSurface.kind === 'detail'))

  // Desktop always keeps the sidebar — no replacement top bar on forms/detail/fill.
  const shellWithSidebar = isDesktop
  const shellNarrow = isDesktop && immersiveSurface && !onCockpit
  // Manager desktop layout (tables / wide pages). Chrome is Command; content is Field.
  const commandShell = isDesktop && (manages || isAdminHub)

  function navigate(next: AppView) {
    void discardAbandonedEmptyEventIfAny()
    const nextState = applyNavClick(
      { view: view ?? fallbackView, eventSurface, shiftSurface, sectionReset },
      next,
    )
    if (next !== 'lists' || view === 'lists') setListsPane(undefined)
    setLegalPage(null)
    setEventSurface(nextState.eventSurface)
    setShiftSurface(nextState.shiftSurface)
    setCockpitEventId(undefined)
    setView(nextState.view)
    setSectionReset(nextState.sectionReset)
  }

  function goHome() {
    setLegalPage(null)
    navigate(fallbackView)
  }

  function openNewEventForm() {
    setLegalPage(null)
    setView('events')
    setEventCreateNonce((n) => n + 1)
    setEventSurface({ kind: 'form' })
    setShiftSurface({ kind: 'list' })
  }

  return (
    <AppShell
      withSidebar={shellWithSidebar}
      narrow={shellNarrow}
      showSecurityBadge={shouldShowSecurityBadge(immersiveSurface) && legalPage === null}
      onOpenPrivacy={() => setLegalPage('privacy')}
      onOpenAndroid={openAndroidDownload}
      onOpenIos={openIosDownload}
      view={activeView}
      onNavigate={navigate}
      onHome={goHome}
      entries={entries}
      onCreateEvent={manages ? openNewEventForm : undefined}
      creatingEvent={isSidebarCreateEventCurrent(eventSurface)}
      feedbackPagePath={analyticsPath}
    >
      {legalPage === 'privacy' ? (
        <PrivacyPolicyPage onBack={closeLegalPage} />
      ) : legalPage === 'delete_data' ? (
        <DeleteDataPage onBack={closeLegalPage} />
      ) : onCockpit ? (
        <CockpitPage
          key={sectionReset}
          selectedEventId={cockpitEventId}
          onSelectEvent={setCockpitEventId}
        />
      ) : (
      <>
        {onReports ? (
          <div hidden={eventSurface.kind !== 'list'}>
            <div
              className={['stack-4', commandShell ? 'page--wide' : ''].filter(Boolean).join(' ')}
            >
              {isAdmin && !isDesktop ? (
                <AdminSegmentBar view="reports" onChange={navigate} />
              ) : null}
              <ReportsPage
                key={sectionReset}
                asTable={Boolean(commandShell)}
                onOpenEvent={(eventId) => setEventSurface({ kind: 'detail', eventId })}
              />
            </div>
          </div>
        ) : null}
        {onEventHost && eventSurface.kind === 'form' ? (
        <EventFormPage
          key={`event-form-${eventCreateNonce}`}
          eventId={eventSurface.eventId}
          focusResponderId={eventSurface.focusResponderId}
          onCancel={(result) =>
            setEventSurface(
              result?.discarded || !eventSurface.eventId
                ? { kind: 'list' }
                : { kind: 'detail', eventId: eventSurface.eventId },
            )
          }
          onEventId={(id) =>
            setEventSurface({
              kind: 'form',
              eventId: id,
              focusResponderId: eventSurface.focusResponderId,
            })
          }
          onSaved={(id) => setEventSurface({ kind: 'detail', eventId: id })}
          onSavedAndCreateNew={openNewEventForm}
        />
      ) : onEventHost && eventSurface.kind === 'fill' ? (
        <ResponderFillPage
          eventId={eventSurface.eventId}
          onBack={() =>
            setEventSurface(
              eventSurface.returnTo === 'detail'
                ? { kind: 'detail', eventId: eventSurface.eventId }
                : { kind: 'list' },
            )
          }
          onCompleted={() =>
            setEventSurface(
              eventSurface.returnTo === 'detail'
                ? { kind: 'detail', eventId: eventSurface.eventId }
                : { kind: 'list' },
            )
          }
        />
      ) : onEventHost && eventSurface.kind === 'detail' ? (
        <EventDetailPage
          eventId={eventSurface.eventId}
          onBack={() => setEventSurface({ kind: 'list' })}
          onEdit={
            manages
              ? () => setEventSurface({ kind: 'form', eventId: eventSurface.eventId })
              : undefined
          }
          onFillOwn={() =>
            setEventSurface({
              kind: 'fill',
              eventId: eventSurface.eventId,
              returnTo: 'detail',
            })
          }
          onEditLeadFields={
            manages
              ? (responderId) =>
                  setEventSurface({
                    kind: 'form',
                    eventId: eventSurface.eventId,
                    focusResponderId: responderId,
                  })
              : undefined
          }
        />
      ) : onReports ? null : onShifts && shiftSurface.kind === 'form' ? (
        <ShiftFormPage
          shiftId={shiftSurface.shiftId}
          onBack={() =>
            setShiftSurface(
              shiftSurface.shiftId
                ? { kind: 'detail', shiftId: shiftSurface.shiftId }
                : { kind: 'list' },
            )
          }
          onSaved={(id) => setShiftSurface({ kind: 'detail', shiftId: id })}
        />
      ) : onShifts && shiftSurface.kind === 'detail' ? (
        <ShiftDetailPage
          shiftId={shiftSurface.shiftId}
          canManage={manages}
          isAdmin={isAdmin}
          onBack={() => setShiftSurface({ kind: 'list' })}
          onEdit={() => setShiftSurface({ kind: 'form', shiftId: shiftSurface.shiftId })}
          onDeleted={() => setShiftSurface({ kind: 'list' })}
          onOpenEvent={(eventId) => setEventSurface({ kind: 'detail', eventId })}
        />
      ) : activeView === 'profile' ? (
        <ProfilePage
          onOpenBotSettings={
            isAdmin
              ? () => {
                  setListsPane(SETTINGS_BOT_KEY)
                  navigate('lists')
                }
              : undefined
          }
        />
      ) : activeView === 'map' ? (
        <div className="page--wide">
          <UsersMapPage key={sectionReset} />
        </div>
      ) : activeView === 'feedback' && isSuperAdmin ? (
        <FeedbackInboxPage key={sectionReset} />
      ) : activeView === 'event_locations' && isSuperAdmin ? (
        <EventLocationsPage
          key={sectionReset}
          onOpenEvent={(eventId) => {
            setView('events')
            setEventSurface({ kind: 'detail', eventId })
            setShiftSurface({ kind: 'list' })
          }}
        />
      ) : activeView === 'event_audit' && isSuperAdmin ? (
        <EventAuditPage key={sectionReset} />
      ) : isAdminHub && isAdminSegment(activeView) ? (
          <div
            className={['stack-4', activeView === 'users' ? 'page--wide page--users' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {!isDesktop ? (
              <AdminSegmentBar view={activeView} onChange={navigate} />
            ) : null}
            {activeView === 'lists' ? (
              <AdminListsPage key={sectionReset} initialPane={listsPane} />
            ) : activeView === 'fuel_quarter' ? (
              <FuelQuarterPage key={sectionReset} />
            ) : (
              <AdminUsersPage key={sectionReset} />
            )}
          </div>
      ) : activeView === 'contacts' ? (
        <div className={isDesktop ? 'page--wide' : undefined}>
          <ContactsPage key={sectionReset} />
        </div>
      ) : onShifts ? (
        <ShiftsPage
          key={sectionReset}
          scope={shiftScope}
          asTable={Boolean(commandShell && shiftScope === 'unit')}
          canManage={manages && shiftScope === 'unit'}
          onOpen={(shiftId) => setShiftSurface({ kind: 'detail', shiftId })}
          onFill={(shiftId) => setShiftSurface({ kind: 'form', shiftId })}
          onOpenEvent={(eventId) => setEventSurface({ kind: 'detail', eventId })}
          onCreate={
            manages && shiftScope === 'unit'
              ? () => setShiftSurface({ kind: 'form' })
              : undefined
          }
        />
      ) : onEvents ? (
        <EventsPage
          key={sectionReset}
          scope={scope}
          asTable={Boolean(commandShell && scope === 'unit')}
          canCreate={manages && scope === 'unit'}
          onOpen={(eventId) => setEventSurface({ kind: 'detail', eventId })}
          onCreate={openNewEventForm}
          onFill={
            hasMineList
              ? (eventId) => setEventSurface({ kind: 'fill', eventId, returnTo: 'list' })
              : undefined
          }
        />
      ) : null}
      </>
      )}
    </AppShell>
  )
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
