import { useEffect, useMemo, useRef, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { useIsDesktop } from './lib/useMediaQuery'
import { AppShell, type AppView } from './components/shell/AppShell'
import { buildNavEntries } from './components/shell/navEntries'
import { fetchNavAttention, type NavAttention } from './lib/navAttention'
import { applyNavClick } from './lib/navReset'
import { AdminSegmentBar } from './components/admin/AdminSegmentBar'
import { EmptyState } from './components/ui/EmptyState'
import { EventListSkeleton } from './components/ui/Skeleton'
import { ToastProvider } from './components/ui/Toast'
import { Button } from './components/ui/Button'
import { AlertDialog } from './components/ui/AlertDialog'
import { PersonalVehiclePrompt } from './components/profile/PersonalVehiclePrompt'
import { OtpGate } from './components/otp/OtpGate'
import { ShieldAlert } from 'lucide-react'
import { isAdminSegment } from './lib/adminSegments'
import { defaultHomeView } from './lib/defaultHomeView'
import { isSidebarCreateEventCurrent } from './lib/sidebarCreate'
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
import { SupportPage } from './pages/SupportPage'
import { ProfilePage } from './pages/ProfilePage'
import { LiveTrackPage } from './pages/LiveTrackPage'
import { parseTrackTokenFromSearch } from './lib/liveTrack'
import { ResponderFillPage } from './pages/ResponderFillPage'
import { ShiftDetailPage } from './pages/ShiftDetailPage'
import { ShiftFormPage } from './pages/ShiftFormPage'
import { ShiftsPage } from './pages/ShiftsPage'
import { ContactsPage } from './pages/ContactsPage'
import { SearchPage } from './pages/SearchPage'
import { SearchCombobox, type SearchPageLink } from './components/search/SearchCombobox'
import { handOffPrepared, type PreparedQuery } from './lib/search/prepareQuery'
import { searchRoleFor } from './lib/search/searchRole'
import { statusAudienceForRoles } from './lib/eventLifecycle'
import type { PersonHit } from './lib/smartSearchApi'
import { useSearchShortcut } from './lib/searchShortcut'
import { FeedbackBoardPage } from './pages/FeedbackBoardPage'
import { EventLocationsPage } from './pages/EventLocationsPage'
import { EventAuditPage } from './pages/EventAuditPage'
import { IosDevicesAdminPage } from './pages/IosDevicesAdminPage'
import { HighwayJunctionsPage } from './pages/HighwayJunctionsPage'
import { canManageFeedbackInbox } from './lib/userFeedback'
import { canAccessSuperAdminNav } from './lib/superAdminAccess'
import { IMPERSONATION_CHANGE_EVENT, isImpersonating } from './lib/impersonationStash'
import { ROLE_PREVIEW_CHANGE_EVENT, isRolePreviewing } from './lib/rolePreviewStash'
import { usePresenceHeartbeat } from './lib/usePresenceHeartbeat'
import { usePrelaunchGate } from './lib/usePrelaunchGate'
import { PrelaunchGatePage } from './pages/PrelaunchGatePage'
import { useCobrowse } from './lib/useCobrowse'
import { fetchOtpStatus } from './lib/phoneOtp'
import { loginOtpCheck } from './lib/loginOtpGate'
import { clearOpenAdminUserForm } from './lib/adminUserFormOpen'
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
import { takePostLoginPath } from './lib/postLoginPath'
import {
  canSeeMissingKmAlert,
  fetchEventsMissingLeadKmCount,
  missingKmAlertMessage,
  readMissingKmPopupDismissed,
  shouldShowMissingKmAlert,
  writeMissingKmPopupDismissed,
} from './lib/missingKmAlert'
import { isDeleteDataPath } from './lib/deleteDataPage'
import { isSupportPath } from './lib/supportPage'
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
      searchQuery: undefined as string | undefined,
      legalPage: null as 'privacy' | 'android' | 'ios' | 'delete_data' | 'support' | null,
    }
  }
  return readBootRoute(window.location.pathname, window.location.search)
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
  const [legalPage, setLegalPage] = useState<'privacy' | 'android' | 'ios' | 'delete_data' | 'support' | null>(boot.legalPage)
  const [eventSurface, setEventSurface] = useState<EventSurface>(boot.eventSurface)
  const [shiftSurface, setShiftSurface] = useState<ShiftSurface>(boot.shiftSurface)
  const [sectionReset, setSectionReset] = useState(0)
  const [eventCreateNonce, setEventCreateNonce] = useState(0)
  const [cockpitEventId, setCockpitEventId] = useState<string | undefined>(boot.cockpitEventId)
  const [searchQuery, setSearchQuery] = useState<string | undefined>(boot.searchQuery)
  // A search result opens this user's edit dialog on משתמשים.
  const [editUserId, setEditUserId] = useState<string | undefined>()
  // The top bar field keeps its text after Enter, and mirrors the query on /search.
  const [barQuery, setBarQuery] = useState(boot.searchQuery ?? '')
  // An archive report picked in the top bar panel opens on /search.
  const [searchReportFk, setSearchReportFk] = useState<string | null>(null)
  // A person picked in search, for a role without the users page, opens אנשי קשר on them.
  const [contactsQuery, setContactsQuery] = useState<string | undefined>()
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
        } else if (result.code === 'shift_born' && result.eventId) {
          // A shared shift report has no per-person link: open it after login.
          stashPostLoginFill(result.eventId)
          setTokenFill({ status: 'idle' })
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
  const manages =
    isAdmin || roles.includes('shift_lead') || roles.includes('super_admin')
  const responds = roles.includes('responder')
  // Leads also go on events — same personal list/fill surface, not only the responder role.
  const hasMineList = responds || roles.includes('shift_lead')
  const fallbackView: AppView = defaultHomeView({ manages, hasMineList, isAdmin })

  // Desktop: ⌘K focuses the top bar search field instead (SearchCombobox).
  useSearchShortcut(!isDesktop, () => navigate('search'))
  useEffect(() => {
    if (searchQuery !== undefined) setBarQuery(searchQuery)
  }, [searchQuery])
  const [missingKmPopup, setMissingKmPopup] = useState<{ count: number } | null>(null)

  useEffect(() => {
    if (!session || loginOtp.state !== 'ok' || passwordSetupReason) return
    if (!canSeeMissingKmAlert(roles) || readMissingKmPopupDismissed()) return
    let active = true
    fetchEventsMissingLeadKmCount().then((count) => {
      if (!active || count == null || !shouldShowMissingKmAlert(count)) return
      setMissingKmPopup({ count })
    })
    return () => {
      active = false
    }
  }, [session, loginOtp.state, passwordSetupReason, roles])

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
      legalPage === 'delete_data' ||
      legalPage === 'support'
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
        searchQuery: nextView === 'search' ? searchQuery : undefined,
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
    searchQuery,
    loginOtp.state,
    manages,
    hasMineList,
    isAdmin,
    isSuperAdmin,
    fallbackView,
  ])

  useEffect(() => {
    function onPop() {
      // Back / Forward leaves the open form like a nav click does.
      void discardAbandonedEmptyEventIfAny()
      const parsed = parseAppPath(window.location.pathname, window.location.search)
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
      if (parsed.kind === 'support') {
        setLegalPage('support')
        return
      }
      if (parsed.kind === 'privacy') {
        setLegalPage('privacy')
        return
      }
      if (parsed.kind === 'oauth') return
      setLegalPage(null)
      if (parsed.kind === 'app') {
        if (parsed.state.view !== 'users') clearOpenAdminUserForm()
        setView(parsed.state.view)
        setEventSurface(parsed.state.eventSurface)
        setShiftSurface(parsed.state.shiftSurface)
        setCockpitEventId(parsed.state.cockpitEventId)
        setSearchQuery(parsed.state.searchQuery)
        setEditUserId(undefined)
        return
      }
      setCockpitEventId(undefined)
      setSearchQuery(undefined)
      setEventSurface({ kind: 'list' })
      setShiftSurface({ kind: 'list' })
      clearOpenAdminUserForm()
      setView(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function openAndroidDownload() {
    setLegalPage('android')
  }

  function requestIosLogin() {
    setLegalPage(null)
  }

  useEffect(() => {
    if (!session || legalPage) return
    const path = takePostLoginPath()
    if (!path) return
    if (isIosDownloadPath(path)) {
      setLegalPage('ios')
      if (window.location.pathname.replace(/\/+$/, '') !== path.replace(/\/+$/, '')) {
        window.history.replaceState(null, '', path)
      }
    }
  }, [session, legalPage])

  function closeLegalPage() {
    if (
      isAndroidDownloadPath(window.location.pathname) ||
      isIosDownloadPath(window.location.pathname) ||
      isDeleteDataPath(window.location.pathname) ||
      isSupportPath(window.location.pathname) ||
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

  const loginOtpClearedFor = useRef<string | null>(null)
  useEffect(() => {
    const userId = session?.user?.id ?? null
    const decision = loginOtpCheck({
      signedIn: Boolean(session?.user),
      passwordSetup: Boolean(passwordSetupReason),
      impersonating: isImpersonating(),
      otpLoginEnabled: Boolean(profile?.otp_login_enabled),
      userId,
      clearedUserId: loginOtpClearedFor.current,
    })
    if (decision === 'keep') return
    if (decision === 'idle') {
      loginOtpClearedFor.current = null
      setLoginOtp({ state: 'idle' })
      return
    }
    if (decision === 'ok') {
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
          return
        }
        if (userId) loginOtpClearedFor.current = userId
        setLoginOtp({ state: 'ok' })
      })
      .catch(() => {
        if (active) setLoginOtp({ state: 'required', maskedPhone: null })
      })

    return () => {
      active = false
    }
  }, [session, passwordSetupReason, user?.id, profile?.otp_login_enabled])

  usePresenceHeartbeat(Boolean(session && !passwordSetupReason && loginOtp.state === 'ok'))
  const prelaunch = usePrelaunchGate(
    session && !passwordSetupReason ? (user?.id ?? null) : null,
    roles,
  )
  useCobrowse({
    signedIn: Boolean(session && !passwordSetupReason && loginOtp.state === 'ok'),
    impersonating: superAdminChrome.impersonating,
    identity: profile,
  })

  const entries = useMemo(
    () =>
      buildNavEntries({
        manages,
        hasMineList,
        isAdmin,
        isSuperAdmin,
        showSuperAdminNav,
        isDesktop,
        navAttention,
        roles,
      }),
    [manages, hasMineList, isAdmin, isSuperAdmin, showSuperAdminNav, isDesktop, navAttention, roles],
  )

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

  if (legalPage === 'support') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <SupportPage onBack={closeLegalPage} />
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
    const justEnrolled =
      typeof window !== 'undefined' &&
      window.location.pathname.replace(/\/+$/, '') === '/ios/enrolled'
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <IosDownloadPage
            onBack={closeLegalPage}
            signedIn={Boolean(session)}
            onRequestLogin={requestIosLogin}
            justEnrolled={justEnrolled}
          />
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

  // Before launch every route, deep links included, stops here for members
  // who are not admins or super admins.
  if (prelaunch === 'checking') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <EventListSkeleton count={3} />
        </main>
      </div>
    )
  }

  if (prelaunch === 'blocked') {
    return <PrelaunchGatePage />
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
    if ((view ?? fallbackView) === 'users') clearOpenAdminUserForm()
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
    setSearchQuery(undefined)
    setSearchReportFk(null)
    setContactsQuery(undefined)
    setEditUserId(undefined)
    setView(nextState.view)
    setSectionReset(nextState.sectionReset)
  }

  function goHome() {
    setLegalPage(null)
    navigate(fallbackView)
  }

  const searchRole = searchRoleFor(roles)
  const searchAudience = statusAudienceForRoles(roles)
  const searchPages: SearchPageLink[] = entries
    .flatMap((entry) => [entry, ...(entry.children ?? [])])
    .filter((entry): entry is typeof entry & { view: AppView } => Boolean(entry.view) && entry.view !== 'search')
    .map((entry) => ({ view: entry.view, label: entry.label }))
  const searchShortcuts: SearchPageLink[] = (
    searchRole === 'responder'
      ? [
          { view: 'mine', label: 'האירועים שלי' },
          { view: 'my_shifts', label: 'המשמרות שלי' },
        ]
      : [
          { view: 'events', label: 'אירועי היחידה' },
          { view: 'shifts', label: 'משמרות' },
          ...(searchRole === 'admin' ? [{ view: 'users', label: 'משתמשים' }] : []),
        ]
  ).filter((link) => isAllowedView(link.view as AppView))

  function runSearchFrom(query: string, prepared?: PreparedQuery) {
    if (prepared) handOffPrepared(prepared)
    navigate('search')
    setSearchQuery(query)
    setBarQuery(query)
  }

  function openSearchEvent(eventId: string) {
    setLegalPage(null)
    setView(manages ? 'events' : 'mine')
    setEventSurface({ kind: 'detail', eventId })
    setShiftSurface({ kind: 'list' })
  }

  function openSearchPerson(person: PersonHit) {
    if (isAdmin || roles.includes('super_admin')) {
      navigate('users')
      setEditUserId(person.id)
      return
    }
    navigate('contacts')
    setContactsQuery(person.full_name)
  }

  function openSearchView(next: string) {
    if (isAllowedView(next as AppView)) navigate(next as AppView)
  }

  const searchProps = {
    role: searchRole,
    audience: searchAudience,
    onOpenEvent: openSearchEvent,
    onOpenPerson: openSearchPerson,
    onNavigate: openSearchView,
    pages: searchPages,
    shortcuts: searchShortcuts,
    canOpenReports: isAllowedView('reports'),
  }

  function openNewEventForm() {
    if ((view ?? fallbackView) === 'users') clearOpenAdminUserForm()
    void discardAbandonedEmptyEventIfAny()
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
      onOpenPrivacy={() => setLegalPage('privacy')}
      onOpenAndroid={openAndroidDownload}
      onOpenSupport={() => setLegalPage('support')}
      search={
        <SearchCombobox
          variant="bar"
          {...searchProps}
          query={barQuery}
          onQueryChange={setBarQuery}
          onSubmit={runSearchFrom}
          onOpenArchive={(fk, query) => {
            runSearchFrom(query)
            setSearchReportFk(fk)
          }}
          placeholder="חיפוש אירועים, אנשים ועמודים"
        />
      }
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
        <FeedbackBoardPage key={sectionReset} viewerId={user?.id ?? null} />
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
      ) : activeView === 'ios_devices' && isSuperAdmin ? (
        <IosDevicesAdminPage key={sectionReset} />
      ) : activeView === 'highway_junctions' && isSuperAdmin ? (
        <HighwayJunctionsPage key={sectionReset} />
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
              <AdminUsersPage key={sectionReset} editUserId={editUserId} />
            )}
          </div>
      ) : activeView === 'search' ? (
        <SearchPage
          key={sectionReset}
          {...searchProps}
          initialQuery={searchQuery ?? ''}
          onQueryChange={(q) => setSearchQuery(q || undefined)}
          initialReportFk={searchReportFk}
        />
      ) : activeView === 'contacts' ? (
        <div className={isDesktop ? 'page--wide' : undefined}>
          <ContactsPage key={`${sectionReset}:${contactsQuery ?? ''}`} initialQuery={contactsQuery} />
        </div>
      ) : onShifts ? (
        <ShiftsPage
          key={sectionReset}
          scope={shiftScope}
          asTable={Boolean(commandShell && shiftScope === 'unit')}
          canManage={manages && shiftScope === 'unit'}
          onOpen={(shiftId) => {
            setEventSurface({ kind: 'list' })
            setShiftSurface({ kind: 'detail', shiftId })
          }}
          onFill={(shiftId) => setShiftSurface({ kind: 'form', shiftId })}
          onCreate={
            manages && shiftScope === 'unit'
              ? () => setShiftSurface({ kind: 'form' })
              : undefined
          }
        />
      ) : onEvents ? (
        <EventsPage
          key={`${sectionReset}:${scope}`}
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
      <AlertDialog
        open={missingKmPopup !== null}
        status="warning"
        title="לתשומת ליבך"
        onClose={() => {
          writeMissingKmPopupDismissed()
          setMissingKmPopup(null)
        }}
        footer={
          <>
            <Button
              variant="primary"
              onClick={() => {
                writeMissingKmPopupDismissed()
                setMissingKmPopup(null)
                navigate('events')
              }}
            >
              להזנת הק״מ
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                writeMissingKmPopupDismissed()
                setMissingKmPopup(null)
              }}
            >
              תזכירו לי מאוחר יותר
            </Button>
          </>
        }
      >
        {missingKmPopup ? (
          <p className="t-body">{missingKmAlertMessage(missingKmPopup.count)}</p>
        ) : null}
      </AlertDialog>
      <PersonalVehiclePrompt
        userId={user?.id ?? null}
        enabled={missingKmPopup === null && !superAdminChrome.impersonating}
      />
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
