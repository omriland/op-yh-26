# Android responder app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native Kotlin Compose אבן דרך app in a new `yahpaz-android` repo, same screens and Supabase backend as `yahpaz-ios`.

**Architecture:** `:domain` is a JVM Kotlin module (no Android SDK) with JUnit ports of YahpazDomain. `:app` is Compose UI + supabase-kt talking to the existing project. No FCM in this slice.

**Tech Stack:** Kotlin 2.1, AGP 8.10, Compose BOM 2025.05.01, supabase-kt (BOM + auth + postgrest), minSdk 26, package `com.yahpz.responder`.

## Global Constraints

- Hebrew-only RTL UI; display name אבן דרך
- Same Supabase URL/anon key as iOS `App/Config.swift`
- Do not look like default Material; Field/Command colors from iOS Theme
- No Play Store, no FCM, no WebView
- Domain tests must pass before claiming the port is done
- `./gradlew :domain:test` and `:app:assembleDebug` are the proof commands (SDK required for the latter)

## File map

- `settings.gradle.kts`, `gradle/libs.versions.toml`, `:domain`, `:app`
- `domain/src/main/kotlin/com/yahpz/domain/*.kt`
- `domain/src/test/kotlin/com/yahpz/domain/*.kt`
- `app/src/main/java/com/yahpz/responder/` UI, API, theme
- Fonts copied from `yahpaz-ios/App/Resources`

## Tasks

### Task 1: Repo + Gradle bootstrap

- [ ] Create `/Users/omrilandman/CursorProjects/today-i/yahpaz-android` git repo
- [ ] Install JDK 21 if missing; Android SDK if possible
- [ ] Empty `:app` Hello + `:domain` library; `./gradlew :domain:test` green

### Task 2: Domain port (TDD)

- [ ] Port iOS XCTest cases as JUnit (fill, inbox, shifts, availability, format, live track)
- [ ] Implement Kotlin until tests pass

### Task 3: App shell

- [ ] Theme, fonts, RTL, login, session, root gates
- [ ] Inbox, fill, shifts, availability, profile
- [ ] Live track deep link + location pings

### Task 4: Verify + GitHub

- [ ] `:domain:test` and `:app:assembleDebug` if SDK present
- [ ] `gh repo create omrilandman/yahpaz-android --public` when asked or after local bootstrap works
